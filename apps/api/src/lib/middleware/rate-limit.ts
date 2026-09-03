import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (request: NextRequest) => string;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (in production, use Redis)
const rateLimitStore: RateLimitStore = {};

/**
 * Rate limiting middleware
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  next: (request: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  }
): Promise<NextResponse> {
  try {
    // Generate rate limit key (default: IP + User-Agent)
    const key = config.keyGenerator
      ? config.keyGenerator(request)
      : `${request.ip || 'unknown'}-${request.headers.get('user-agent') || 'unknown'}`;

    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Clean up expired entries
    Object.keys(rateLimitStore).forEach(storeKey => {
      if (rateLimitStore[storeKey].resetTime < windowStart) {
        delete rateLimitStore[storeKey];
      }
    });

    // Get or create rate limit entry
    if (!rateLimitStore[key]) {
      rateLimitStore[key] = {
        count: 0,
        resetTime: now + config.windowMs,
      };
    }

    const entry = rateLimitStore[key];

    // Check if window has expired
    if (entry.resetTime < now) {
      entry.count = 0;
      entry.resetTime = now + config.windowMs;
    }

    // Increment counter
    entry.count++;

    // Check if limit exceeded
    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Rate limit exceeded',
          error: `Too many requests. Limit: ${config.maxRequests} per ${config.windowMs / 1000}s`,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': Math.max(
              0,
              config.maxRequests - entry.count
            ).toString(),
            'X-RateLimit-Reset': entry.resetTime.toString(),
          },
        }
      );
    }

    // Add rate limit headers
    const response = await next(request);
    response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
    response.headers.set(
      'X-RateLimit-Remaining',
      Math.max(0, config.maxRequests - entry.count).toString()
    );
    response.headers.set('X-RateLimit-Reset', entry.resetTime.toString());

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Rate limiting failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Organization-based rate limiting
 */
export function organizationRateLimit(config: RateLimitConfig) {
  return async function orgRateLimitMiddleware(
    request: NextRequest,
    next: (request: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Extract organization ID from auth context or API key
    const orgId = request.headers.get('X-Organization-ID') || 'default';

    const orgConfig = {
      ...config,
      keyGenerator: () => `org-${orgId}`,
    };

    return rateLimitMiddleware(request, next, orgConfig);
  };
}

/**
 * User-based rate limiting
 */
export function userRateLimit(config: RateLimitConfig) {
  return async function userRateLimitMiddleware(
    request: NextRequest,
    next: (request: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Extract user ID from auth context
    const userId = request.headers.get('X-User-ID') || 'anonymous';

    const userConfig = {
      ...config,
      keyGenerator: () => `user-${userId}`,
    };

    return rateLimitMiddleware(request, next, userConfig);
  };
}

/**
 * Helper function to check rate limit directly (for use outside middleware)
 */
export async function checkRateLimit(
  request: NextRequest,
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): Promise<{ success: boolean; remaining?: number; resetTime?: number }> {
  try {
    const fullConfig: RateLimitConfig = {
      windowMs: config.windowMs || 60 * 1000,
      maxRequests: config.maxRequests || 100,
    };

    const key = `${identifier}-${request.ip || 'unknown'}`;
    const now = Date.now();
    const windowStart = now - fullConfig.windowMs;

    // Clean up expired entries
    Object.keys(rateLimitStore).forEach(storeKey => {
      if (rateLimitStore[storeKey].resetTime < windowStart) {
        delete rateLimitStore[storeKey];
      }
    });

    // Get or create rate limit entry
    if (!rateLimitStore[key]) {
      rateLimitStore[key] = {
        count: 0,
        resetTime: now + fullConfig.windowMs,
      };
    }

    const entry = rateLimitStore[key];

    // Check if window has expired
    if (entry.resetTime < now) {
      entry.count = 0;
      entry.resetTime = now + fullConfig.windowMs;
    }

    // Increment counter
    entry.count++;

    // Check if limit exceeded
    if (entry.count > fullConfig.maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    return {
      success: true,
      remaining: fullConfig.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Allow through on error
    return { success: true };
  }
}
