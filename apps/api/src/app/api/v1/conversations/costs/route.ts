import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { CostCalculator } from '@/lib/core/cost-calculator';

const costCalculator = new CostCalculator();

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001';

      const url = new URL(request.url);
      const conversationId = url.searchParams.get('conversation_id');

      // Get costs grouped by conversation and model
      const conversationCosts = await costCalculator.getConversationCosts(
        organizationId,
        conversationId || undefined
      );

      return NextResponse.json({
        success: true,
        data: {
          costs: conversationCosts,
          totalConversations: conversationId
            ? 1
            : new Set(conversationCosts.map(c => c.conversationId)).size,
          totalCost: conversationCosts.reduce((sum, c) => sum + c.totalCost, 0),
        },
        message: 'Conversation costs retrieved successfully',
      });
    } catch (error: any) {
      console.error('Error fetching conversation costs:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve conversation costs',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
