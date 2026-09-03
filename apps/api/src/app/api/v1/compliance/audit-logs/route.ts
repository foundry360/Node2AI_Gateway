import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

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

    const auditLogsResult = await query(
      `
        SELECT
          al.id,
          al.user_id,
          al.action,
          al.resource_type,
          al.resource_id,
          al.ip_address,
          al.user_agent,
          al.severity,
          al.compliance_category,
          al.details,
          al.timestamp,
          u.email AS user_email,
          u.name AS user_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.organization_id = $1
        ORDER BY al.timestamp DESC
        LIMIT $2
      `,
      [organizationId, limit]
    );

    const formattedLogs = auditLogsResult.rows.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      user: log.user_email || log.user_name || 'Unknown',
      action: log.action,
      resource: log.resource_type,
      ip_address: log.ip_address || 'N/A',
      status:
        log.severity === 'error' || log.severity === 'critical'
          ? ('failure' as const)
          : ('success' as const),
      details: JSON.stringify(log.details || {}),
    }));

    return NextResponse.json({
      success: true,
      data: {
        audit_logs: formattedLogs,
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
