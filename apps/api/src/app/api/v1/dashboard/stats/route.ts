import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';

export async function GET(request: NextRequest) {
  try {
    // Get organization ID (use first one for now)
    const orgResult = await query(
      'SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1'
    );

    const orgId = orgResult.rows[0]?.id;

    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    const [usersResult, apiKeysResult, usageEventsResult] = await Promise.all([
      query(
        `
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE organization_id = $1
            AND is_active = true
        `,
        [orgId]
      ),
      query(
        `
          SELECT COUNT(*)::int AS count
          FROM api_keys
          WHERE organization_id = $1
            AND is_active = true
        `,
        [orgId]
      ),
      query(
        `
          SELECT COUNT(*)::int AS count
          FROM usage_events
          WHERE organization_id = $1
            AND timestamp >= NOW() - INTERVAL '24 hours'
        `,
        [orgId]
      ),
    ]);

    const stats = {
      users: usersResult.rows[0]?.count || 0,
      apiKeys: apiKeysResult.rows[0]?.count || 0,
      apiCallsToday: usageEventsResult.rows[0]?.count || 0,
      sanitizationRules: 24,
    };

    return NextResponse.json({
      success: true,
      data: {
        stats,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
