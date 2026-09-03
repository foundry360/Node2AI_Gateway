// Validation schemas and utilities for Node2AI

import { z } from 'zod';
import {
  DEPLOYMENT_MODES,
  LICENSE_TYPES,
  USER_ROLES,
  MODEL_PROVIDERS,
  SANITIZATION_CATEGORIES,
  SANITIZATION_SEVERITY,
  COMPLIANCE_MODES,
  COMPLIANCE_TYPES,
  AUDIT_SEVERITY,
} from '../constants';

// Base validation schemas
export const emailSchema = z.string().email('Invalid email format');
export const uuidSchema = z.string().uuid('Invalid UUID format');
export const urlSchema = z.string().url('Invalid URL format');
export const dateStringSchema = z.string().datetime('Invalid date format');

// User validation schemas
export const userRoleSchema = z.enum([
  USER_ROLES.ADMIN,
  USER_ROLES.OPERATOR,
  USER_ROLES.VIEWER,
  USER_ROLES.AUDITOR,
]);

export const permissionSchema = z.object({
  resource: z.string().min(1, 'Resource is required'),
  actions: z.array(z.string()).min(1, 'At least one action is required'),
});

export const userSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  role: userRoleSchema,
  permissions: z.array(permissionSchema),
  tenantId: uuidSchema.optional(),
  createdAt: dateStringSchema,
  updatedAt: dateStringSchema,
  lastLoginAt: dateStringSchema.optional(),
  isActive: z.boolean(),
});

// Configuration validation schemas
export const deploymentModeSchema = z.enum([
  DEPLOYMENT_MODES.CLOUD,
  DEPLOYMENT_MODES.SELF_HOSTED,
  DEPLOYMENT_MODES.AIRGAP,
]);

export const licenseTypeSchema = z.enum([
  LICENSE_TYPES.ENTERPRISE,
  LICENSE_TYPES.PROFESSIONAL,
  LICENSE_TYPES.STANDARD,
]);

export const databaseConfigSchema = z.object({
  url: z.string().min(1, 'Database URL is required'),
  ssl: z.boolean().default(false),
  poolSize: z.number().int().min(1).max(100).optional(),
  timeout: z.number().int().min(1000).max(30000).optional(),
});

export const redisConfigSchema = z.object({
  url: z.string().min(1, 'Redis URL is required'),
  password: z.string().optional(),
  db: z.number().int().min(0).max(15).optional(),
});

export const securityConfigSchema = z.object({
  jwtSecret: z.string().min(32, 'JWT secret must be at least 32 characters'),
  encryptionKey: z
    .string()
    .min(32, 'Encryption key must be at least 32 characters'),
  corsOrigins: z
    .array(z.string())
    .min(1, 'At least one CORS origin is required'),
  sessionTimeout: z.number().int().min(300).max(86400), // 5 minutes to 24 hours
});

export const complianceConfigSchema = z.object({
  mode: z.enum([
    COMPLIANCE_MODES.STRICT,
    COMPLIANCE_MODES.STANDARD,
    COMPLIANCE_MODES.RELAXED,
  ]),
  auditLogging: z.boolean(),
  dataEncryptionAtRest: z.boolean(),
  dataRetentionDays: z.number().int().min(1).max(3650), // 1 day to 10 years
  gdprCompliant: z.boolean(),
  hipaaCompliant: z.boolean(),
  soxCompliant: z.boolean(),
});

export const featureFlagsSchema = z.object({
  sanitization: z.boolean(),
  auditLogs: z.boolean(),
  complianceReports: z.boolean(),
  offlineMode: z.boolean(),
  multiTenant: z.boolean(),
  sso: z.boolean(),
});

export const node2ConfigSchema = z.object({
  deploymentMode: deploymentModeSchema,
  licenseKey: z.string().min(1, 'License key is required'),
  licenseType: licenseTypeSchema,
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  security: securityConfigSchema,
  compliance: complianceConfigSchema,
  features: featureFlagsSchema,
});

// AI Model validation schemas
export const modelProviderSchema = z.enum([
  MODEL_PROVIDERS.OPENAI,
  MODEL_PROVIDERS.ANTHROPIC,
  MODEL_PROVIDERS.LOCAL,
  MODEL_PROVIDERS.CUSTOM,
]);

export const modelCapabilitySchema = z.enum([
  'text-generation',
  'text-completion',
  'chat',
  'embeddings',
  'image-generation',
  'code-generation',
  'translation',
  'summarization',
]);

