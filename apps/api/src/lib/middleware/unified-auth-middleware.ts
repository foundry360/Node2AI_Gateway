/**
 * Unified Auth Middleware
 * Validates session tokens and provides auth context
 */

import { NextRequest } from 'next/server';
import UnifiedAuthService from '../services/unified-auth.service';
import { AuthContext } from '../types/auth.types';

/**
 * Authenticate request and return auth context
 * Returns null if authentication fails
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthContext | null> {
  try {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');

    const authService = new UnifiedAuthService();
    const authContext = await authService.validateSession(token);

    return authContext;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

/**
 * Middleware function that can be used in route handlers
 * Returns 401 if not authenticated
 */
export function requireAuth() {
  return async (request: NextRequest) => {
    const authContext = await authenticateRequest(request);

    if (!authContext) {
      return {
        error: 'Unauthorized',
        status: 401,
      };
    }

    return { authContext };
  };
}
