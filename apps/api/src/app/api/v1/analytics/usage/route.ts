import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '7d';

    // Calculate date range
    const days =
      timeRange === '7d'
        ? 7
        : timeRange === '30d'
          ? 30
          : timeRange === '90d'
            ? 90
            : 365;
    const startDate = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();

    const orgResult = await query(
      'SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1'
    );

    const organizationId = orgResult.rows[0]?.id;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    const eventsResult = await query(
      `
        SELECT timestamp, cost, latency_ms, status, data_sanitized
        FROM usage_events
        WHERE organization_id = $1
          AND timestamp >= $2
        ORDER BY timestamp ASC
      `,
      [organizationId, startDate]
    );

    const events = eventsResult.rows;

    // Aggregate usage data
    const usageData = {
      totalRequests: events.length,
      totalCost: events.reduce(
        (sum, e) => sum + (e.cost !== null ? Number(e.cost) || 0 : 0),
        0
      ),
      avgLatency:
        events.length > 0
          ? events.reduce((sum, e) => sum + (e.latency_ms || 0), 0) /
            events.length
          : 0,
      successRate:
        events.length > 0
          ? (events.filter(e => e.status === 'success').length /
              events.length) *
            100
          : 0,
      sanitizationRate:
        events.length > 0
          ? (events.filter(e => e.data_sanitized).length / events.length) * 100
          : 0,
    };

    // Daily aggregation for trends
    const dailyStats = new Map<string, { requests: number; cost: number }>();

    events.forEach(event => {
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      const stats = dailyStats.get(date) || { requests: 0, cost: 0 };
      stats.requests++;
      stats.cost += event.cost !== null ? Number(event.cost) || 0 : 0;
      dailyStats.set(date, stats);
    });

    const usageTrends = Array.from(dailyStats.entries())
      .map(([date, stats]) => ({
        date,
        requests: stats.requests,
        cost: stats.cost,
        latency: 500, // Average latency per day (calculated in real implementation)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      data: {
        overview: usageData,
        usage_trends: usageTrends,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
