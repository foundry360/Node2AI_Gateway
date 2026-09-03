import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Simple middleware simulation
    const authHeader = request.headers.get('Authorization');
    const apiKey =
      authHeader?.replace('Bearer ', '') || request.headers.get('X-API-Key');

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'API key required',
          error: 'Missing Authorization header or X-API-Key',
        },
        { status: 401 }
      );
    }

    // Mock API key validation
    const validKeys = ['test-key-123', 'demo-key-456', 'admin-key-789'];
    if (!validKeys.includes(apiKey)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Invalid API key',
          error: 'API key not found or expired',
        },
        { status: 401 }
      );
    }

    // Mock organization and user data
    const mockAuth = {
      organizationId: 'org-123',
      userId: 'user-123',
      apiKeyId: 'key-123',
      role: 'admin',
    };

    return NextResponse.json({
      success: true,
      data: {
        message: 'Middleware test successful!',
        timestamp: new Date().toISOString(),
        auth: mockAuth,
        middleware: {
          authentication: '✅ Passed',
          rateLimit: '✅ Passed (simulated)',
          auditLog: '✅ Passed (simulated)',
          featureFlag: '✅ Passed (simulated)',
        },
        request: {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get('user-agent'),
          ip: request.headers.get('x-forwarded-for') || 'unknown',
        },
      },
      message: 'All middleware checks passed!',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Middleware test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Simple middleware simulation
    const authHeader = request.headers.get('Authorization');
    const apiKey =
      authHeader?.replace('Bearer ', '') || request.headers.get('X-API-Key');

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'API key required',
          error: 'Missing Authorization header or X-API-Key',
        },
        { status: 401 }
      );
    }

    // Mock API key validation
    const validKeys = ['test-key-123', 'demo-key-456', 'admin-key-789'];
    if (!validKeys.includes(apiKey)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Invalid API key',
          error: 'API key not found or expired',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: 'POST request processed with middleware',
        received: body,
        timestamp: new Date().toISOString(),
        auth: {
          organizationId: 'org-123',
          userId: 'user-123',
          role: 'admin',
        },
      },
      message: 'POST middleware test successful',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'POST middleware test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
