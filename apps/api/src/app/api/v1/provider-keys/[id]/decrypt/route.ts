import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';
import {
  decryptProviderKey,
  generateEncryptionKey,
} from '@/lib/security/encryption';

/**
 * GET /api/v1/provider-keys/[id]/decrypt
 * Get the decrypted API key for a provider key
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authorization header missing or invalid',
          code: 'MISSING_AUTH',
        },
        { status: 401 }
      );
    }

    const { id } = params;
    const organizationId = '00000000-0000-0000-0000-000000000001';

    // Fetch from PostgreSQL
    const result = await query(
      `SELECT encrypted_key 
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

    // Decrypt the API key
    const encryptionKey =
      process.env.PROVIDER_KEY_ENCRYPTION_KEY || generateEncryptionKey();
    const decryptedKey = decryptProviderKey(
      providerKey.encrypted_key,
      encryptionKey
    );

    return NextResponse.json({
      success: true,
      data: {
        decryptedKey,
      },
      message: 'Provider key decrypted successfully',
    });
  } catch (error: any) {
    console.error('Provider key decryption error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to decrypt provider key',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
