import { NextRequest, NextResponse } from 'next/server';
import { createLicenseDatabase } from '@node2ai/licensing';
import { authMiddleware } from '@/lib/middleware/auth';
import { AuthenticatedRequest } from '@/lib/middleware/auth';

/**
 * POST /api/v1/admin/license/[licenseKey]/revoke
 * Revoke a license
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

      await licenseDb.revokeLicense(licenseKey, reason);

      return NextResponse.json({
        success: true,
        data: {
          license_key: licenseKey,
          status: 'revoked',
          reason: reason || 'License revoked by administrator',
          revoked_at: new Date().toISOString(),
        },
        message: 'License revoked successfully',
      });
    } catch (error: any) {
      console.error('License revocation error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to revoke license',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
