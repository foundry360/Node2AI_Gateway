/**
 * POST /api/v1/audit/export
 * Export audit logs in CSV or JSON format
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '../../../../../lib/audit/audit.service';
import { z } from 'zod';

const auditService = new AuditService();

const ExportRequestSchema = z.object({
  filters: z.object({
    page: z.number().optional(),
    perPage: z.number().optional(),
    status: z.string().optional(),
    provider: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    timeInterval: z.string().optional(),
    containsPii: z.boolean().optional(),
    containsPhi: z.boolean().optional(),
  }),
  format: z.enum(['csv', 'json']).default('json'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filters, format } = ExportRequestSchema.parse(body);

    // Convert frontend filters to service filters
    const serviceFilters: any = {};

    if (filters.status) {
      serviceFilters.status = filters.status as any;
    }
    if (filters.provider) {
      serviceFilters.provider = filters.provider as any;
    }
    if (filters.startDate) {
      serviceFilters.startDate = new Date(filters.startDate);
    }
    if (filters.endDate) {
      serviceFilters.endDate = new Date(filters.endDate);
    }
    if (filters.containsPii !== undefined) {
      serviceFilters.containsPii = filters.containsPii;
    }
    if (filters.containsPhi !== undefined) {
      serviceFilters.containsPhi = filters.containsPhi;
    }

    // Export logs with filters
    const data = await auditService.exportAuditLogs(serviceFilters, format);

    // Return as downloadable file
    const contentType = format === 'json' ? 'application/json' : 'text/csv';
    const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting audit logs:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to export audit logs',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
