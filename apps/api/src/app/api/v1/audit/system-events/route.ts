/**
 * GET /api/v1/audit/system-events
 * Get system events (security, admin actions)
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '25');
    const eventType = searchParams.get('event_type');
    const eventCategory = searchParams.get('event_category');
    const severity = searchParams.get('severity');
    const organizationId = searchParams.get('organization_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const offset = (page - 1) * perPage;

    const conditions: string[] = [];
    const params: any[] = [];

    const addCondition = (clause: string, value: any) => {
      params.push(value);
      conditions.push(`${clause} $${params.length}`);
    };

    if (eventType) addCondition('event_type =', eventType);
    if (eventCategory) addCondition('event_category =', eventCategory);
    if (severity) addCondition('severity =', severity);
    if (organizationId) addCondition('organization_id =', organizationId);
    if (startDate)
      addCondition('created_at >=', new Date(startDate).toISOString());
    if (endDate) addCondition('created_at <=', new Date(endDate).toISOString());

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const eventsResult = await query(
      `
        SELECT *
        FROM system_events
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, perPage, offset]
    );

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS count
        FROM system_events
        ${whereClause}
      `,
      params
    );

    const events = eventsResult.rows;
    const total = Number(countResult.rows[0]?.count ?? 0);

    return NextResponse.json({
      success: true,
      data: {
        events,
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      },
      message: 'System events retrieved successfully',
    });
  } catch (error: any) {
    console.error('Error getting system events:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve system events',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
