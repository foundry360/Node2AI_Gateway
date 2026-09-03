import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const organizationId = authRequest.auth?.organizationId;

      if (!organizationId) {
        return NextResponse.json(
          { error: 'No organization found' },
          { status: 404 }
        );
      }

      const orgResult = await query(
        `SELECT name FROM organizations WHERE id = $1 LIMIT 1`,
        [organizationId]
      );

      const activeRequestsResult = await query(
        `
        SELECT COUNT(*)::int AS count
        FROM usage_events
        WHERE organization_id = $1
          AND timestamp >= NOW() - INTERVAL '5 minutes'
      `,
        [organizationId]
      );

      const totalTodayResult = await query(
        `
        SELECT COUNT(*)::int AS count
        FROM usage_events
        WHERE organization_id = $1
          AND timestamp >= NOW() - INTERVAL '24 hours'
      `,
        [organizationId]
      );

      const lastActivityResult = await query(
        `
        SELECT timestamp
        FROM usage_events
        WHERE organization_id = $1
        ORDER BY timestamp DESC
        LIMIT 1
      `,
        [organizationId]
      );

      const organizationName = orgResult.rows[0]?.name || 'Organization';
      const activeRequests = activeRequestsResult.rows[0]?.count || 0;
      const totalToday = totalTodayResult.rows[0]?.count || 0;
      const lastActivity =
        lastActivityResult.rows[0]?.timestamp || new Date().toISOString();

      const sessions = {
        sessions: [
          {
            organizationId,
            organizationName,
            activeRequests,
            totalToday,
            lastActivity,
          },
        ],
      };

      return NextResponse.json({
        success: true,
        data: sessions,
        message: 'Active sessions retrieved successfully',
      });
    } catch (error: any) {
      console.error('Active sessions error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve active sessions',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
