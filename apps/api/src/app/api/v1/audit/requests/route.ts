/**
 * GET /api/v1/audit/requests
 * Query audit logs with filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { AuditService } from '../../../../../lib/audit/audit.service';
import { AIRequestStatus, AIProvider } from '@node2/shared';

const auditService = new AuditService();

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { searchParams } = new URL(request.url);

      // Get organization ID from authenticated user
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001'; // Default org

      // Parse query parameters
      const userId = searchParams.get('user_id');
      const apiKeyId = searchParams.get('api_key_id');
      const page = parseInt(searchParams.get('page') || '1');
      const perPage = parseInt(searchParams.get('per_page') || '25');
      const status = searchParams.get('status') as AIRequestStatus | null;
      const provider = searchParams.get('provider') as AIProvider | null;
      const model = searchParams.get('model');
      const containsPii = searchParams.get('contains_pii') === 'true';
      const containsPhi = searchParams.get('contains_phi') === 'true';
      const startDate = searchParams.get('start_date');
      const endDate = searchParams.get('end_date');

      // Build filters
      const filters: any = {
        page,
        perPage,
        organizationId, // Always use authenticated org
      };

      if (userId) filters.userId = userId;
      if (apiKeyId) filters.apiKeyId = apiKeyId;
      if (status) filters.status = status;
      if (provider) filters.provider = provider;
      if (model) filters.model = model;
      if (containsPii) filters.containsPii = true;
      if (containsPhi) filters.containsPhi = true;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      // Query audit logs
      const result = await auditService.queryAuditLogs(filters);

      return NextResponse.json({
        success: true,
        data: result,
        message: 'Audit logs retrieved successfully',
      });
    } catch (error: any) {
      console.error('Error querying audit logs:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve audit logs',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
