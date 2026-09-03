/**
 * License Enforcement Middleware
 * Enforces license validation, seat limits, and feature restrictions on API routes
 */

import { NextResponse } from 'next/server';
import {
  licenseManager,
  LicenseValidationResult,
  createLicenseDatabase,
  LicenseFeature,
} from '@node2ai/licensing';
import { AuthenticatedRequest } from './auth';

export interface LicenseCheckResult {
  valid: boolean;
  license?: any;
  errors: string[];
  warnings: string[];
  overLimit?: boolean;
}

/**
 * Main license enforcement middleware
 */
export async function licenseMiddleware(
  request: AuthenticatedRequest,
  next: (request: AuthenticatedRequest) => Promise<NextResponse>,
  options?: {
    requireFeature?: LicenseFeature;
    checkSeats?: boolean;
    checkApiLimit?: boolean;
  }
): Promise<NextResponse> {
  try {
    // Skip if no auth context (should never happen in real usage)
    if (!request.auth) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Authentication required',
          error: 'NO_AUTH',
        },
        { status: 401 }
      );
    }

    const organizationId = request.auth.organizationId;

    // Load license from database
    const licenseDb = createLicenseDatabase({
      connectionString: process.env.DATABASE_URL,
    });

    const license = await licenseDb.loadLicenseByOrganization(organizationId);

    // Fallback to environment license if no database license
    if (!license) {
      const envLicenseKey = process.env.LICENSE_KEY;
      if (!envLicenseKey) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'No license configured',
            error: 'LICENSE_NOT_FOUND',
          },
          { status: 403 }
        );
      }

      const validation = await licenseManager.validateLicense(envLicenseKey);
      if (!validation.valid) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'License validation failed',
            error: 'LICENSE_INVALID',
            errors: validation.errors,
          },
          { status: 403 }
        );
      }

      // Continue with validated env license
      return next(request);
    }

    // Get current usage counts
    const currentSeatCount =
      await licenseDb.getCurrentSeatCount(organizationId);
    const currentApiCallCount =
      await licenseDb.getCurrentMonthApiCallCount(organizationId);

    // Get database status for validation
    const dbStatus = await licenseDb.getLicenseStatus(license.key);

    // Validate database license (with database status check)
    const validation = await licenseManager.validateLicense(
      license.key,
      {
        checkSeats: options?.checkSeats ?? true,
        currentSeatCount,
      },
      dbStatus
    );

    // Record validation attempt
    await licenseDb.recordValidation(license.key, validation.valid);

    // Check if license is valid
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'License validation failed',
          error: 'LICENSE_INVALID',
          errors: validation.errors,
          warnings: validation.warnings,
        },
        { status: 403 }
      );
    }

    // Check specific feature requirement
    if (options?.requireFeature && validation.license) {
      if (
        !licenseManager.hasFeature(validation.license, options.requireFeature)
      ) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Feature not available',
            error: 'FEATURE_NOT_INCLUDED',
            feature: options.requireFeature,
            details: `Your license tier (${validation.license.tier}) does not include this feature`,
          },
          { status: 403 }
        );
      }
    }

    // Check API call limit
    if (options?.checkApiLimit && validation.license.maxMonthlyApiCalls) {
      if (currentApiCallCount >= validation.license.maxMonthlyApiCalls) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'API call limit reached',
            error: 'API_LIMIT_EXCEEDED',
            details: {
              limit: validation.license.maxMonthlyApiCalls,
              used: currentApiCallCount,
              resetDate: getNextMonthStart(),
            },
          },
          { status: 429 }
        );
      }
    }

    // Add license info to request for downstream use
    (request as any).license = validation.license;
    (request as any).licenseValidation = validation;
    (request as any).licenseUsage = {
      seats: { used: currentSeatCount, limit: license.maxSeats },
      apiCalls: {
        used: currentApiCallCount,
        limit: license.maxMonthlyApiCalls,
      },
    };

    // Continue to next middleware/handler
    return next(request);
  } catch (error) {
    console.error('License middleware error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'License check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Middleware to require a specific license feature
 */
export function requireLicenseFeature(feature: LicenseFeature) {
  return (
    request: AuthenticatedRequest,
    next: (request: AuthenticatedRequest) => Promise<NextResponse>
  ) => licenseMiddleware(request, next, { requireFeature: feature });
}

/**
 * Middleware to check seat limits
 */
export function requireSeatCapacity() {
  return (
    request: AuthenticatedRequest,
    next: (request: AuthenticatedRequest) => Promise<NextResponse>
  ) => licenseMiddleware(request, next, { checkSeats: true });
}

/**
 * Middleware to check API call limits
 */
export function requireApiLimit() {
  return (
    request: AuthenticatedRequest,
    next: (request: AuthenticatedRequest) => Promise<NextResponse>
  ) => licenseMiddleware(request, next, { checkApiLimit: true });
}

/**
 * Get start of next month
 */
function getNextMonthStart(): Date {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth;
}

/**
 * Check if a license allows a specific feature (helper function)
 */
export async function checkLicenseFeature(
  organizationId: string,
  feature: LicenseFeature
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const licenseDb = createLicenseDatabase({
      connectionString: process.env.DATABASE_URL,
    });

    const license = await licenseDb.loadLicenseByOrganization(organizationId);
    if (!license) {
      return { allowed: false, reason: 'No license found' };
    }

    const validation = await licenseManager.validateLicense(license.key);
    if (!validation.valid) {
      return { allowed: false, reason: 'License invalid' };
    }

    if (!validation.license) {
      return { allowed: false, reason: 'Could not load license' };
    }

    const hasFeature = licenseManager.hasFeature(validation.license, feature);
    return {
      allowed: hasFeature,
      reason: hasFeature
        ? undefined
        : `Feature not included in ${validation.license.tier} license`,
    };
  } catch (error) {
    console.error('License feature check error:', error);
    return { allowed: false, reason: 'Check failed' };
  }
}
