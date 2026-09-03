import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLicenseDatabase } from '@node2ai/licensing';
import { authMiddleware } from '@/lib/middleware/auth';
import { AuthenticatedRequest } from '@/lib/middleware/auth';

const updateExpirationSchema = z.object({
  expires_at: z.string().datetime(),
  reason: z.string().optional(),
});

/**
 * PATCH /api/v1/admin/license/[licenseKey]/expiration
 * Update license expiration date
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { licenseKey: string } }
) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      if (!authRequest.auth) {
        return NextResponse.json(
          { success: false, message: 'Authentication required' },
          { status: 401 }
        );
      }

      const { licenseKey } = params;
      const body = await request.json();
      const validated = updateExpirationSchema.parse(body);

      const licenseDb = createLicenseDatabase({
        connectionString: process.env.DATABASE_URL,
      });

      const newExpirationDate = new Date(validated.expires_at);
      await licenseDb.updateExpiration(
        licenseKey,
        newExpirationDate,
        validated.reason
      );

      return NextResponse.json({
        success: true,
        data: {
          license_key: licenseKey,
          expires_at: newExpirationDate.toISOString(),
          reason: validated.reason || 'Expiration date updated',
          updated_at: new Date().toISOString(),
        },
        message: 'License expiration updated successfully',
      });
    } catch (error: any) {
      console.error('License expiration update error:', error);
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Invalid request data',
            errors: error.errors,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to update license expiration',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
