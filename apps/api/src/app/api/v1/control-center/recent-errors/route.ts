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

      const errorsResult = await query(
        `
        SELECT timestamp, error_message, request_id
        FROM usage_events
        WHERE organization_id = $1
          AND status = 'error'
          AND timestamp >= NOW() - INTERVAL '15 minutes'
        ORDER BY timestamp DESC
        LIMIT 10
      `,
        [organizationId]
      );

      const errors = {
        errors: errorsResult.rows.map(error => ({
          timestamp: error.timestamp,
          severity: 'error' as const,
          message: error.error_message || 'Unknown error',
          organizationId,
          requestId: error.request_id || 'unknown',
        })),
      };

      return NextResponse.json({
        success: true,
        data: errors,
        message: 'Recent errors retrieved successfully',
      });
    } catch (error: any) {
      console.error('Recent errors error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve recent errors',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