export const modelConfigSchema = z.object({
  maxTokens: z.number().int().min(1).max(100000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  stopSequences: z.array(z.string()).optional(),
});

export const aiModelSchema = z.object({
  id: uuidSchema,
  name: z
    .string()
    .min(1, 'Model name is required')
    .max(100, 'Model name too long'),
  provider: modelProviderSchema,
  model: z.string().min(1, 'Model identifier is required'),
  version: z.string().min(1, 'Version is required'),
  capabilities: z
    .array(modelCapabilitySchema)
    .min(1, 'At least one capability is required'),
  isActive: z.boolean(),
  config: modelConfigSchema,
});

// Sanitization validation schemas
export const sanitizationCategorySchema = z.enum([
  SANITIZATION_CATEGORIES.PII,
  SANITIZATION_CATEGORIES.PHI,
  SANITIZATION_CATEGORIES.FINANCIAL,
  SANITIZATION_CATEGORIES.GOVERNMENT,
  SANITIZATION_CATEGORIES.CUSTOM,
]);

export const sanitizationSeveritySchema = z.enum([
  SANITIZATION_SEVERITY.LOW,
  SANITIZATION_SEVERITY.MEDIUM,
  SANITIZATION_SEVERITY.HIGH,
  SANITIZATION_SEVERITY.CRITICAL,
]);

export const sanitizationRuleSchema = z.object({
  id: uuidSchema,
  name: z
    .string()
    .min(1, 'Rule name is required')
    .max(100, 'Rule name too long'),
  pattern: z.string().min(1, 'Pattern is required'),
  replacement: z.string(),
  severity: sanitizationSeveritySchema,
  category: sanitizationCategorySchema,
  isActive: z.boolean(),
  createdAt: dateStringSchema,
  updatedAt: dateStringSchema,
});

export const sanitizationResultSchema = z.object({
  original: z.string(),
  sanitized: z.string(),
  rulesApplied: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

// Audit and Compliance validation schemas
export const auditSeveritySchema = z.enum([
  AUDIT_SEVERITY.INFO,
  AUDIT_SEVERITY.WARNING,
  AUDIT_SEVERITY.ERROR,
  AUDIT_SEVERITY.CRITICAL,
]);

export const auditLogSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  action: z.string().min(1, 'Action is required'),
  resource: z.string().min(1, 'Resource is required'),
  resourceId: uuidSchema.optional(),
  details: z.record(z.any()),
  ipAddress: z.string().ip('Invalid IP address'),
  userAgent: z.string().min(1, 'User agent is required'),
  timestamp: dateStringSchema,
  severity: auditSeveritySchema,
});

export const complianceTypeSchema = z.enum([
  COMPLIANCE_TYPES.GDPR,
  COMPLIANCE_TYPES.HIPAA,
  COMPLIANCE_TYPES.SOX,
  COMPLIANCE_TYPES.CUSTOM,
]);

export const complianceFindingSchema = z.object({
  id: uuidSchema,
  type: z.string().min(1, 'Finding type is required'),
  severity: sanitizationSeveritySchema,
  description: z.string().min(1, 'Description is required'),
  affectedRecords: z.number().int().min(0),
  recommendation: z.string().min(1, 'Recommendation is required'),
});

export const complianceReportSchema = z.object({
  id: uuidSchema,
  type: complianceTypeSchema,
  period: z.object({
    start: dateStringSchema,
    end: dateStringSchema,
  }),
  status: z.enum(['pending', 'generating', 'completed', 'failed']),
  findings: z.array(complianceFindingSchema),
  recommendations: z.array(z.string()),
  generatedAt: dateStringSchema,
  generatedBy: uuidSchema,
});

// API validation schemas
export const paginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
});

export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  timestamp: dateStringSchema,
  requestId: z.string(),
});

export const paginatedResponseSchema = apiResponseSchema.extend({
  data: z.array(z.any()),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),
});

// Health check validation schemas
export const healthCheckStatusSchema = z.enum(['pass', 'fail', 'warn']);

export const healthCheckSchema = z.object({
  name: z.string().min(1, 'Check name is required'),
  status: healthCheckStatusSchema,
  message: z.string().optional(),
  duration: z.number().min(0).optional(),
});

export const healthStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  checks: z.array(healthCheckSchema),
  lastChecked: dateStringSchema,
});

// Validation utility functions
export function validateConfig(config: unknown) {
  return node2ConfigSchema.parse(config);
}

export function validateUser(user: unknown) {
  return userSchema.parse(user);
}

export function validateAIModel(model: unknown) {
  return aiModelSchema.parse(model);
}

export function validateSanitizationRule(rule: unknown) {
  return sanitizationRuleSchema.parse(rule);
}

export function validateAuditLog(log: unknown) {
  return auditLogSchema.parse(log);
}

export function validateComplianceReport(report: unknown) {
  return complianceReportSchema.parse(report);
}

// Custom validation functions
export function validateLicenseKey(licenseKey: string): boolean {
  // Basic license key format validation
  const licenseKeyRegex =
    /^N2-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return licenseKeyRegex.test(licenseKey);
}

export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('Password must be at least 8 characters long');

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Password must contain at least one lowercase letter');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Password must contain at least one uppercase letter');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Password must contain at least one number');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push('Password must contain at least one special character');

  return {
    isValid: score >= 4,
    score,
    feedback,
  };
}
