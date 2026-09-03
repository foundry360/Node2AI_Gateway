import { NextRequest, NextResponse } from 'next/server';
import {
  authMiddleware,
  requireRole,
  AuthenticatedRequest,
  withLicenseAuth,
} from '@/lib/middleware';

/**
 * GET /api/v1/admin-only
 * Admin-only endpoint that requires admin role and valid license
 */
export async function GET(request: NextRequest) {
  return withLicenseAuth(
    async (authRequest: AuthenticatedRequest) => {
      // Check admin role
      if (authRequest.auth?.role !== 'admin') {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Forbidden: Admin access required',
          },
          { status: 403 }
        );
      }

      // Include license info in response
      const licenseInfo = (authRequest as any).license;
      const licenseUsage = (authRequest as any).licenseUsage;

      try {
        const response = {
          success: true,
          data: {
            message: 'This is an admin-only endpoint',
            user_info: {
              id: authRequest.auth?.userId,
              organization_id: authRequest.auth?.organizationId,
              role: authRequest.auth?.role,
              auth_method: authRequest.auth?.authMethod,
            },
            license_info: licenseInfo
              ? {
                  tier: licenseInfo.tier,
                  maxSeats: licenseInfo.maxSeats,
                  maxApiCalls: licenseInfo.maxMonthlyApiCalls,
                }
              : null,
            license_usage: licenseUsage,
            admin_actions: [
              'manage_users',
              'manage_api_keys',
              'view_audit_logs',
              'configure_system',
              'manage_organizations',
            ],
          },
          message: 'Admin access granted',
        };

        return NextResponse.json(response);
      } catch (error: any) {
        console.error('Admin endpoint error:', error);
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Admin endpoint failed',
            error: error.message,
          },
          { status: 500 }
        );
      }
    },
    { checkApiLimit: false } // Admin actions don't count toward API limits
  )(request);
}

/**
 * POST /api/v1/admin-only
 * Admin-only endpoint for creating system configurations
 */
export async function POST(request: NextRequest) {
  return withLicenseAuth(
    async (authRequest: AuthenticatedRequest) => {
      // Check admin role
      if (authRequest.auth?.role !== 'admin') {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Forbidden: Admin access required',
          },
          { status: 403 }
        );
      }

      try {
        const body = await authRequest.json();

        // Simulate admin action
        const adminAction = {
          action: 'system_configuration',
          performed_by: authRequest.auth?.userId,
          organization_id: authRequest.auth?.organizationId,
          timestamp: new Date().toISOString(),
          data: body,
        };

        const response = {
          success: true,
          data: {
            message: 'Admin action completed successfully',
            action: adminAction,
            user_info: {
              id: authRequest.auth?.userId,
              organization_id: authRequest.auth?.organizationId,
              role: authRequest.auth?.role,
              auth_method: authRequest.auth?.authMethod,
            },
          },
          message: 'Admin action completed',
        };

        return NextResponse.json(response);
      } catch (error: any) {
        console.error('Admin action error:', error);
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Admin action failed',
            error: error.message,
          },
          { status: 500 }
        );
      }
    },
    { checkApiLimit: false } // Admin actions don't count toward API limits
  )(request);
}
