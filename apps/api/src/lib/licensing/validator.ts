/**
 * License Validator
 * Simple license validation for development/testing
 */

export class LicenseValidator {
  private licenseKey: string;
  private isLicensed: boolean;

  constructor() {
    this.licenseKey = process.env.LICENSE_KEY || 'NODE2AI-DEMO-TEST-0001';
    this.isLicensed = this.validateLicenseKey(this.licenseKey);
  }

  /**
   * Check if a feature is available in the current license
   */
  async checkFeature(feature: string): Promise<boolean> {
    // For development/testing, always return true
    // In production, this would check against actual license features
    return true;
  }

  /**
   * Validate the license key format
   */
  private validateLicenseKey(key: string): boolean {
    // Simple validation - check if it starts with NODE2AI-
    return key.startsWith('NODE2AI-');
  }

  /**
   * Get license information
   */
  getLicenseInfo(): {
    key: string;
    isValid: boolean;
    features: string[];
    expiresAt?: string;
  } {
    return {
      key: this.licenseKey,
      isValid: this.isLicensed,
      features: [
        'authentication',
        'chat',
        'sanitization',
        'analytics',
        'provider_keys',
        'organization_management',
      ],
      expiresAt: '2025-12-31T23:59:59Z', // Demo license expires end of year
    };
  }

  /**
   * Check seat count limits
   */
  async checkSeatLimit(): Promise<{
    current: number;
    limit: number;
    available: number;
  }> {
    // For development, return unlimited seats
    return {
      current: 1,
      limit: 999999,
      available: 999998,
    };
  }
}
