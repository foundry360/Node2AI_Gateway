/**
 * Core TypeScript types for Node2AI API
 * Defines interfaces for all major components
 */

// Re-export all types from other files
export * from './api';
export * from './security';
export * from './license';
export * from './errors';

// Common utility types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
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

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  lastChecked: string;
}

// User and authentication types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer' | 'auditor';
  permissions: Permission[];
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface AuthResult {
  success: boolean;
  userId?: string;
  organizationId?: string;
  userPreferences?: any;
  userHistory?: any;
  organizationPreferences?: any;
}

// Configuration types
export interface DeploymentConfig {
  mode: 'cloud' | 'self-hosted' | 'airgap';
  features: FeatureFlags;
  license: LicenseInfo;
}

export interface FeatureFlags {
  chatEnabled: boolean;
  knowledgeBaseEnabled: boolean;
  sanitizationEnabled: boolean;
  smartRoutingEnabled: boolean;
  comparisonEnabled: boolean;
  authenticationEnabled: boolean;
  auditLoggingEnabled: boolean;
}

export interface LicenseInfo {
  key: string;
  tier: 'standard' | 'professional' | 'enterprise';
  expiresAt: string;
  features: string[];
  maxInstances: number;
}

// Provider and model types
export interface AIModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  version: string;
  capabilities: string[];
  isActive: boolean;
  config: ModelConfig;
}

export interface ModelConfig {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

// Integration types
export interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, any>;
  isActive: boolean;
  lastSync?: string;
}

export interface IntegrationConfig {
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  timeout?: number;
  retries?: number;
}

// Audit and compliance types
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

// Usage and analytics types
export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  topModels: Array<{
    model: string;
    requests: number;
    cost: number;
  }>;
  topUsers: Array<{
    userId: string;
    requests: number;
    cost: number;
  }>;
}

export interface CostBreakdown {
  period: {
    start: string;
    end: string;
  };
  totalCost: number;
  byProvider: Array<{
    provider: string;
    cost: number;
    percentage: number;
  }>;
  byModel: Array<{
    model: string;
    cost: number;
    percentage: number;
  }>;
  byUser: Array<{
    userId: string;
    cost: number;
    percentage: number;
  }>;
}

// Knowledge base types
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  collection: string;
  tags: string[];
  metadata: Record<string, any>;
  embeddings: number[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  context?: string;
  highlights?: string[];
  score: number;
  metadata?: Record<string, any>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  collection: string;
}

// Environment and deployment types
export interface EnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  DEPLOYMENT_MODE: 'cloud' | 'self-hosted' | 'airgap';
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  API_KEY_SECRET: string;
  CORS_ORIGINS: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  FEATURE_FLAGS: Record<string, boolean>;
}

// Error types
export interface ErrorDetails {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
}

// WebSocket types
export interface WebSocketMessage {
  type: 'chat' | 'status' | 'error' | 'ping' | 'pong';
  data: any;
  timestamp: string;
  requestId?: string;
}

export interface ChatStreamMessage {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      role?: string;
    };
    finish_reason?: string;
  }>;
}
