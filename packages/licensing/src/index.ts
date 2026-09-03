/**
 * Node2AI License Management System
 * Handles license validation, seat counting, and feature enablement
 */

import crypto from 'crypto';
import { addDays, isAfter, isBefore } from 'date-fns';

export interface License {
  // License metadata
  key: string;
  organizationName: string;
  organizationId: string;

  // Capacity limits
  maxSeats: number;
  maxMonthlyApiCalls?: number;
  maxStorageGB?: number;

  // Dates
  issuedAt: Date;
  expiresAt: Date;

  // Features
  features: LicenseFeature[];

  // License type
  tier: LicenseTier;

  // Validation
  signature: string;
}

export enum LicenseTier {
  TRIAL = 'trial',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export enum LicenseFeature {
  // Core features (all tiers)
  MULTI_PROVIDER = 'multi_provider',
  BASIC_ANALYTICS = 'basic_analytics',
  API_ACCESS = 'api_access',

  // Professional features
  ADVANCED_ANALYTICS = 'advanced_analytics',
  SSO_SAML = 'sso_saml',
  AUDIT_LOGS = 'audit_logs',
  CUSTOM_ROLES = 'custom_roles',

  // Enterprise features
  AIR_GAPPED = 'air_gapped',
  DEDICATED_SUPPORT = 'dedicated_support',
  CUSTOM_SLA = 'custom_sla',
  WHITE_LABEL = 'white_label',
  MULTI_TENANT = 'multi_tenant',
  ADVANCED_SECURITY = 'advanced_security',
}

export interface LicenseValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  license?: License;
  seatUsage?: {
    used: number;
    available: number;
    percentage: number;
  };
}

export class LicenseManager {
  private static readonly ALGORITHM = 'aes-256-cbc';
  private static readonly LICENSE_VERSION = 1;
  private privateKey: string;
  private publicKey: string;

  constructor(privateKey?: string, publicKey?: string) {
    // In production, load from secure key storage
    this.privateKey = privateKey || process.env.LICENSE_PRIVATE_KEY || '';
    this.publicKey = publicKey || process.env.LICENSE_PUBLIC_KEY || '';
  }

  /**
   * Generate a new license key
   */
  async generateLicense(params: {
    organizationName: string;
    organizationId: string;
    maxSeats: number;
    tier: LicenseTier;
    features?: LicenseFeature[];
    validityDays?: number;
    maxMonthlyApiCalls?: number;
    maxStorageGB?: number;
  }): Promise<License> {
    const now = new Date();
    const expiresAt = addDays(now, params.validityDays || 365);

    // Determine features based on tier if not specified
    const features = params.features || this.getDefaultFeatures(params.tier);

    const license: Omit<License, 'key' | 'signature'> = {
      organizationName: params.organizationName,
      organizationId: params.organizationId,
      maxSeats: params.maxSeats,
      maxMonthlyApiCalls: params.maxMonthlyApiCalls,
      maxStorageGB: params.maxStorageGB,
      issuedAt: now,
      expiresAt,
      features,
      tier: params.tier,
    };

    // Generate license key
    const key = this.generateLicenseKey(license);

    // Create temporary license object for signing
    const tempLicense: License = {
      ...license,
      key,
      signature: '', // Will be set below
    };

    // Sign the license
    const signature = this.signLicense(tempLicense);

    return {
      ...license,
      key,
      signature,
    };
  }

  /**
   * Validate a license key
   * @param licenseKey The license key to validate
   * @param options Validation options
   * @param dbStatus Optional database status check (status, expiresAt) - if provided, checks database status
   */
  async validateLicense(
    licenseKey: string,
    options?: {
      checkSeats?: boolean;
      currentSeatCount?: number;
    },
    dbStatus?: {
      status: string;
      expiresAt: Date | null;
    } | null
  ): Promise<LicenseValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse license
      const license = this.parseLicense(licenseKey);

      // Verify signature
      if (!this.verifySignature(license)) {
        errors.push('Invalid license signature - license may be tampered with');
        return { valid: false, errors, warnings };
      }

