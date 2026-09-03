/**
 * Audit Logging System Types
 * Comprehensive audit and compliance tracking for Node2AI
 */

// AI Request Status
export type AIRequestStatus =
  | 'success'
  | 'error'
  | 'timeout'
  | 'rate_limited'
  | 'pending';

// Entity Types (PII/PHI)
export type EntityType =
  | 'EMAIL'
  | 'SSN'
  | 'PHONE'
  | 'NAME'
  | 'MRN'
  | 'DOB'
  | 'ADDRESS'
  | 'CREDIT_CARD'
  | 'IP_ADDRESS'
  | 'URL'
  | 'LICENSE_PLATE'
  | 'PASSPORT'
  | 'BANK_ACCOUNT';

// Entity Categories
export type EntityCategory = 'PII' | 'PHI' | 'PCI' | 'GOVERNMENT';

// Detection Methods
export type DetectionMethod = 'regex' | 'ml_model' | 'dictionary' | 'context';

// Event Categories
export type EventCategory = 'security' | 'performance' | 'compliance' | 'admin';

// Severity Levels
export type Severity = 'info' | 'warning' | 'error' | 'critical';

// AI Providers
export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'local'
  | 'perplexity';

// Deployment Modes
export type DeploymentMode = 'cloud' | 'self-hosted' | 'airgap';

// Sanitization Action Types
export type SanitizationAction =
  | 'tokenized'
  | 'redacted'
  | 'masked'
  | 'encrypted';

// System Event Types
export type SystemEventType =
  | 'authentication'
  | 'authorization'
  | 'configuration_change'
  | 'api_key_created'
  | 'api_key_rotated'
  | 'api_key_revoked'
  | 'provider_key_updated'
  | 'organization_updated'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'rate_limit_hit'
  | 'sanitization_failed';

// Compliance Regulations
export type ComplianceRegulation =
  | 'HIPAA'
  | 'GDPR'
  | 'PCI-DSS'
  | 'SOX'
  | 'SOC2';

/**
 * AI Request Input
 */
export interface AIRequestInput {
  requestId: string;
  organizationId: string;
  userId?: string;
  apiKeyId?: string;
  applicationId?: string;

  // Request Details
  endpoint: string;
  httpMethod: string;
  ipAddress?: string;
  userAgent?: string;

  // AI Provider Details
  provider: AIProvider;
  model: string;
  deploymentMode: DeploymentMode;

  // Input Metrics
  inputMessageCount: number;
  inputTokenCount: number;
  inputCharacterCount: number;
  inputHash?: string;

  // Sanitization Details
  sanitizationEnabled: boolean;
  piiDetectedCount?: number;
  phiDetectedCount?: number;
  sanitizationTypes?: Record<string, number>;
  sanitizationDurationMs?: number;

  // Status
  status: AIRequestStatus;

  // Metadata
  requestMetadata?: Record<string, any>;
  tags?: string[];
}

/**
 * AI Request Update
 */
export interface AIRequestUpdate {
  completedAt?: Date;
  durationMs?: number;

  // Output Metrics
  outputTokenCount?: number;
  outputCharacterCount?: number;
  outputHash?: string;
  finishReason?: string;

  // Error Handling
  status?: AIRequestStatus;
  httpStatusCode?: number;
  errorType?: string;
  errorMessage?: string;
  retryCount?: number;

  // Cost Tracking
  costUsd?: number;
  costInputUsd?: number;
  costOutputUsd?: number;
  pricingTier?: string;

  // Performance Metrics
  queueTimeMs?: number;
  aiProviderTimeMs?: number;
  desanitizationTimeMs?: number;

  // Compliance
  complianceFlags?: Record<string, boolean>;

  // Metadata
  responseMetadata?: Record<string, any>;
}

/**
 * Sanitization Event Input
 */
export interface SanitizationEventInput {
  requestId: string;
  entityType: EntityType;
  entityCategory: EntityCategory;
  detectionMethod: DetectionMethod;
  confidenceScore: number;
  positionStart: number;
  positionEnd: number;
  contextBefore?: string;
  contextAfter?: string;
  tokenId: string;
  tokenExpiry?: Date;
  action: SanitizationAction;
  originalLength: number;
  metadata?: Record<string, any>;
}

/**
 * Conversation Session Input
 */
export interface ConversationSessionInput {
  sessionId: string;
  organizationId: string;
  userId?: string;
  title?: string;
  contextMetadata?: Record<string, any>;
  tags?: string[];
}

/**
 * Conversation Message Input
 */
export interface ConversationMessageInput {
  sessionId: string;
  requestId?: string;
  messageOrder: number;
  role: 'user' | 'assistant' | 'system';
  contentHash: string;
  contentLength: number;
  tokenCount: number;
  containedPii?: boolean;
  piiTypes?: Record<string, number>;
  metadata?: Record<string, any>;
}

/**
 * System Event Input
 */
export interface SystemEventInput {
  eventType: SystemEventType;
  eventCategory: EventCategory;
  severity: Severity;
  actorType: 'user' | 'api_key' | 'system' | 'admin';
  actorId?: string;
  actorIp?: string;
  actorUserAgent?: string;
  targetType?: string;
  targetId?: string;
  action: string;
  description?: string;
  changes?: Record<string, { before: any; after: any }>;
  organizationId?: string;
  requestId?: string;
  status: 'success' | 'failure' | 'blocked';
  errorMessage?: string;
}

/**
 * Rate Limit Event Input
 */
export interface RateLimitEventInput {
  organizationId: string;
  apiKeyId?: string;
  ipAddress?: string;
  limitType: string;
  limitValue: number;
  currentValue: number;
  windowStart?: Date;
  windowEnd?: Date;
  action: 'blocked' | 'throttled' | 'warned';
  retryAfterSeconds?: number;
}

/**
 * Compliance Review Input
 */
export interface ComplianceReviewInput {
  reviewType: 'random_sample' | 'flagged_content' | 'periodic_audit';
  reviewPeriodStart?: Date;
  reviewPeriodEnd?: Date;
  reviewedBy: string;
  organizationId?: string;
  requestIds: string[];
  sampleSize?: number;
  findings?: string;
  issuesFound?: number;
  complianceStatus: 'compliant' | 'non_compliant' | 'needs_review';
  actionsRequired?: string;
  followUpRequired?: boolean;
  followUpDate?: Date;
  metadata?: Record<string, any>;
}

/**
 * Audit Log Query Filters
 */
export interface AuditLogFilters {
  organizationId?: string;
  userId?: string;
  apiKeyId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: AIRequestStatus;
  provider?: AIProvider;
  model?: string;
  containsPii?: boolean;
  containsPhi?: boolean;
  page?: number;
  perPage?: number;
}

/**
 * Audit Log Query Result
 */
export interface AuditLogQueryResult {
  requests: any[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Audit Statistics
 */
export interface AuditStatistics {
  totalRequests: number;
  requestsByStatus: Record<string, number>;
  requestsByProvider: Record<string, number>;
  totalCost: number;
  totalTokens: number;
  piiDetectionsCount: number;
  phiDetectionsCount: number;
  avgDurationMs: number;
}

/**
 * Cost Breakdown
 */
export interface CostBreakdown {
  total: number;
  inputCost: number;
  outputCost: number;
  breakdown: {
    provider: string;
    model: string;
    cost: number;
    tokens: number;
  }[];
}

/**
 * Export Format
 */
export type ExportFormat = 'csv' | 'json';
