import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      // TODO: Check provider health from actual providers
      // For now, return mock data
      const providers = {
        providers: [
          { name: 'OpenAI', status: 'healthy' as const, latency: 1200 },
          { name: 'Anthropic', status: 'healthy' as const, latency: 950 },
          { name: 'Google', status: 'healthy' as const, latency: 1100 },
          { name: 'Local LLM', status: 'down' as const, latency: null },
        ],
      };

      return NextResponse.json({
        success: true,
        data: providers,
        message: 'Provider status retrieved successfully',
      });
    } catch (error: any) {
      console.error('Provider status error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve provider status',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
