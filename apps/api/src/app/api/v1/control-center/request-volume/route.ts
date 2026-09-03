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

      const volumeResult = await query(
        `
        WITH minutes AS (
          SELECT generate_series(
            date_trunc('minute', NOW()) - INTERVAL '59 minutes',
            date_trunc('minute', NOW()),
            INTERVAL '1 minute'
          ) AS minute
        ),
        counts AS (
          SELECT date_trunc('minute', timestamp) AS minute,
                 COUNT(*)::int AS count
          FROM usage_events
          WHERE organization_id = $1
            AND timestamp >= date_trunc('minute', NOW()) - INTERVAL '60 minutes'
          GROUP BY minute
        )
        SELECT minutes.minute, COALESCE(counts.count, 0)::int AS count
        FROM minutes
        LEFT JOIN counts ON counts.minute = minutes.minute
        ORDER BY minutes.minute ASC
      `,
        [organizationId]
      );

      const data = volumeResult.rows.map(row => ({
        time: new Date(row.minute).toISOString(),
        count: row.count || 0,
      }));

      return NextResponse.json({
        success: true,
        data: { data },
        message: 'Request volume retrieved successfully',
      });
    } catch (error: any) {
      console.error('Request volume error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve request volume',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
