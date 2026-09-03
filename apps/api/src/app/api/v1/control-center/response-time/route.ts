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

      const eventsResult = await query(
        `
        SELECT latency_ms
        FROM usage_events
        WHERE organization_id = $1
          AND timestamp >= NOW() - INTERVAL '1 hour'
        ORDER BY timestamp DESC
      `,
        [organizationId]
      );

      const events = eventsResult.rows;

      if (!events || events.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            current: 0,
            avg: 0,
            p95: 0,
            history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
          message: 'Response time retrieved successfully',
        });
      }

      // Calculate metrics
      const latencies = events.map(e => e.latency_ms || 0);
      const sorted = [...latencies].sort((a, b) => a - b);
      const current = latencies[0] || 0;
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95 = sorted[p95Index] || 0;

      const historyResult = await query(
        `
        WITH minutes AS (
          SELECT generate_series(
            date_trunc('minute', NOW()) - INTERVAL '9 minutes',
            date_trunc('minute', NOW()),
            INTERVAL '1 minute'
          ) AS minute
        ),
        averages AS (
          SELECT
            date_trunc('minute', timestamp) AS minute,
            AVG(latency_ms)::numeric AS avg_latency
          FROM usage_events
          WHERE organization_id = $1
            AND timestamp >= date_trunc('minute', NOW()) - INTERVAL '10 minutes'
          GROUP BY minute
        )
        SELECT minutes.minute,
               COALESCE(averages.avg_latency, 0) AS avg_latency
        FROM minutes
        LEFT JOIN averages ON averages.minute = minutes.minute
        ORDER BY minutes.minute ASC
      `,
        [organizationId]
      );

      const history = historyResult.rows.map(row =>
        Math.round(Number(row.avg_latency || 0))
      );

      const responseTime = {
        current: Math.round(current),
        avg: Math.round(avg),
        p95: Math.round(p95),
        history,
      };

      return NextResponse.json({
        success: true,
        data: responseTime,
        message: 'Response time retrieved successfully',
      });
    } catch (error: any) {
      console.error('Response time error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve response time',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
