import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';
import {
  decryptProviderKey,
  generateEncryptionKey,
} from '@/lib/security/encryption';
import { OpenAIProvider } from '@/lib/providers/openai';
import { AnthropicProvider } from '@/lib/providers/anthropic';
import { GoogleProvider } from '@/lib/providers/google';
import { PerplexityProvider } from '@/lib/providers/perplexity';

/**
 * POST /api/v1/provider-keys/[id]/test
 * Test a provider key connection
 */
export async function POST(
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

    // Fetch the provider key from PostgreSQL
    const result = await query(
      `SELECT 
        id, 
        provider, 
        encrypted_key, 
        environment
      FROM provider_keys 
      WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Provider key not found',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const providerKey = result.rows[0];

    // Decrypt the API key
    const encryptionKey =
      process.env.PROVIDER_KEY_ENCRYPTION_KEY || generateEncryptionKey();

    if (!encryptionKey) {
      console.error('[Test Provider Key] Encryption key not configured');
      return NextResponse.json(
        {
          success: false,
          error: 'Encryption key not configured',
          code: 'CONFIG_ERROR',
        },
        { status: 500 }
      );
    }

    let apiKey: string;
    try {
      apiKey = decryptProviderKey(providerKey.encrypted_key, encryptionKey);
      if (!apiKey || apiKey.length === 0) {
        throw new Error('Decrypted key is empty');
      }
      console.log(
        '[Test Provider Key] API key decrypted successfully, length:',
        apiKey.length
      );
    } catch (decryptError: any) {
      console.error('[Test Provider Key] Decryption error:', decryptError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to decrypt provider key',
          code: 'DECRYPTION_ERROR',
          details:
            process.env.NODE_ENV === 'development'
              ? decryptError.message
              : undefined,
        },
        { status: 500 }
      );
    }

    // Create provider instance based on provider type
    let provider: any;
    switch (providerKey.provider) {
      case 'openai':
        provider = new OpenAIProvider(apiKey);
        break;
      case 'anthropic':
        provider = new AnthropicProvider(apiKey);
        break;
      case 'google':
        provider = new GoogleProvider(apiKey);
        break;
      case 'perplexity':
        provider = new PerplexityProvider(apiKey);
        break;
      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unsupported provider: ${providerKey.provider}`,
            code: 'UNSUPPORTED_PROVIDER',
          },
          { status: 400 }
        );
    }

    // Test the connection
    const startTime = Date.now();
    let testResult: any;

    try {
      console.log(
        '[Test Provider Key] Testing connection for provider:',
        providerKey.provider
      );
      console.log(
        '[Test Provider Key] API key decrypted:',
        !!apiKey,
        'Length:',
        apiKey?.length
      );

      // Test connection - this may throw or return false
      let isHealthy: boolean;
      try {
        isHealthy = await provider.testConnection();
      } catch (connError: any) {
        // If testConnection throws, that's the real error
        console.error(
          '[Test Provider Key] testConnection() threw error:',
          connError.message
        );
        throw new Error(`Provider connection failed: ${connError.message}`);
      }

      const latency = Date.now() - startTime;

      if (isHealthy) {
        testResult = {
          success: true,
          latency,
          models: provider.models || [],
          capabilities: provider.getCapabilities
            ? provider.getCapabilities()
            : {
                streaming: false,
                functionCalling: false,
                vision: false,
                embeddings: false,
              },
        };

        console.log('[Test Provider Key] Connection test successful');
      } else {
        // If testConnection returned false, provider didn't throw but connection failed
        throw new Error(
          'Provider connection test returned false - API key may be invalid or network error'
        );
      }
    } catch (testError: any) {
      const errorMessage = testError.message || 'Unknown error';
      console.error('[Test Provider Key] Connection test error:', errorMessage);
      console.error('[Test Provider Key] Error details:', {
        name: testError.name,
        message: testError.message,
        provider: providerKey.provider,
      });

      // Format user-friendly error message
      let userFriendlyError = errorMessage;
      if (
        errorMessage.includes('401') ||
        errorMessage.includes('Authorization Required')
      ) {
        userFriendlyError = `Invalid API key for ${providerKey.provider}. Please verify your API key is correct and has the proper format.`;
      }

      testResult = {
        success: false,
        error: userFriendlyError,
        details:
          process.env.NODE_ENV === 'development'
            ? {
                provider: providerKey.provider,
                errorType: testError.name,
                originalError: errorMessage,
              }
            : undefined,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        test_result: testResult,
      },
      message: testResult.success
        ? 'Provider key test successful'
        : 'Provider key test failed',
    });
  } catch (error: any) {
    console.error('Provider key test error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to test provider key',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
