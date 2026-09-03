import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService } from '@/lib/organization/api-key-service';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { AuditService } from '@/services/audit.service';

// Initialize API key service (in a real app, this would be a singleton)
const apiKeyService = new ApiKeyService();
const auditService = new AuditService();

// Request validation schema
const UpdateApiKeySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  scopes: z.array(z.string()).min(1).optional(),
  rate_limit: z.number().min(1).optional(),
  expires_at: z
    .string()
    .datetime()
    .optional()
    .transform(str => (str ? new Date(str) : undefined)),
  is_active: z.boolean().optional(),
});

const RotateApiKeySchema = z.object({
  new_name: z.string().min(1, 'New name is required'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    const { keyId } = params;

    const apiKey = await apiKeyService.getApiKey(keyId);

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'API key not found',
          error: 'API key not found',
        },
        { status: 404 }
      );
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
      message: 'API key retrieved successfully',
    });
  } catch (error: any) {
    console.error('API key retrieval error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve API key',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { keyId } = params;
      const body = await request.json();
      const validatedData = UpdateApiKeySchema.parse(body);

      const actorId = authRequest.auth?.userId;
      const updatedBy = actorId || 'system';

      // Get existing key for audit metadata
      const existingKey = await apiKeyService.getApiKey(keyId);

      const apiKey = await apiKeyService.updateApiKey(
        keyId,
        validatedData,
        updatedBy
      );

      if (!apiKey) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'API key not found',
            error: 'API key not found',
          },
          { status: 404 }
        );
      }

      // Log audit event
      try {
        await auditService.log({
          eventType: 'api_key_updated',
          eventCategory: 'configuration',
          actorId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          action: 'update',
          resourceType: 'api_key',
          resourceId: keyId,
          organizationId:
            authRequest.auth?.organizationId || apiKey.organization_id,
          description: `API key "${existingKey?.name || keyId}" updated`,
          metadata: {
            api_key_id: keyId,
            changes: validatedData,
            previous_state: existingKey
              ? {
                  name: existingKey.name,
                  is_active: existingKey.is_active,
                  scopes: existingKey.scopes,
                }
              : undefined,
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
        message: 'API key updated successfully',
      });
    } catch (error: any) {
      console.error('API key update error:', error);

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
          message: 'API key update failed',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { keyId } = params;

      const actorId = authRequest.auth?.userId;
      const deletedBy = actorId || 'system';

      // Get existing key for audit metadata
      const existingKey = await apiKeyService.getApiKey(keyId);

      const deleted = await apiKeyService.deleteApiKey(keyId, deletedBy);

      if (!deleted) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'API key not found',
            error: 'API key not found',
          },
          { status: 404 }
        );
      }

      // Log audit event
      try {
        await auditService.log({
          eventType: 'api_key_deleted',
          eventCategory: 'configuration',
          actorId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          action: 'delete',
          resourceType: 'api_key',
          resourceId: keyId,
          organizationId:
            authRequest.auth?.organizationId || existingKey?.organization_id,
          description: `API key "${existingKey?.name || keyId}" deleted`,
          metadata: {
            api_key_id: keyId,
            deleted_key_name: existingKey?.name,
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
          deleted_api_key_id: keyId,
        },
        message: 'API key deleted successfully',
      });
    } catch (error: any) {
      console.error('API key deletion error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'API key deletion failed',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
