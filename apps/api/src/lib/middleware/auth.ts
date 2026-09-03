import { NextRequest, NextResponse } from 'next/server';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { query } from '@/lib/db/postgres-client';
import { verifyToken as verifyNativeToken } from '@/lib/auth/native-auth';
import { authenticateRequest } from './unified-auth-middleware';
import { AuditService } from '@/services/audit.service';

const auditService = new AuditService();

export interface AuthContext {
  organizationId: string;
  userId?: string; // Admin portal user (for JWT auth)
  email?: string; // User email
  apiKeyId?: string; // API key used for authentication
  endUserId?: string; // End user ID from customer's front-end (X-User-ID header)
  endUserEmail?: string; // End user email from customer's front-end (X-User-Email header)
  role: 'admin' | 'developer' | 'viewer' | 'auditor';
  authMethod: 'jwt' | 'api_key' | 'bearer_token';
  permissions?: string[];
}

export interface AuthenticatedRequest extends NextRequest {
  auth?: AuthContext;
}

export interface JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Main authentication middleware supporting both JWT and API key authentication
 */
export async function authMiddleware(
  request: NextRequest,
  next: (request: AuthenticatedRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Development mode: bypass authentication if SKIP_AUTH is set
    if (process.env.SKIP_AUTH === 'true') {
      console.log('[AuthMiddleware] SKIP_AUTH=true, bypassing authentication');
      const authRequest = request as AuthenticatedRequest;
      const endUserId = request.headers.get('X-User-ID');
      const endUserEmail = request.headers.get('X-User-Email');

      authRequest.auth = {
        organizationId: '00000000-0000-0000-0000-000000000001',
        userId: '8088ac02-36c2-4e71-bea3-2ad2f71bdf7c', // Use real admin user ID
        email: 'jadams@gmail.com',
        role: 'admin',
        authMethod: 'jwt',
        permissions: [],
        endUserId: endUserId || undefined,
        endUserEmail: endUserEmail || undefined,
      };
      return next(authRequest);
    }

    console.log(
      '[AuthMiddleware] Authentication required, checking credentials...'
    );

    // Extract credentials from headers
    const authHeader = request.headers.get('Authorization');
    const apiKeyHeader = request.headers.get('X-API-Key');

    console.log(
      '[AuthMiddleware] Auth header:',
      authHeader ? 'Present' : 'Missing'
    );
    console.log(
      '[AuthMiddleware] API key header:',
      apiKeyHeader ? 'Present' : 'Missing'
    );

    let authContext: AuthContext | null = null;

    // Try authentication methods in order
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');

      // 1. Try unified auth session token first
      try {
        const unifiedAuthContext = await authenticateRequest(request);
        if (
          unifiedAuthContext &&
          unifiedAuthContext.user &&
          unifiedAuthContext.customer
        ) {
          // Convert unified auth context to legacy AuthContext format
          // Get organization_id from customer or from user
          const orgId =
            unifiedAuthContext.customer.organization_id ||
            (unifiedAuthContext.user as any).organization_id ||
            '00000000-0000-0000-0000-000000000001';

          authContext = {
            organizationId: orgId,
            userId: unifiedAuthContext.user.id,
            email: unifiedAuthContext.user.email,
            role: (unifiedAuthContext.user.role || 'admin') as
              | 'admin'
              | 'developer'
              | 'viewer'
              | 'auditor',
            authMethod: 'bearer_token',
            permissions: [],
          };

          console.log('[AuthMiddleware] ✅ Unified auth session validated:', {
            userId: authContext.userId,
            email: authContext.email,
            organizationId: authContext.organizationId,
          });
        }
      } catch (unifiedError) {
        // Continue to other auth methods if unified auth fails
        console.log(
          '[AuthMiddleware] Unified auth failed, trying other methods:',
          unifiedError
        );
      }

      // 2. If unified auth didn't work, try native JWT token
      if (!authContext) {
        try {
          const nativeAuth = await verifyNativeToken(token);

          authContext = {
            organizationId: nativeAuth.organizationId,
            userId: nativeAuth.userId,
            email: nativeAuth.email,
            role: (nativeAuth.role || 'viewer') as
              | 'admin'
              | 'developer'
              | 'viewer'
              | 'auditor',
            authMethod: 'jwt',
            permissions: [],
          };

          console.log('[AuthMiddleware] ✅ Native auth token validated:', {
            userId: authContext.userId,
            email: authContext.email,
            organizationId: authContext.organizationId,
          });
        } catch (nativeError) {
          console.log(
            '[AuthMiddleware] Native auth token validation failed:',
            nativeError instanceof Error ? nativeError.message : nativeError
          );
        }
      }

      // 3. If native auth didn't work, try legacy custom JWT
      if (!authContext) {
        authContext = await validateJWT(token);
      }
    }
    // Try API key authentication
    else if (apiKeyHeader) {
      authContext = await validateApiKey(apiKeyHeader);
    }

    if (!authContext) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Authentication required',
          error: 'Missing or invalid Authorization header or X-API-Key',
        },
        { status: 401 }
      );
    }

    // Extract end-user identifier from headers (for customer's front-end apps)
    // This allows tracking which end-user is making the request
    const endUserId = request.headers.get('X-User-ID');
    const endUserEmail = request.headers.get('X-User-Email');

    if (endUserId || endUserEmail) {
      authContext.endUserId = endUserId || undefined;
      authContext.endUserEmail = endUserEmail || undefined;
    }

    // Add auth context to request
    const authRequest = request as AuthenticatedRequest;
    authRequest.auth = authContext;

    // Call the next handler
    const response = await next(authRequest);

    return response;
  } catch (error) {
    console.error('Authentication error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Authentication failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Validate JWT token
 */
async function validateJWT(token: string): Promise<AuthContext | null> {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    // Verify and decode JWT
    const payload = jwt.verify(token, jwtSecret) as JWTPayload;

    if (!payload.userId || !payload.organizationId || !payload.role) {
      return null;
    }

    // Check if user still exists and is active
    const userResult = await query(
      `SELECT id, organization_id, role, is_active
       FROM users 
       WHERE id = $1 
         AND organization_id = $2 
         AND is_active = true 
       LIMIT 1`,
      [payload.userId, payload.organizationId]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      return null;
    }

    const user = userResult.rows[0];

    return {
      organizationId: user.organization_id,
      userId: user.id,
      role: user.role as 'admin' | 'developer' | 'viewer' | 'auditor',
      authMethod: 'jwt',
      permissions: payload.permissions || [],
    };
  } catch (error) {
    console.error('JWT validation error:', error);
    return null;
  }
}

/**
 * Validate API key against database
 */
async function validateApiKey(apiKey: string): Promise<AuthContext | null> {
  try {
    // Get all active API keys for comparison from PostgreSQL
    const apiKeysResult = await query(
      `SELECT 
        ak.id,
        ak.organization_id,
        ak.key_hash,
        ak.created_by,
        ak.expires_at,
        o.is_active as org_is_active
      FROM api_keys ak
      INNER JOIN organizations o ON ak.organization_id = o.id
      WHERE ak.is_active = true
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
      []
    );

    const apiKeys = apiKeysResult.rows;

    // Find matching API key by comparing with stored hashes
    let matchingApiKey = null;
    for (const keyRecord of apiKeys) {
      if (bcrypt.compareSync(apiKey, keyRecord.key_hash)) {
        matchingApiKey = keyRecord;
        break;
      }
    }

    if (!matchingApiKey || !matchingApiKey.org_is_active) {
      return null;
    }

    // Update last used timestamp
    await query(
      `UPDATE api_keys 
       SET last_used_at = NOW() 
       WHERE id = $1`,
      [matchingApiKey.id]
    );

    // Get user role if userId is available
    let userRole: string = 'viewer';
    if (matchingApiKey.created_by) {
      const userResult = await query(
        `SELECT role 
         FROM users 
         WHERE id = $1 
           AND organization_id = $2 
           AND is_active = true 
         LIMIT 1`,
        [matchingApiKey.created_by, matchingApiKey.organization_id]
      );
      if (userResult.rows && userResult.rows.length > 0) {
        userRole = userResult.rows[0].role;
      }
    }

    return {
      organizationId: matchingApiKey.organization_id,
      userId: matchingApiKey.created_by || undefined,
      apiKeyId: matchingApiKey.id,
      role: userRole as 'admin' | 'developer' | 'viewer' | 'auditor',
      authMethod: 'api_key',
    };
  } catch (error) {
    console.error('API key validation error:', error);
    return null;
  }
}

/**
 * Generate JWT token for user
 */
export function generateJWT(payload: {
  userId: string;
  organizationId: string;
  role: string;
  permissions?: string[];
  expiresIn?: string;
}): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  const tokenPayload: JWTPayload = {
    userId: payload.userId,
    organizationId: payload.organizationId,
    role: payload.role,
    permissions: payload.permissions || [],
  };

  return jwt.sign(tokenPayload, jwtSecret || 'dev-secret', {
    expiresIn: payload.expiresIn || '24h',
    issuer: 'node2ai',
    audience: 'node2ai-api',
  } as any);
}

/**
 * Generate API key hash for storage
 */
export function generateApiKeyHash(apiKey: string): string {
  return bcrypt.hashSync(apiKey, 12); // Use same salt rounds as seed script
}

/**
 * Role-based access control middleware
 */
export function requireRole(allowedRoles: string[]) {
  return async function roleMiddleware(
    request: AuthenticatedRequest,
    next: (request: AuthenticatedRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    if (!request.auth) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Authentication required',
          error: 'No auth context found',
        },
        { status: 401 }
      );
    }

    if (!allowedRoles.includes(request.auth.role)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Insufficient permissions',
          error: `Role '${request.auth.role}' not allowed. Required: ${allowedRoles.join(', ')}`,
        },
        { status: 403 }
      );
    }

    return next(request);
  };
}
