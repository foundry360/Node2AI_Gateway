/**
 * GET /api/v1/audit/stats
 * Get audit statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { AuditService } from '../../../../../lib/audit/audit.service';

const auditService = new AuditService();

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { searchParams } = new URL(request.url);

      // Get organization ID from authenticated user
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001'; // Default org

      const startDate = searchParams.get('start_date')
        ? new Date(searchParams.get('start_date')!)
        : undefined;
      const endDate = searchParams.get('end_date')
        ? new Date(searchParams.get('end_date')!)
        : undefined;

      // Get statistics
      const stats = await auditService.getAuditStatistics(
        organizationId,
        startDate,
        endDate
      );

      return NextResponse.json({
        success: true,
        data: stats,
        message: 'Audit statistics retrieved successfully',
      });
    } catch (error: any) {
      console.error('Error getting audit statistics:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve audit statistics',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
