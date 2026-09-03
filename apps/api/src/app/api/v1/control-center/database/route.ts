import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      // TODO: Query actual database connection pool stats
      // For now, return mock data
      const database = {
        connections: { active: 45, max: 100 },
        avgQueryTime: 12,
        status: 'healthy',
      };

      return NextResponse.json({
        success: true,
        data: database,
        message: 'Database status retrieved successfully',
      });
    } catch (error: any) {
      console.error('Database status error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve database status',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
