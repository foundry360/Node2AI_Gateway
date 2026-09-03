import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      // TODO: Get from Redis queue or processing queue
      // For now, return mock data
      const queue = {
        depth: 3,
        status: 'normal' as const,
        maxDepth: 100,
      };

      return NextResponse.json({
        success: true,
        data: queue,
        message: 'Queue depth retrieved successfully',
      });
    } catch (error: any) {
      console.error('Queue depth error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve queue depth',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
