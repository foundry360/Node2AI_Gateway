// Core SupernovaAI Types

export interface SupernovaConfig {
  deploymentMode: 'cloud' | 'self-hosted' | 'airgap';
  licenseKey: string;
  licenseType: 'enterprise' | 'professional' | 'standard';
  database: DatabaseConfig;
  redis: RedisConfig;
  security: SecurityConfig;
  compliance: ComplianceConfig;
  features: FeatureFlags;
}

export interface DatabaseConfig {
  url: string;
  ssl: boolean;
  poolSize?: number;
  timeout?: number;
}

export interface RedisConfig {
  url: string;
  password?: string;
  db?: number;
}

export interface SecurityConfig {
  jwtSecret: string;
  encryptionKey: string;
  corsOrigins: string[];
  sessionTimeout: number;
}

export interface ComplianceConfig {
  mode: 'strict' | 'standard' | 'relaxed';
  auditLogging: boolean;
  dataEncryptionAtRest: boolean;
  dataRetentionDays: number;
  gdprCompliant: boolean;
  hipaaCompliant: boolean;
  soxCompliant: boolean;
}

export interface FeatureFlags {
  sanitization: boolean;
  auditLogs: boolean;
  complianceReports: boolean;
  offlineMode: boolean;
  multiTenant: boolean;
  sso: boolean;
}

// API Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// User and Authentication Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

export type UserRole = 'admin' | 'operator' | 'viewer' | 'auditor';

export interface Permission {
  resource: string;
  actions: string[];
}

// AI Model Types
export interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'local' | 'custom';
  model: string;
  version: string;
  capabilities: ModelCapability[];
  isActive: boolean;
  config: ModelConfig;
}

export type ModelCapability =
  | 'text-generation'
  | 'text-completion'
  | 'chat'
  | 'embeddings'
  | 'image-generation'
  | 'code-generation'
  | 'translation'
  | 'summarization';

export interface ModelConfig {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

// Data Sanitization Types
export interface SanitizationRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: SanitizationCategory;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SanitizationCategory =
  | 'pii'
  | 'phi'
  | 'financial'
  | 'government'
  | 'custom';

export interface SanitizationResult {
  original: string;
  sanitized: string;
  rulesApplied: string[];
  confidence: number;
  warnings: string[];
}

// Audit and Compliance Types
export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface ComplianceReport {
  id: string;
  type: 'gdpr' | 'hipaa' | 'sox' | 'custom';
  period: {
    start: string;
    end: string;
  };
  status: 'pending' | 'generating' | 'completed' | 'failed';
  findings: ComplianceFinding[];
  recommendations: string[];
  generatedAt: string;
  generatedBy: string;
}

export interface ComplianceFinding {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedRecords: number;
  recommendation: string;
}

// Deployment Types
export interface DeploymentInfo {
  mode: 'cloud' | 'self-hosted' | 'airgap';
  version: string;
  buildDate: string;
  features: string[];
  health: HealthStatus;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  lastChecked: string;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
}

// Error Types
export class SupernovaError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SupernovaError';
  }
}

export class ValidationError extends SupernovaError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends SupernovaError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends SupernovaError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class LicenseError extends SupernovaError {
  constructor(message: string = 'License validation failed') {
    super(message, 'LICENSE_ERROR', 402);
    this.name = 'LicenseError';
  }
}

// Export audit types
export * from './audit.types';