      // Check database status if provided (takes precedence)
      if (dbStatus) {
        if (dbStatus.status === 'revoked') {
          errors.push('License has been revoked');
          return { valid: false, errors, warnings, license };
        }
        if (dbStatus.status === 'suspended') {
          errors.push('License has been suspended');
          return { valid: false, errors, warnings, license };
        }
        if (dbStatus.status === 'expired') {
          errors.push('License has expired');
          return { valid: false, errors, warnings, license };
        }

        // Use database expiration if available (more restrictive)
        if (dbStatus.expiresAt) {
          const dbExpiration = dbStatus.expiresAt;
          const keyExpiration = license.expiresAt;
          // Use the earlier expiration date
          const effectiveExpiration =
            dbExpiration < keyExpiration ? dbExpiration : keyExpiration;

          const now = new Date();
          if (isAfter(now, effectiveExpiration)) {
            errors.push(
              `License expired on ${effectiveExpiration.toISOString()}`
            );
            return { valid: false, errors, warnings, license };
          }

          // Warn if expiring soon (30 days)
          const expiringThreshold = addDays(now, 30);
          if (isAfter(expiringThreshold, effectiveExpiration)) {
            const daysUntilExpiry = Math.ceil(
              (effectiveExpiration.getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24)
            );
            warnings.push(`License expires in ${daysUntilExpiry} days`);
          }
        }
      } else {
        // Fallback to key-encoded expiration if no database status
        const now = new Date();
        if (isAfter(now, license.expiresAt)) {
          errors.push(`License expired on ${license.expiresAt.toISOString()}`);
          return { valid: false, errors, warnings, license };
        }

        // Warn if expiring soon (30 days)
        const expiringThreshold = addDays(now, 30);
        if (isAfter(expiringThreshold, license.expiresAt)) {
          const daysUntilExpiry = Math.ceil(
            (license.expiresAt.getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          warnings.push(`License expires in ${daysUntilExpiry} days`);
        }
      }

      // Check seat count if requested
      let seatUsage;
      if (options?.checkSeats && options.currentSeatCount !== undefined) {
        const used = options.currentSeatCount;
        const available = license.maxSeats;
        const percentage = (used / available) * 100;

        seatUsage = { used, available, percentage };

        if (used > available) {
          errors.push(`Seat limit exceeded: ${used}/${available} seats in use`);
          return { valid: false, errors, warnings, license, seatUsage };
        }

        if (percentage >= 90) {
          warnings.push(
            `Approaching seat limit: ${used}/${available} seats in use (${percentage.toFixed(0)}%)`
          );
        }
      }

      return {
        valid: true,
        errors,
        warnings,
        license,
        seatUsage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      errors.push(`License validation error: ${errorMessage}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Check if a license has a specific feature
   */
  hasFeature(license: License, feature: LicenseFeature): boolean {
    return license.features.includes(feature);
  }

  /**
   * Get all enabled features for a license
   */
  getEnabledFeatures(license: License): LicenseFeature[] {
    return license.features;
  }

  /**
   * Generate a formatted license key
   */
  private generateLicenseKey(
    license: Omit<License, 'key' | 'signature'>
  ): string {
    const payload = {
      v: LicenseManager.LICENSE_VERSION,
      org: license.organizationId,
      seats: license.maxSeats,
      tier: license.tier,
      exp: license.expiresAt.getTime(),
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Format: NODE2AI-XXXX-XXXX-XXXX
    const parts = encoded.match(/.{1,4}/g) || [];
    return `NODE2AI-${parts.slice(0, 3).join('-')}`;
  }

  /**
   * Parse a license key
   */
  private parseLicense(licenseKey: string): License {
    // Remove prefix and parse
    const encoded = licenseKey.replace(/^NODE2AI-/, '').replace(/-/g, '');
    const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
    const payload = JSON.parse(decoded);

    // Reconstruct license (in production, fetch full details from secure storage)
    return {
      key: licenseKey,
      organizationName: 'Customer Organization',
      organizationId: payload.org,
      maxSeats: payload.seats,
      tier: payload.tier,
      issuedAt: new Date(),
      expiresAt: new Date(payload.exp),
      features: this.getDefaultFeatures(payload.tier),
      signature: '', // Would be stored separately
    };
  }

  /**
   * Sign a license
   */
  private signLicense(license: License): string {
    const data = JSON.stringify({
      key: license.key,
      org: license.organizationId,
      seats: license.maxSeats,
      exp: license.expiresAt.getTime(),
    });

    // In production, use RSA signing with private key
    const hmac = crypto.createHmac('sha256', this.privateKey);
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * Verify license signature
   */
  private verifySignature(license: License): boolean {
    const expectedSignature = this.signLicense(license);
    return crypto.timingSafeEqual(
      Buffer.from(license.signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Get default features for a tier
   */
  private getDefaultFeatures(tier: LicenseTier): LicenseFeature[] {
    const baseFeatures = [
      LicenseFeature.MULTI_PROVIDER,
      LicenseFeature.BASIC_ANALYTICS,
      LicenseFeature.API_ACCESS,
    ];

    switch (tier) {
      case LicenseTier.TRIAL:
        return baseFeatures;

      case LicenseTier.STARTER:
        return baseFeatures;

      case LicenseTier.PROFESSIONAL:
        return [
          ...baseFeatures,
          LicenseFeature.ADVANCED_ANALYTICS,
          LicenseFeature.SSO_SAML,
          LicenseFeature.AUDIT_LOGS,
          LicenseFeature.CUSTOM_ROLES,
        ];

      case LicenseTier.ENTERPRISE:
        return [
          ...baseFeatures,
          LicenseFeature.ADVANCED_ANALYTICS,
          LicenseFeature.SSO_SAML,
          LicenseFeature.AUDIT_LOGS,
          LicenseFeature.CUSTOM_ROLES,
          LicenseFeature.AIR_GAPPED,
          LicenseFeature.DEDICATED_SUPPORT,
          LicenseFeature.CUSTOM_SLA,
          LicenseFeature.WHITE_LABEL,
          LicenseFeature.MULTI_TENANT,
          LicenseFeature.ADVANCED_SECURITY,
        ];

      default:
        return baseFeatures;
    }
  }

  /**
   * Persist license to database
   * This is a placeholder - actual implementation depends on your database setup
   */
  async saveLicenseToDatabase(
    license: License,
    organizationId: string
  ): Promise<void> {
    // TODO: Implement database save
    // This would typically use your database client (e.g., Supabase, Prisma, etc.)
    console.log('Saving license to database:', {
      organizationId,
      licenseKey: license.key,
      tier: license.tier,
    });
  }

  /**
   * Load license from database
   */
  async loadLicenseFromDatabase(licenseKey: string): Promise<License | null> {
    // TODO: Implement database load
    // Query the licenses table by license_key
    console.log('Loading license from database:', licenseKey);
    return null;
  }

  /**
   * Load license by organization ID
   */
  async loadLicenseByOrganization(
    organizationId: string
  ): Promise<License | null> {
    // TODO: Implement database load by org
    console.log('Loading license for organization:', organizationId);
    return null;
  }

  /**
   * Update license usage metrics in database
   */
  async updateLicenseUsage(
    licenseKey: string,
    metrics: {
      currentSeatCount?: number;
      currentMonthlyApiCalls?: number;
      currentStorageGB?: number;
    }
  ): Promise<void> {
    // TODO: Implement database update
    console.log('Updating license usage:', { licenseKey, metrics });
  }
}

// Export singleton instance
export const licenseManager = new LicenseManager();

// Utility functions
export async function validateCurrentLicense(): Promise<LicenseValidationResult> {
  const licenseKey = process.env.LICENSE_KEY;

  if (!licenseKey) {
    return {
      valid: false,
      errors: ['No license key configured'],
      warnings: [],
    };
  }

  // Get current seat count from database
  const currentSeatCount = await getCurrentSeatCount();

  return licenseManager.validateLicense(licenseKey, {
    checkSeats: true,
    currentSeatCount,
  });
}

async function getCurrentSeatCount(): Promise<number> {
  // In production, query database for active user count
  // For now, return mock value
  return 5;
}

// Middleware for feature checking
export function requireFeature(feature: LicenseFeature) {
  return async (req: any, res: any, next: any) => {
    const validation = await validateCurrentLicense();

    if (!validation.valid) {
      return res.status(403).json({
        error: 'Invalid license',
        details: validation.errors,
      });
    }

    if (
      !validation.license ||
      !licenseManager.hasFeature(validation.license, feature)
    ) {
      return res.status(403).json({
        error: 'Feature not available',
        feature,
        message: `Your license tier does not include ${feature}`,
      });
    }

    next();
  };
}

// Export database integration
export * from './database';
