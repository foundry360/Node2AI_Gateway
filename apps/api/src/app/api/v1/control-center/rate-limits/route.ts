import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      // TODO: Query from rate_limiting table or Redis
      // For now, return mock data
      const rateLimits = {
        warnings: 2,
        blocked: 0,
        organizations: [
          { id: 'org_123', name: 'Acme Corp', usage: 95 },
          { id: 'org_456', name: 'Tech Inc', usage: 88 },
        ],
      };

      return NextResponse.json({
        success: true,
        data: rateLimits,
        message: 'Rate limits retrieved successfully',
      });
    } catch (error: any) {
      console.error('Rate limits error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve rate limits',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
