import { NextRequest, NextResponse } from 'next/server';
import { AuthenticatedRequest } from './auth';

export type MiddlewareFunction = (
  request: NextRequest | AuthenticatedRequest,
  next: (request: NextRequest | AuthenticatedRequest) => Promise<NextResponse>
) => Promise<NextResponse>;

/**
 * Compose multiple middleware functions into a single middleware
 */
export function composeMiddleware(
  ...middlewares: MiddlewareFunction[]
): MiddlewareFunction {
  return async (request, next) => {
    let index = 0;

    const dispatch = async (i: number): Promise<NextResponse> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      const middleware = middlewares[i];
      if (!middleware) {
        return next(request);
      }

      return middleware(request, req => dispatch(i + 1));
    };

    return dispatch(0);
  };
}

/**
 * Create a middleware that applies multiple middleware functions in sequence
 */
export function applyMiddleware(...middlewares: MiddlewareFunction[]) {
  return composeMiddleware(...middlewares);
}

/**
 * Skip middleware in development mode
 */
export function skipInDevelopment(
  middleware: MiddlewareFunction
): MiddlewareFunction {
  return async (request, next) => {
    if (process.env.NODE_ENV === 'development') {
      return next(request);
    }
    return middleware(request, next);
  };
}

/**
 * Conditional middleware application
 */
export function conditionalMiddleware(
  condition: (request: NextRequest | AuthenticatedRequest) => boolean,
  middleware: MiddlewareFunction
): MiddlewareFunction {
  return async (request, next) => {
    if (condition(request)) {
      return middleware(request, next);
    }
    return next(request);
  };
}
