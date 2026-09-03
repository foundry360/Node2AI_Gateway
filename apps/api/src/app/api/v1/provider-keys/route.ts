import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { AuditService } from '@/services/audit.service';

const auditService = new AuditService();

/**
 * GET /api/v1/provider-keys
 * List provider keys for the organization from PostgreSQL
 */
export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      // Get organization ID from auth
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001';
      console.log('Organization ID:', organizationId);

      // Fetch provider keys from PostgreSQL
      const result = await query(
        `SELECT 
          id, 
          organization_id, 
          provider, 
          encrypted_key, 
          environment, 
          key_metadata, 
          is_active, 
          created_at, 
          updated_at
        FROM provider_keys 
        WHERE organization_id = $1
        ORDER BY created_at DESC`,
        [organizationId]
      );

      const providerKeys = result.rows;
      console.log('Provider keys from PostgreSQL:', providerKeys.length);

      // Calculate statistics
      const stats = {
        totalKeys: providerKeys.length || 0,
        activeKeys: providerKeys.filter((k: any) => k.is_active).length || 0,
        inactiveKeys: providerKeys.filter((k: any) => !k.is_active).length || 0,
        providers: {
          openai:
            providerKeys.filter((k: any) => k.provider === 'openai').length ||
            0,
          anthropic:
            providerKeys.filter((k: any) => k.provider === 'anthropic')
              .length || 0,
          google:
            providerKeys.filter((k: any) => k.provider === 'google').length ||
            0,
          perplexity:
            providerKeys.filter((k: any) => k.provider === 'perplexity')
              .length || 0,
        },
      };

      // Format the response
      const formattedKeys = providerKeys.map((key: any) => ({
        id: key.id,
        provider: key.provider,
        environment: key.environment || 'production',
        keyMetadata: key.key_metadata || {},
        isActive: key.is_active,
        createdAt: key.created_at,
        updatedAt: key.updated_at,
        encryptedKey: key.encrypted_key
          ? key.encrypted_key.substring(0, 20) + '...'
          : '',
      }));

      return NextResponse.json({
        success: true,
        data: {
          provider_keys: formattedKeys,
          statistics: stats,
          total_count: formattedKeys.length,
        },
        message: 'Provider keys retrieved successfully',
      });
    } catch (error: any) {
      console.error('Provider key listing error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve provider keys',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/provider-keys
 * Create a new provider key with encryption
 */
export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await request.json();
      const { provider, apiKey, environment, keyMetadata } = body;

      // Validate required fields
      if (!provider || !apiKey) {
        return NextResponse.json(
          {
            success: false,
            error: 'Provider and API key are required',
            code: 'VALIDATION_ERROR',
          },
          { status: 400 }
        );
      }

      // Get organization ID from auth
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001';
      const actorId = authRequest.auth?.userId;
      console.log('Organization ID retrieved:', organizationId);

      // Encrypt the API key
      const { encryptProviderKey, generateEncryptionKey } = await import(
        '@/lib/security/encryption'
      );
      const encryptionKey =
        process.env.PROVIDER_KEY_ENCRYPTION_KEY || generateEncryptionKey();
      console.log('Encryption key available:', !!encryptionKey);
      const encryptedKey = encryptProviderKey(apiKey, encryptionKey);
      console.log('API key encrypted successfully');

      // Insert into PostgreSQL
      const result = await query(
        `INSERT INTO provider_keys (
          organization_id, 
          provider, 
          encrypted_key, 
          environment, 
          key_metadata, 
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (organization_id, provider) 
        DO UPDATE SET 
          encrypted_key = EXCLUDED.encrypted_key,
          environment = EXCLUDED.environment,
          key_metadata = EXCLUDED.key_metadata,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING id, provider, environment, key_metadata, is_active, created_at, updated_at`,
        [
          organizationId,
          provider,
          encryptedKey,
          environment || 'production',
          keyMetadata || {},
          true,
        ]
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to save provider key to database');
      }

      const newProviderKey = result.rows[0];
      console.log('Provider key saved successfully:', newProviderKey.id);

      // Log audit event
      try {
        await auditService.log({
          eventType: 'provider_key_created',
          eventCategory: 'configuration',
          actorId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          action: 'create',
          resourceType: 'provider_key',
          resourceId: newProviderKey.id,
          organizationId,
          description: `Provider key for ${provider} created/updated`,
          metadata: {
            provider_key_id: newProviderKey.id,
            provider,
            environment: environment || 'production',
            was_update: result.rows[0] ? true : false,
          },
          status: 'success',
          securityLevel: 'high',
        });
      } catch (auditError) {
        console.error(
          '[Provider Keys API] Failed to log audit event:',
          auditError
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          provider_key: {
            id: newProviderKey.id,
            provider: newProviderKey.provider,
            environment: newProviderKey.environment || 'production',
            keyMetadata: newProviderKey.key_metadata || {},
            isActive: newProviderKey.is_active,
            createdAt: newProviderKey.created_at,
            updatedAt: newProviderKey.updated_at,
            encryptedKey: '***encrypted***',
          },
        },
        message: 'Provider key created successfully',
      });
    } catch (error: any) {
      console.error('Provider key creation error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to create provider key',
          error: error.message,
          details:
            process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
        { status: 500 }
      );
    }
  });
}
