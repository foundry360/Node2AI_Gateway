import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { AuditService } from '@/services/audit.service';

const auditService = new AuditService();

/**
 * GET /api/v1/provider-keys/[id]
 * Get a specific provider key from PostgreSQL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { id } = params;
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001';

      // Fetch from PostgreSQL
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
      WHERE id = $1 AND organization_id = $2`,
        [id, organizationId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Provider key not found',
            error: 'Provider key not found',
          },
          { status: 404 }
        );
      }

      const providerKey = result.rows[0];

      return NextResponse.json({
        success: true,
        data: {
          provider_key: {
            id: providerKey.id,
            provider: providerKey.provider,
            environment: providerKey.environment || 'production',
            keyMetadata: providerKey.key_metadata || {},
            isActive: providerKey.is_active,
            createdAt: providerKey.created_at,
            updatedAt: providerKey.updated_at,
            encryptedKey: providerKey.encrypted_key
              ? providerKey.encrypted_key.substring(0, 20) + '...'
              : '',
          },
        },
        message: 'Provider key retrieved successfully',
      });
    } catch (error: any) {
      console.error('Provider key retrieval error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve provider key',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/provider-keys/[id]
 * Update a provider key in PostgreSQL
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { id } = params;
      const body = await request.json();
      const { apiKey, keyMetadata, isActive, environment } = body;
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001';
      const actorId = authRequest.auth?.userId;

      // Get existing key for audit metadata
      const existingKeyResult = await query(
        `SELECT provider, environment, is_active FROM provider_keys WHERE id = $1 AND organization_id = $2`,
        [id, organizationId]
      );
      const existingKey = existingKeyResult.rows[0];

      // Build update fields
      const updates: string[] = [];
      const params_list: any[] = [];
      let paramIndex = 1;

      // Encrypt new API key if provided
      if (apiKey) {
        const { encryptProviderKey, generateEncryptionKey } = await import(
          '@/lib/security/encryption'
        );
        const encryptionKey =
          process.env.PROVIDER_KEY_ENCRYPTION_KEY || generateEncryptionKey();
        const encryptedKey = encryptProviderKey(apiKey, encryptionKey);
        updates.push(`encrypted_key = $${paramIndex}`);
        params_list.push(encryptedKey);
        paramIndex++;
      }

      if (keyMetadata !== undefined) {
        updates.push(`key_metadata = $${paramIndex}`);
        params_list.push(keyMetadata); // pg library handles JSONB conversion
        paramIndex++;
      }

      if (isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        params_list.push(isActive);
        paramIndex++;
      }

      if (environment !== undefined) {
        updates.push(`environment = $${paramIndex}`);
        params_list.push(environment);
        paramIndex++;
      }

      if (updates.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No fields to update',
          },
          { status: 400 }
        );
      }

      updates.push(`updated_at = NOW()`);
      params_list.push(id, organizationId);

      // Update in PostgreSQL
      const result = await query(
        `UPDATE provider_keys 
         SET ${updates.join(', ')} 
         WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
         RETURNING id, provider, environment, key_metadata, is_active, created_at, updated_at`,
        params_list
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Provider key not found',
          },
          { status: 404 }
        );
      }

      const updatedProviderKey = result.rows[0];

      // Log audit event
      try {
        await auditService.log({
          eventType: 'provider_key_updated',
          eventCategory: 'configuration',
          actorId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          action: 'update',
          resourceType: 'provider_key',
          resourceId: id,
          organizationId,
          description: `Provider key for ${updatedProviderKey.provider} updated`,
          metadata: {
            provider_key_id: id,
            provider: updatedProviderKey.provider,
            changes: {
              environment: environment !== undefined,
              is_active: isActive !== undefined,
              key_updated: apiKey !== undefined,
            },
            previous_state: existingKey
              ? {
                  environment: existingKey.environment,
                  is_active: existingKey.is_active,
                }
              : undefined,
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
            id: updatedProviderKey.id,
            provider: updatedProviderKey.provider,
            environment: updatedProviderKey.environment || 'production',
            keyMetadata: updatedProviderKey.key_metadata || {},
            isActive: updatedProviderKey.is_active,
            createdAt: updatedProviderKey.created_at,
            updatedAt: updatedProviderKey.updated_at,
            encryptedKey: '***encrypted***',
          },
        },
        message: 'Provider key updated successfully',
      });
    } catch (error: any) {
      console.error('Provider key update error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to update provider key',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/provider-keys/[id]
 * Delete a provider key from PostgreSQL
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { id } = params;
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001';
      const actorId = authRequest.auth?.userId;

      // Get existing key for audit metadata
      const existingKeyResult = await query(
        `SELECT provider, environment FROM provider_keys WHERE id = $1 AND organization_id = $2`,
        [id, organizationId]
      );
      const existingKey = existingKeyResult.rows[0];

      // Delete from PostgreSQL
      const result = await query(
        `DELETE FROM provider_keys 
         WHERE id = $1 AND organization_id = $2
         RETURNING id`,
        [id, organizationId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Provider key not found',
          },
          { status: 404 }
        );
      }

      // Log audit event
      try {
        await auditService.log({
          eventType: 'provider_key_deleted',
          eventCategory: 'configuration',
          actorId,
          actorType: 'user',
          actorEmail: authRequest.auth?.email,
          action: 'delete',
          resourceType: 'provider_key',
          resourceId: id,
          organizationId,
          description: `Provider key for ${existingKey?.provider || 'unknown'} deleted`,
          metadata: {
            provider_key_id: id,
            deleted_provider: existingKey?.provider,
            deleted_environment: existingKey?.environment,
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
        data: null,
        message: 'Provider key deleted successfully',
      });
    } catch (error: any) {
      console.error('Provider key deletion error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to delete provider key',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
