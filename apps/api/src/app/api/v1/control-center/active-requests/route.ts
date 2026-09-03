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

      const currentResult = await query(
        `
        SELECT COUNT(*)::int AS count
        FROM usage_events
        WHERE organization_id = $1
          AND timestamp >= NOW() - INTERVAL '1 minute'
      `,
        [organizationId]
      );

      const previousResult = await query(
        `
        SELECT COUNT(*)::int AS count
        FROM usage_events
        WHERE organization_id = $1
          AND timestamp >= NOW() - INTERVAL '2 minutes'
          AND timestamp < NOW() - INTERVAL '1 minute'
      `,
        [organizationId]
      );

      const current = currentResult.rows[0]?.count || 0;
      const previous = previousResult.rows[0]?.count || 0;
      const change = current - previous;

      const historyResult = await query(
        `
        WITH minutes AS (
          SELECT generate_series(
            date_trunc('minute', NOW()) - INTERVAL '9 minutes',
            date_trunc('minute', NOW()),
            INTERVAL '1 minute'
          ) AS minute
        ),
        counts AS (
          SELECT date_trunc('minute', timestamp) AS minute,
                 COUNT(*)::int AS count
          FROM usage_events
          WHERE organization_id = $1
            AND timestamp >= date_trunc('minute', NOW()) - INTERVAL '10 minutes'
          GROUP BY minute
        )
        SELECT COALESCE(counts.count, 0)::int AS count
        FROM minutes
        LEFT JOIN counts ON counts.minute = minutes.minute
        ORDER BY minutes.minute ASC
      `,
        [organizationId]
      );

      const history = historyResult.rows.map(row => row.count || 0);

      const activeRequests = {
        current,
        change,
        history,
      };

      return NextResponse.json({
        success: true,
        data: activeRequests,
        message: 'Active requests retrieved successfully',
      });
    } catch (error: any) {
      console.error('Active requests error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve active requests',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
