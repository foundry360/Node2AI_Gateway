import { NextRequest, NextResponse } from 'next/server';
import { createLicenseDatabase } from '@node2ai/licensing';
import { authMiddleware } from '@/lib/middleware/auth';
import { AuthenticatedRequest } from '@/lib/middleware/auth';

/**
 * POST /api/v1/admin/license/[licenseKey]/suspend
 * Suspend a license
 */
export async function POST(
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
      const body = await request.json().catch(() => ({}));
      const { reason } = body;

      const licenseDb = createLicenseDatabase({
        connectionString: process.env.DATABASE_URL,
      });

      await licenseDb.suspendLicense(licenseKey, reason);

      return NextResponse.json({
        success: true,
        data: {
          license_key: licenseKey,
          status: 'suspended',
          reason: reason || 'License suspended by administrator',
          suspended_at: new Date().toISOString(),
        },
        message: 'License suspended successfully',
      });
    } catch (error: any) {
      console.error('License suspension error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to suspend license',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
