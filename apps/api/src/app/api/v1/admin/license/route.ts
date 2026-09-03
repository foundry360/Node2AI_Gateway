import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  licenseManager,
  LicenseValidationResult,
  createLicenseDatabase,
} from '@node2ai/licensing';

// Mock authentication middleware (replace with real auth)
const authMiddleware = (
  request: NextRequest,
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, message: 'Authentication required' },
      { status: 401 }
    );
  }
  const token = authHeader.split(' ')[1];

  // TODO: Replace with real auth validation
  // For now, extract organization ID from env or token
  const authRequest = request as AuthenticatedRequest;
  authRequest.auth = {
    userId: 'user-mock',
    organizationId: process.env.DEFAULT_ORG_ID || 'org-mock',
    role: 'admin',
    authMethod: 'bearer_token',
  };
  return handler(authRequest);
};

interface AuthenticatedRequest extends NextRequest {
  auth?: {
    userId: string;
    organizationId: string;
    role: string;
    authMethod: string;
  };
}

/**
 * GET /api/v1/admin/license
 * Get license information and validation status
 */
export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      if (!authRequest.auth) {
        return NextResponse.json(
          { success: false, message: 'Authentication required' },
          { status: 401 }
        );
      }

      const organizationId = authRequest.auth.organizationId;

      // Try to get license from database first
      const licenseDb = createLicenseDatabase({
        connectionString: process.env.DATABASE_URL,
      });

      const license = await licenseDb.loadLicenseByOrganization(organizationId);

      if (!license) {
        // Fallback to environment variable license
        const licenseKey = process.env.LICENSE_KEY;
        if (!licenseKey) {
          return NextResponse.json({
            success: false,
            data: null,
            message: 'No license configured for this organization',
            error: 'LICENSE_NOT_FOUND',
          });
        }

        // Validate the license
        const validation = await licenseManager.validateLicense(licenseKey);
        if (!validation.valid) {
          return NextResponse.json({
            success: false,
            data: null,
            message: 'License validation failed',
            errors: validation.errors,
          });
        }

        // Return license info from env
        return NextResponse.json({
          success: true,
          data: formatLicenseInfo(validation.license!, validation),
          message: 'License information retrieved successfully',
        });
      }

      // Get database status for validation
      const dbStatus = await licenseDb.getLicenseStatus(license.key);

      // Validate the license from database (with database status check)
      const validation = await licenseManager.validateLicense(
        license.key,
        undefined,
        dbStatus
      );

      // Record validation
      await licenseDb.recordValidation(license.key, validation.valid);

      return NextResponse.json({
        success: true,
        data: formatLicenseInfo(license, validation),
        message: 'License information retrieved successfully',
      });
    } catch (error: any) {
      console.error('License info retrieval error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve license information',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/admin/license/validate
 * Validate license key and refresh status
 */
export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await request.json();
      const { license_key } = body;

      if (!license_key) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'License key is required',
          },
          { status: 400 }
        );
      }

      const licenseDb = createLicenseDatabase({
        connectionString: process.env.DATABASE_URL,
      });

      // Get database status for validation
      const dbStatus = await licenseDb.getLicenseStatus(license_key);

      // Get current seat count for validation
      if (authRequest.auth) {
        const currentSeatCount = await licenseDb.getCurrentSeatCount(
          authRequest.auth.organizationId
        );

        // Perform validation (with database status check)
        const validation = await licenseManager.validateLicense(
          license_key,
          {
            checkSeats: true,
            currentSeatCount,
          },
          dbStatus
        );

        // Record validation attempt
        await licenseDb.recordValidation(license_key, validation.valid);

        if (!validation.valid) {
          return NextResponse.json({
            success: false,
            data: formatValidationResult(validation),
            message: 'License validation failed',
            errors: validation.errors,
          });
        }

        return NextResponse.json({
          success: true,
          data: formatValidationResult(validation),
          message: 'License validation completed successfully',
        });
      }

      // Fallback validation without auth context (with database status check)
      // dbStatus already retrieved above
      const validation = await licenseManager.validateLicense(
        license_key,
        undefined,
        dbStatus
      );

      return NextResponse.json({
        success: validation.valid,
        data: formatValidationResult(validation),
        message: validation.valid
          ? 'License validation completed successfully'
          : 'License validation failed',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    } catch (error: any) {
      console.error('License validation error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to validate license',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/admin/license/update
 * Update license information (for internal use)
 */
export async function PUT(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      if (!authRequest.auth) {
        return NextResponse.json(
          { success: false, message: 'Authentication required' },
          { status: 401 }
        );
      }

      const body = await request.json();
      const { license_key, usage } = body;

      if (!license_key) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'License key is required',
          },
          { status: 400 }
        );
      }

      const licenseDb = createLicenseDatabase({
        connectionString: process.env.DATABASE_URL,
      });

      // Update usage metrics if provided
      if (usage) {
        await licenseDb.updateUsage(license_key, {
          currentSeatCount: usage.current_seat_count,
          currentMonthlyApiCalls: usage.current_monthly_api_calls,
          currentStorageGB: usage.current_storage_gb,
        });
      }

      // Update expiration if provided
      if (body.expires_at) {
        await licenseDb.updateExpiration(
          license_key,
          new Date(body.expires_at),
          body.reason
        );
      }

      const updateResult = {
        license_key,
        updated_at: new Date().toISOString(),
        changes_applied: Object.keys(body).filter(
          key => key !== 'license_key' && key !== 'reason'
        ),
        status: 'updated',
        message: 'License information updated successfully',
      };

      return NextResponse.json({
        success: true,
        data: updateResult,
        message: 'License updated successfully',
      });
    } catch (error: any) {
      console.error('License update error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to update license',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * Helper function to format license information
 */
function formatLicenseInfo(license: any, validation: LicenseValidationResult) {
  const now = new Date();
  const expiresAt = new Date(license.expiresAt);
  const daysRemaining = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    license_key: license.key,
    status: 'active',
    tier: license.tier,
    organization: {
      name: license.organizationName,
      id: license.organizationId,
    },
    features: formatFeatures(license.features),
    limits: {
      max_users: license.maxSeats,
      max_api_requests_per_month: license.maxMonthlyApiCalls || 'unlimited',
      max_data_processing_gb: license.maxStorageGB || 'unlimited',
    },
    usage: {
      current_users: validation.seatUsage?.used || 0,
    },
    validity: {
      issued_date: license.issuedAt.toISOString(),
      expiry_date: license.expiresAt.toISOString(),
      days_remaining: Math.max(0, daysRemaining),
      auto_renewal: false,
    },
    metadata: {
      last_validated: new Date().toISOString(),
      validation_status: validation.valid ? 'valid' : 'invalid',
      signature_verified: true,
    },
    warnings: validation.warnings,
    errors: validation.errors,
  };
}

/**
 * Helper function to format validation result
 */
function formatValidationResult(validation: LicenseValidationResult) {
  if (!validation.license) {
    return {
      validation_status: 'invalid',
      validated_at: new Date().toISOString(),
      signature_verified: false,
      tamper_detected: false,
      expiry_check: {
        is_expired: false,
        days_remaining: 0,
      },
      usage_check: {
        within_limits: true,
      },
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }

  const now = new Date();
  const expiresAt = new Date(validation.license.expiresAt);
  const daysRemaining = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    license_key: validation.license.key,
    validation_status: validation.valid ? 'valid' : 'invalid',
    validated_at: new Date().toISOString(),
    signature_verified: validation.valid,
    tamper_detected: !validation.valid,
    expiry_check: {
      is_expired: daysRemaining < 0,
      days_remaining: Math.max(0, daysRemaining),
      expiry_date: expiresAt.toISOString(),
    },
    usage_check: {
      within_limits: validation.seatUsage
        ? validation.seatUsage.percentage < 100
        : true,
      users_usage: validation.seatUsage
        ? `${validation.seatUsage.used}/${validation.seatUsage.available}`
        : 'N/A',
      percentage: validation.seatUsage?.percentage || 0,
    },
    warnings: validation.warnings,
    errors: validation.errors,
  };
}

/**
 * Helper function to format features as an object
 */
function formatFeatures(features: string[]): Record<string, boolean> {
  const featureMap: Record<string, boolean> = {};

  features.forEach(feature => {
    switch (feature) {
      case 'multi_provider':
        featureMap.multi_provider_routing = true;
        break;
      case 'basic_analytics':
      case 'advanced_analytics':
        featureMap.analytics_dashboard = true;
        break;
      case 'api_access':
        featureMap.api_access = true;
        break;
      case 'audit_logs':
        featureMap.audit_logging = true;
        break;
      case 'sso_saml':
        featureMap.sso = true;
        break;
      case 'custom_roles':
        featureMap.custom_roles = true;
        break;
      case 'air_gapped':
        featureMap.air_gapped = true;
        break;
      case 'dedicated_support':
        featureMap.priority_support = true;
        break;
      case 'custom_sla':
        featureMap.sla_guarantee = true;
        break;
      case 'white_label':
        featureMap.white_label = true;
        break;
      case 'multi_tenant':
        featureMap.multi_tenant = true;
        break;
      case 'advanced_security':
        featureMap.advanced_security = true;
        break;
    }
  });

  return featureMap;
}
