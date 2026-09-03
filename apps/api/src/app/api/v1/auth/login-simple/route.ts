import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple login endpoint for testing (no rate limiting)
 * This is for development/testing purposes only
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Simple validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Mock authentication for testing
    if (email === 'admin@node2ai.ai' && password === 'admin123') {
      const mockUser = {
        id: '1',
        email: 'admin@node2ai.ai',
        name: 'Admin User',
        role: 'admin',
        permissions: ['*'],
        organizationId: 'org-1',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockToken = `mock-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return NextResponse.json({
        success: true,
        user: mockUser,
        token: mockToken,
        expiresIn: 3600,
        tokenType: 'Bearer',
      });
    }

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
