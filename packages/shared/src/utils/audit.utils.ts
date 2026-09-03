/**
 * Audit Logging Utilities
 * Helper functions for audit logging system
 */

import crypto from 'crypto';

/**
 * Hash content using SHA-256
 * Used to create a fingerprint of request/response content without storing PII
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate cost breakdown for an AI request
 */
export interface CostCalculationParams {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  pricingTier?: string;
}

export interface CostCalculationResult {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Calculate cost based on provider and model pricing
 */
export function calculateCost(
  params: CostCalculationParams
): CostCalculationResult {
  const { provider, model, inputTokens, outputTokens, pricingTier } = params;

  // Default pricing per 1M tokens (in USD)
  const pricing = {
    openai: {
      'gpt-4-turbo': { input: 10.0, output: 30.0 },
      'gpt-4': { input: 30.0, output: 60.0 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
      default: { input: 10.0, output: 30.0 },
    },
    anthropic: {
      'claude-3-opus': { input: 15.0, output: 75.0 },
      'claude-3-sonnet': { input: 3.0, output: 15.0 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      default: { input: 15.0, output: 75.0 },
    },
    google: {
      'gemini-pro': { input: 0.5, output: 1.5 },
      'gemini-ultra': { input: 10.0, output: 30.0 },
      default: { input: 0.5, output: 1.5 },
    },
    local: {
      default: { input: 0.0, output: 0.0 },
    },
    perplexity: {
      default: { input: 10.0, output: 10.0 },
    },
  };

  const providerPricing =
    pricing[provider as keyof typeof pricing] || pricing.openai;
  const modelPricing =
    providerPricing[model as keyof typeof providerPricing] ||
    providerPricing.default;

  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  // Apply tier discount if provided
  let discount = 1.0;
  if (pricingTier) {
    const discounts: Record<string, number> = {
      standard: 1.0,
      professional: 0.9,
      enterprise: 0.8,
      airgap: 1.0,
    };
    discount = discounts[pricingTier] || 1.0;
  }

  return {
    inputCost: inputCost * discount,
    outputCost: outputCost * discount,
    totalCost: (inputCost + outputCost) * discount,
  };
}

/**
 * Sanitize error message to remove any PII
 * Replaces potential PII patterns with [REDACTED]
 */
export function sanitizeErrorMessage(error: string | Error): string {
  const errorMessage = typeof error === 'string' ? error : error.message;

  if (!errorMessage) {
    return 'Unknown error';
  }

  // Patterns to sanitize
  const sanitizationPatterns = [
    {
      pattern: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
      replacement: '[EMAIL_REDACTED]',
    },
    {
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      replacement: '[SSN_REDACTED]',
    },
    {
      pattern: /\b\d{3}-?\d{3}-?\d{4}\b/g, // Phone
      replacement: '[PHONE_REDACTED]',
    },
    {
      pattern: /\b\d{13,19}\b/g, // Credit Card
      replacement: '[CC_REDACTED]',
    },
    {
      pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP Address
      replacement: '[IP_REDACTED]',
    },
  ];

  let sanitized = errorMessage;
  for (const { pattern, replacement } of sanitizationPatterns) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

/**
 * Format audit log for export
 */
export function formatAuditLogForExport(log: any): Record<string, any> {
  const formatted: Record<string, any> = {};

  // Flatten the log object for CSV/JSON export
  if (log.id) formatted.id = log.id;
  if (log.requestId) formatted.request_id = log.requestId;
  if (log.createdAt) formatted.created_at = log.createdAt;
  if (log.completedAt) formatted.completed_at = log.completedAt;
  if (log.durationMs) formatted.duration_ms = log.durationMs;
  if (log.organizationId) formatted.organization_id = log.organizationId;
  if (log.userId) formatted.user_id = log.userId;
  if (log.apiKeyId) formatted.api_key_id = log.apiKeyId;
  if (log.endpoint) formatted.endpoint = log.endpoint;
  if (log.httpMethod) formatted.http_method = log.httpMethod;
  if (log.provider) formatted.provider = log.provider;
  if (log.model) formatted.model = log.model;
  if (log.inputTokenCount) formatted.input_tokens = log.inputTokenCount;
  if (log.outputTokenCount) formatted.output_tokens = log.outputTokenCount;
  if (log.costUsd) formatted.cost_usd = log.costUsd;
  if (log.status) formatted.status = log.status;
  if (log.piiDetectedCount) formatted.pii_detected = log.piiDetectedCount;
  if (log.phiDetectedCount) formatted.phi_detected = log.phiDetectedCount;
  if (log.errorMessage)
    formatted.error_message = sanitizeErrorMessage(log.errorMessage);

  // Convert JSONB fields to strings for export
  if (log.sanitizationTypes)
    formatted.sanitization_types = JSON.stringify(log.sanitizationTypes);
  if (log.complianceFlags)
    formatted.compliance_flags = JSON.stringify(log.complianceFlags);
  if (log.requestMetadata)
    formatted.request_metadata = JSON.stringify(log.requestMetadata);
  if (log.responseMetadata)
    formatted.response_metadata = JSON.stringify(log.responseMetadata);
  if (log.tags) formatted.tags = log.tags.join(', ');

  return formatted;
}

/**
 * Calculate duration in milliseconds
 */
export function calculateDurationMs(startTime: Date, endTime: Date): number {
  return endTime.getTime() - startTime.getTime();
}

/**
 * Parse date range query parameters
 */
export function parseDateRange(
  startDate?: string | null,
  endDate?: string | null
): { start: Date | undefined; end: Date | undefined } {
  let start: Date | undefined;
  let end: Date | undefined;

  if (startDate) {
    start = new Date(startDate);
    if (isNaN(start.getTime())) start = undefined;
  }

  if (endDate) {
    end = new Date(endDate);
    if (isNaN(end.getTime())) end = undefined;
  }

  return { start, end };
}

// formatBytes is already exported from utils/index.ts

/**
 * Format duration to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Generate token ID for PII/PHI tokenization
 */
export function generateTokenId(type: string, index: number): string {
  return `[${type}_${String(index).padStart(3, '0')}]`;
}

/**
 * Check if string contains potential PII
 */
export function containsPII(content: string): boolean {
  const piiPatterns = [
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/, // Email
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{3}-?\d{3}-?\d{4}\b/, // Phone
    /\b\d{13,19}\b/, // Credit Card
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, // Name (rough)
  ];

  return piiPatterns.some(pattern => pattern.test(content));
}
