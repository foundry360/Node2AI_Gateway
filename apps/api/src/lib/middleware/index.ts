// Export all middleware functions
export { authMiddleware, requireRole } from './auth';
export {
  rateLimitMiddleware,
  organizationRateLimit,
  userRateLimit,
} from './rate-limit';
export { auditLogMiddleware, getAuditLogs, searchAuditLogs } from './audit-log';
export {
  featureFlagMiddleware,
  isFeatureEnabled,
  getAvailableFeatures,
  requireFeatures,
  requireDeploymentMode,
} from './feature-flag';
export {
  licenseMiddleware,
  requireLicenseFeature,
  requireSeatCapacity,
  requireApiLimit,
  checkLicenseFeature,
} from './license';
export {
  withLicenseAuth,
  withLicenseFeature,
  withApiLimit,
  withFullLicenseCheck,
} from './compose-license';
export {
  composeMiddleware,
  applyMiddleware,
  skipInDevelopment,
  conditionalMiddleware,
} from './compose';

// Export types
export type { AuthContext, AuthenticatedRequest } from './auth';
