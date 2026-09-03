import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      // TODO: Query Redis cache stats
      // For now, return mock data
      const cache = {
        hitRate: 87,
        memory: { used: 512, total: 2048, unit: 'MB' as const },
        status: 'healthy',
      };

      return NextResponse.json({
        success: true,
        data: cache,
        message: 'Cache status retrieved successfully',
      });
    } catch (error: any) {
      console.error('Cache status error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve cache status',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
