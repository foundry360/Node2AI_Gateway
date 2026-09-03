import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { login } from '@/lib/auth/native-auth';

// Simple API response helper (replacing @node2/shared)
function createApiResponse(
  data: any,
  success = true,
  message = '',
  error?: string
) {
  return {
    success,
    data,
    message,
    error,
  };
}

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, rememberMe } = loginSchema.parse(body);

    try {
      const result = await login(email, password);

      const authResponse = {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          permissions: [
            { resource: 'users', actions: ['read', 'write', 'delete'] },
            { resource: 'models', actions: ['read', 'write', 'delete'] },
            { resource: 'sanitization', actions: ['read', 'write', 'delete'] },
            { resource: 'compliance', actions: ['read', 'write', 'delete'] },
          ],
          tenantId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          isActive: true,
        },
        token: result.token,
        refreshToken: result.token,
        expiresIn: rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60,
      };

      return NextResponse.json(createApiResponse(authResponse));
    } catch (error) {
      return NextResponse.json(
        createApiResponse(
          null,
          false,
          'Invalid credentials',
          error instanceof Error ? error.message : 'Authentication failed'
        ),
        { status: 401 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createApiResponse(
          null,
          false,
          'Validation failed',
          error.errors.map(e => e.message).join(', ')
        ),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createApiResponse(
        null,
        false,
        'Login failed',
        error instanceof Error ? error.message : 'Unknown error'
      ),
      { status: 500 }
    );
  }
}
