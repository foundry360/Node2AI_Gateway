import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService } from '@/lib/organization/api-key-service';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { AuditService } from '@/services/audit.service';

// Initialize API key service (in a real app, this would be a singleton)
const apiKeyService = new ApiKeyService();
const auditService = new AuditService();

// Request validation schema
const CreateApiKeySchema = z.object({
  organization_id: z.string().min(1, 'Organization ID is required'),
  name: z.string().min(1, 'API key name is required'),
  description: z.string().optional(),
  scopes: z.array(z.string()).min(1, 'At least one scope is required'),
  rate_limit: z.number().min(1, 'Rate limit must be at least 1'),
  expires_at: z
    .string()
    .datetime()
    .optional()
    .transform(str => (str ? new Date(str) : undefined)),
});

export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    let validatedData: any = null;
    try {
      const body = await request.json();
      validatedData = CreateApiKeySchema.parse(body);

      const actorId = authRequest.auth?.userId;
      const organizationId =
        authRequest.auth?.organizationId || validatedData.organization_id;

      const apiKey = await apiKeyService.createApiKey({
        ...validatedData,
        created_by: actorId || 'system',
      });

      // Log audit event
      try {
        await auditService.log({
          eventType: 'api_key_created',
          eventCategory: 'configuration',
          actorId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          action: 'create',
          resourceType: 'api_key',
          resourceId: apiKey.id,
          organizationId,
          description: `API key "${apiKey.name}" created`,
          metadata: {
            api_key_id: apiKey.id,
            api_key_name: apiKey.name,
            scopes: apiKey.scopes,
            rate_limit: apiKey.rate_limit,
          },
          status: 'success',
          securityLevel: 'high',
        });
      } catch (auditError) {
        console.error('[API Keys API] Failed to log audit event:', auditError);
      }

      return NextResponse.json({
        success: true,
        data: {
          api_key: {
            id: apiKey.id,
            key: apiKey.key,
            organization_id: apiKey.organization_id,
            name: apiKey.name,
            description: apiKey.description,
            scopes: apiKey.scopes,
            rate_limit: apiKey.rate_limit,
            expires_at: apiKey.expires_at,
            last_used_at: apiKey.last_used_at,
            is_active: apiKey.is_active,
            created_at: apiKey.created_at,
            created_by: apiKey.created_by,
          },
        },
        message: 'API key created successfully',
      });
    } catch (error: any) {
      console.error('API key creation error:', error);

      // Log failed audit event
      try {
        await auditService.log({
          eventType: 'api_key_created',
          eventCategory: 'configuration',
          actorId: authRequest.auth?.userId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          action: 'create',
          resourceType: 'api_key',
          organizationId:
            authRequest.auth?.organizationId || validatedData?.organization_id,
          description: `Failed to create API key: ${error.message}`,
          status: 'failure',
          errorMessage: error.message,
          securityLevel: 'high',
        });
      } catch (auditError) {
        // Ignore audit logging errors
      }

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Invalid request data',
            error: error.errors
              .map(e => `${e.path.join('.')}: ${e.message}`)
              .join(', '),
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'API key creation failed',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const organizationId =
        searchParams.get('organization_id') || authRequest.auth?.organizationId;

      if (!organizationId) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Organization ID is required',
            error: 'Missing organization_id parameter',
          },
          { status: 400 }
        );
      }

      const apiKeys = await apiKeyService.listApiKeys(organizationId);
      const stats = await apiKeyService.getApiKeyStats(organizationId);

      return NextResponse.json({
        success: true,
        data: {
          api_keys: apiKeys.map(key => ({
            id: key.id,
            key: key.key.substring(0, 20) + '...', // Mask the key for security
            organization_id: key.organization_id,
            name: key.name,
            description: key.description,
            scopes: key.scopes,
            rate_limit: key.rate_limit,
            expires_at: key.expires_at,
            last_used_at: key.last_used_at,
            is_active: key.is_active,
            created_at: key.created_at,
            created_by: key.created_by,
          })),
          statistics: stats,
          total_count: apiKeys.length,
        },
        message: 'API keys retrieved successfully',
      });
    } catch (error: any) {
      console.error('API key listing error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve API keys',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
