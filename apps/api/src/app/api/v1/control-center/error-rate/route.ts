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

      const totals = await query(
        `
        SELECT
          SUM(CASE WHEN timestamp >= NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END)::int AS total_last_hour,
          SUM(CASE WHEN timestamp >= NOW() - INTERVAL '1 hour' AND status = 'error' THEN 1 ELSE 0 END)::int AS error_last_hour,
          SUM(CASE WHEN timestamp >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END)::int AS total_last_24h,
          SUM(CASE WHEN timestamp >= NOW() - INTERVAL '24 hours' AND status = 'error' THEN 1 ELSE 0 END)::int AS error_last_24h
        FROM usage_events
        WHERE organization_id = $1
      `,
        [organizationId]
      );

      const totalLastHour = totals.rows[0]?.total_last_hour || 0;
      const errorLastHour = totals.rows[0]?.error_last_hour || 0;
      const totalLast24h = totals.rows[0]?.total_last_24h || 0;
      const errorLast24h = totals.rows[0]?.error_last_24h || 0;

      const rate = totalLastHour
        ? ((errorLastHour || 0) / totalLastHour) * 100
        : 0;
      const last24h = totalLast24h
        ? ((errorLast24h || 0) / totalLast24h) * 100
        : 0;
      const trend = rate < last24h ? 'down' : 'up';

      const errorRate = {
        rate: parseFloat(rate.toFixed(2)),
        trend,
        last24h: parseFloat(last24h.toFixed(2)),
      };

      return NextResponse.json({
        success: true,
        data: errorRate,
        message: 'Error rate retrieved successfully',
      });
    } catch (error: any) {
      console.error('Error rate error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve error rate',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
