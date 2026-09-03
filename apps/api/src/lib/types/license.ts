/**
 * License-related types and interfaces
 */

export interface LicenseInfo {
  key: string;
  tier: 'standard' | 'professional' | 'enterprise';
  expiresAt: string;
  features: string[];
  maxInstances: number;
}

export interface LicenseValidationResult {
  valid: boolean;
  message: string;
  licenseInfo?: LicenseInfo;
  error?: string;
}

export interface LicenseMetadata {
  id: string;
  organizationId: string;
  tier: 'standard' | 'professional' | 'enterprise';
  expiresAt: Date;
  features: string[];
  maxInstances: number;
  currentInstances: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LicenseCheckResponse {
  status: 'valid' | 'expired' | 'invalid' | 'trial';
  tier: string;
  expiresAt: string;
  features: string[];
  daysUntilExpiry?: number;
  warnings: string[];
}
