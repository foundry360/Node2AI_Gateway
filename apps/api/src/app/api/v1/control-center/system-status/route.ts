import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      // TODO: Query from database for actual system status
      // For now, return mock data

      const systemStatus = {
        status: 'healthy' as const,
        uptime: 99.98,
        version: '1.0.0',
        lastCheck: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        data: systemStatus,
        message: 'System status retrieved successfully',
      });
    } catch (error: any) {
      console.error('System status error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve system status',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
