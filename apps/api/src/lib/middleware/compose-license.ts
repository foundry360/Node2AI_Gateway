/**
 * Composable License Middleware Helper
 * Convenience functions for applying license middleware to routes
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authMiddleware,
  licenseMiddleware,
  requireLicenseFeature,
  requireApiLimit,
  AuthenticatedRequest,
} from './';
import { LicenseFeature } from '@node2ai/licensing';

/**
 * Compose auth + license checks for any endpoint
 */
export function withLicenseAuth(
  handler: (request: AuthenticatedRequest) => Promise<NextResponse>,
  options?: {
    requireFeature?: LicenseFeature;
    checkApiLimit?: boolean;
    checkSeats?: boolean;
  }
) {
  return async (request: NextRequest) => {
    return authMiddleware(
      request,
      async (authRequest: AuthenticatedRequest) => {
        return licenseMiddleware(authRequest, handler, options);
      }
    );
  };
}

/**
 * Compose auth + license + feature check
 */
export function withLicenseFeature(
  feature: LicenseFeature,
  handler: (request: AuthenticatedRequest) => Promise<NextResponse>
) {
  return withLicenseAuth(handler, { requireFeature: feature });
}

/**
 * Compose auth + license + API limit check
 */
export function withApiLimit(
  handler: (request: AuthenticatedRequest) => Promise<NextResponse>
) {
  return withLicenseAuth(handler, { checkApiLimit: true });
}

/**
 * Compose auth + license + all checks
 */
export function withFullLicenseCheck(
  handler: (request: AuthenticatedRequest) => Promise<NextResponse>
) {
  return withLicenseAuth(handler, { checkApiLimit: true, checkSeats: true });
}
