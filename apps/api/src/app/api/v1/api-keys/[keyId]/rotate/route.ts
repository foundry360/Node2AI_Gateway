import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService } from '@/lib/organization/api-key-service';
import { z } from 'zod';

// Initialize API key service (in a real app, this would be a singleton)
const apiKeyService = new ApiKeyService();

// Request validation schema
const RotateApiKeySchema = z.object({
  new_name: z.string().min(1, 'New name is required'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    const { keyId } = params;
    const body = await request.json();
    const validatedData = RotateApiKeySchema.parse(body);

    // Get user ID from auth context (mock for now)
    const rotatedBy = 'admin-user-123';

    const result = await apiKeyService.rotateApiKey(
      keyId,
      validatedData.new_name,
      rotatedBy
    );

    if (!result) {
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
        old_key: {
          id: result.oldKey.id,
          name: result.oldKey.name,
          is_active: result.oldKey.is_active,
          created_at: result.oldKey.created_at,
        },
        new_key: {
          id: result.newKey.id,
          key: result.newKey.key,
          name: result.newKey.name,
          description: result.newKey.description,
          scopes: result.newKey.scopes,
          rate_limit: result.newKey.rate_limit,
          expires_at: result.newKey.expires_at,
          is_active: result.newKey.is_active,
          created_at: result.newKey.created_at,
          created_by: result.newKey.created_by,
        },
      },
      message: 'API key rotated successfully',
    });
  } catch (error: any) {
    console.error('API key rotation error:', error);

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
        message: 'API key rotation failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
