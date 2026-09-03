import { NextRequest, NextResponse } from 'next/server';
import { createLicenseDatabase } from '@node2ai/licensing';
import { authMiddleware } from '@/lib/middleware/auth';
import { AuthenticatedRequest } from '@/lib/middleware/auth';

/**
 * POST /api/v1/admin/license/[licenseKey]/reactivate
 * Reactivate a suspended or revoked license
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

      const licenseDb = createLicenseDatabase({
        connectionString: process.env.DATABASE_URL,
      });

      await licenseDb.reactivateLicense(licenseKey);

      return NextResponse.json({
        success: true,
        data: {
          license_key: licenseKey,
          status: 'active',
          reactivated_at: new Date().toISOString(),
        },
        message: 'License reactivated successfully',
      });
    } catch (error: any) {
      console.error('License reactivation error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to reactivate license',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
