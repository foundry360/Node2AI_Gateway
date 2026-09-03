import { NextRequest, NextResponse } from 'next/server';
import { AuthenticatedRequest } from './auth';
import {
  licenseManager,
  createLicenseDatabase,
  LicenseFeature,
} from '@node2ai/licensing';

interface FeatureFlag {
  name: string;
  enabled: boolean;
  conditions?: Record<string, any>;
  deploymentMode?: 'cloud' | 'self-hosted' | 'airgap';
  licenseTier?: 'basic' | 'professional' | 'enterprise';
}

interface LicenseInfo {
  tier: 'basic' | 'professional' | 'enterprise';
  features: string[];
  maxInstances: number;
  expiresAt: Date;
}

// Mock feature flags (in production, load from database)
const featureFlags: Record<string, FeatureFlag> = {
  'data-sanitization': {
    name: 'data-sanitization',
    enabled: true,
    deploymentMode: 'self-hosted',
    licenseTier: 'professional',
  },
  'smart-routing': {
    name: 'smart-routing',
    enabled: true,
    licenseTier: 'professional',
  },
  'model-comparison': {
    name: 'model-comparison',
    enabled: true,
    licenseTier: 'professional',
  },
  'knowledge-base': {
    name: 'knowledge-base',
    enabled: true,
    licenseTier: 'enterprise',
  },
  'local-models': {
    name: 'local-models',
    enabled: true,
    deploymentMode: 'airgap',
  },
  'advanced-analytics': {
    name: 'advanced-analytics',
    enabled: true,
    licenseTier: 'enterprise',
  },
  'custom-integrations': {
    name: 'custom-integrations',
    enabled: true,
    licenseTier: 'enterprise',
  },
};

/**
 * Feature flag middleware
 */
export async function featureFlagMiddleware(
  request: AuthenticatedRequest,
  next: (request: AuthenticatedRequest) => Promise<NextResponse>,
  requiredFeatures: string[] = []
): Promise<NextResponse> {
  try {
    // Get deployment mode from environment
    const deploymentMode =
      (process.env.DEPLOYMENT_MODE as 'cloud' | 'self-hosted' | 'airgap') ||
      'self-hosted';

    // Get license info (mock for now)
    const licenseInfo = await getLicenseInfo(
      request.auth?.organizationId || 'default'
    );

    // Check each required feature
    for (const feature of requiredFeatures) {
      const isEnabled = await checkFeatureFlag(
        feature,
        deploymentMode,
        licenseInfo
      );

      if (!isEnabled) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Feature not available',
            error: `Feature '${feature}' is not enabled for your license tier or deployment mode`,
            details: {
              feature,
              deploymentMode,
              licenseTier: licenseInfo.tier,
              availableFeatures: licenseInfo.features,
            },
          },
          { status: 403 }
        );
      }
    }

    return next(request);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Feature flag check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Check if a feature is enabled
 */
async function checkFeatureFlag(
  featureName: string,
  deploymentMode: string,
  licenseInfo: LicenseInfo
): Promise<boolean> {
  const flag = featureFlags[featureName];

  if (!flag) {
    return false; // Feature not defined
  }

  if (!flag.enabled) {
    return false; // Feature disabled globally
  }

  // Check deployment mode
  if (flag.deploymentMode && flag.deploymentMode !== deploymentMode) {
    return false;
  }

  // Check license tier
  if (flag.licenseTier) {
    const tierLevels = { basic: 1, professional: 2, enterprise: 3 };
    const requiredLevel = tierLevels[flag.licenseTier];
    const userLevel = tierLevels[licenseInfo.tier];

    if (userLevel < requiredLevel) {
      return false;
    }
  }

  // Check if feature is in license
  if (!licenseInfo.features.includes(featureName)) {
    return false;
  }

  return true;
}

/**
 * Get license information from database
 */
async function getLicenseInfo(organizationId: string): Promise<LicenseInfo> {
  try {
    // Default to a basic license if none is configured
    const licenseKey = process.env.LICENSE_KEY;

    if (!licenseKey) {
      return {
        tier: 'basic',
        features: [],
        maxInstances: 1,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
    }

    const validation = await licenseManager.validateLicense(licenseKey);
    if (!validation.valid || !validation.license) {
      return {
        tier: 'basic',
        features: [],
        maxInstances: 1,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
    }

    const features =
      validation.license.features?.map(feature => feature.toString()) || [];

    return {
      tier: (validation.license.tier as any) || 'basic',
      features,
      maxInstances: validation.license.maxSeats || 1,
      expiresAt: validation.license.expiresAt,
    };
  } catch (error) {
    console.error('Failed to load license info:', error);
    return {
      tier: 'basic',
      features: [],
      maxInstances: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }
}

/**
 * Check if feature is enabled for organization
 */
export async function isFeatureEnabled(
  organizationId: string,
  featureName: string
): Promise<boolean> {
  const deploymentMode =
    (process.env.DEPLOYMENT_MODE as 'cloud' | 'self-hosted' | 'airgap') ||
    'self-hosted';
  const licenseInfo = await getLicenseInfo(organizationId);

  return checkFeatureFlag(featureName, deploymentMode, licenseInfo);
}

/**
 * Get available features for organization
 */
export async function getAvailableFeatures(
  organizationId: string
): Promise<string[]> {
  const deploymentMode =
    (process.env.DEPLOYMENT_MODE as 'cloud' | 'self-hosted' | 'airgap') ||
    'self-hosted';
  const licenseInfo = await getLicenseInfo(organizationId);

  const availableFeatures: string[] = [];

  for (const [featureName, flag] of Object.entries(featureFlags)) {
    if (await checkFeatureFlag(featureName, deploymentMode, licenseInfo)) {
      availableFeatures.push(featureName);
    }
  }

  return availableFeatures;
}

/**
 * Require specific features
 */
export function requireFeatures(features: string[]) {
  return async function featureRequirementMiddleware(
    request: AuthenticatedRequest,
    next: (request: AuthenticatedRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    return featureFlagMiddleware(request, next, features);
  };
}

/**
 * Deployment mode specific middleware
 */
export function requireDeploymentMode(
  mode: 'cloud' | 'self-hosted' | 'airgap'
) {
  return async function deploymentModeMiddleware(
    request: AuthenticatedRequest,
    next: (request: AuthenticatedRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const currentMode =
      (process.env.DEPLOYMENT_MODE as 'cloud' | 'self-hosted' | 'airgap') ||
      'self-hosted';

    if (currentMode !== mode) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Deployment mode not supported',
          error: `This endpoint requires '${mode}' deployment mode, but current mode is '${currentMode}'`,
        },
        { status: 403 }
      );
    }

    return next(request);
  };
}
