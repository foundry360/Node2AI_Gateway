/**
 * Get Current User Endpoint
 * GET /api/v1/auth-unified/me
 * Returns current authenticated user information
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/middleware/unified-auth-middleware';

export async function GET(request: NextRequest) {
  try {
    // Authenticate request to get user context
    const authContext = await authenticateRequest(request);

    if (!authContext) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: authContext.user.id,
          email: authContext.user.email,
          full_name: authContext.user.full_name,
          display_name: authContext.user.display_name,
          user_type: authContext.user.user_type,
          role: authContext.user.role,
          department: authContext.user.department,
          last_login_at: authContext.user.last_login_at,
        },
        customer: {
          id: authContext.customer.id,
          name: authContext.customer.name,
          subscription_tier: authContext.customer.subscription_tier,
        },
      },
      message: 'User information retrieved successfully',
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to get user',
      },
      { status: 500 }
    );
  }
}
