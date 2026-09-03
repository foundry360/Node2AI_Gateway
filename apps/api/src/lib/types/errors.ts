/**
 * Error handling types for Node2AI
 * Defines custom error classes and error response formats
 */

// Base error class
export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Authentication errors
export class AuthenticationError extends ApiError {
  constructor(
    message: string = 'Authentication failed',
    details?: Record<string, any>
  ) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(
    message: string = 'Insufficient permissions',
    details?: Record<string, any>
  ) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

export class TokenExpiredError extends ApiError {
  constructor(
    message: string = 'Token has expired',
    details?: Record<string, any>
  ) {
    super(message, 'TOKEN_EXPIRED', 401, details);
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends ApiError {
  constructor(
    message: string = 'Invalid token',
    details?: Record<string, any>
  ) {
    super(message, 'INVALID_TOKEN', 401, details);
    this.name = 'InvalidTokenError';
  }
}

// Validation errors
export class ValidationError extends ApiError {
  constructor(message: string, field?: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, { field, ...details });
    this.name = 'ValidationError';
  }
}

export class RequiredFieldError extends ApiError {
  constructor(field: string, details?: Record<string, any>) {
    super(`Required field '${field}' is missing`, 'REQUIRED_FIELD_ERROR', 400, {
      field,
      ...details,
    });
    this.name = 'RequiredFieldError';
  }
}

export class InvalidFormatError extends ApiError {
  constructor(field: string, format: string, details?: Record<string, any>) {
    super(
      `Field '${field}' has invalid format. Expected: ${format}`,
      'INVALID_FORMAT_ERROR',
      400,
      { field, format, ...details }
    );
    this.name = 'InvalidFormatError';
  }
}

// Rate limiting errors
export class RateLimitError extends ApiError {
  public readonly retryAfter?: number;

  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    details?: Record<string, any>
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { retryAfter, ...details });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class QuotaExceededError extends ApiError {
  constructor(
    message: string = 'Quota exceeded',
    details?: Record<string, any>
  ) {
    super(message, 'QUOTA_EXCEEDED', 429, details);
    this.name = 'QuotaExceededError';
  }
}

// Provider errors
export class ProviderError extends ApiError {
  public readonly provider: string;

  constructor(
    provider: string,
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message, code, statusCode, { provider, ...details });
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

export class ProviderUnavailableError extends ApiError {
  public readonly provider: string;

  constructor(
    provider: string,
    message: string = 'Provider is unavailable',
    details?: Record<string, any>
  ) {
    super(message, 'PROVIDER_UNAVAILABLE', 503, { provider, ...details });
    this.name = 'ProviderUnavailableError';
    this.provider = provider;
  }
}

export class ProviderTimeoutError extends ApiError {
  public readonly provider: string;
  public readonly timeout: number;

  constructor(
    provider: string,
    timeout: number,
    details?: Record<string, any>
  ) {
    super(
      `Provider ${provider} timed out after ${timeout}ms`,
      'PROVIDER_TIMEOUT',
      504,
      { provider, timeout, ...details }
    );
    this.name = 'ProviderTimeoutError';
    this.provider = provider;
    this.timeout = timeout;
  }
}

export class ModelNotFoundError extends ApiError {
  public readonly model: string;

  constructor(model: string, details?: Record<string, any>) {
    super(`Model '${model}' not found`, 'MODEL_NOT_FOUND', 404, {
      model,
      ...details,
    });
    this.name = 'ModelNotFoundError';
    this.model = model;
  }
}

// License errors
export class LicenseError extends ApiError {
  constructor(
    message: string = 'License error',
    details?: Record<string, any>
  ) {
    super(message, 'LICENSE_ERROR', 403, details);
    this.name = 'LicenseError';
  }
}

export class LicenseExpiredError extends ApiError {
  constructor(
    message: string = 'License has expired',
    details?: Record<string, any>
  ) {
    super(message, 'LICENSE_EXPIRED', 403, details);
    this.name = 'LicenseExpiredError';
  }
}

export class LicenseLimitExceededError extends ApiError {
  constructor(
    message: string = 'License limit exceeded',
    details?: Record<string, any>
  ) {
    super(message, 'LICENSE_LIMIT_EXCEEDED', 403, details);
    this.name = 'LicenseLimitExceededError';
  }
}

export class FeatureNotAvailableError extends ApiError {
  public readonly feature: string;

  constructor(feature: string, details?: Record<string, any>) {
    super(
      `Feature '${feature}' is not available`,
      'FEATURE_NOT_AVAILABLE',
      403,
      { feature, ...details }
    );
    this.name = 'FeatureNotAvailableError';
    this.feature = feature;
  }
}

// Database errors
export class DatabaseError extends ApiError {
  constructor(
    message: string = 'Database error',
    details?: Record<string, any>
  ) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class ConnectionError extends ApiError {
  constructor(
    message: string = 'Connection error',
    details?: Record<string, any>
  ) {
    super(message, 'CONNECTION_ERROR', 503, details);
    this.name = 'ConnectionError';
  }
}

export class TransactionError extends ApiError {
  constructor(
    message: string = 'Transaction error',
    details?: Record<string, any>
  ) {
    super(message, 'TRANSACTION_ERROR', 500, details);
    this.name = 'TransactionError';
  }
}

// Security errors
export class SecurityError extends ApiError {
  constructor(
    message: string = 'Security error',
    details?: Record<string, any>
  ) {
    super(message, 'SECURITY_ERROR', 403, details);
    this.name = 'SecurityError';
  }
}

export class SanitizationError extends ApiError {
  constructor(
    message: string = 'Data sanitization error',
    details?: Record<string, any>
  ) {
    super(message, 'SANITIZATION_ERROR', 400, details);
    this.name = 'SanitizationError';
  }
}

export class EncryptionError extends ApiError {
  constructor(
    message: string = 'Encryption error',
    details?: Record<string, any>
  ) {
    super(message, 'ENCRYPTION_ERROR', 500, details);
    this.name = 'EncryptionError';
  }
}

// Network errors
export class NetworkError extends ApiError {
  constructor(
    message: string = 'Network error',
    details?: Record<string, any>
  ) {
    super(message, 'NETWORK_ERROR', 503, details);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends ApiError {
  public readonly timeout: number;

  constructor(timeout: number, details?: Record<string, any>) {
    super(`Request timed out after ${timeout}ms`, 'TIMEOUT_ERROR', 504, {
      timeout,
      ...details,
    });
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

// File and storage errors
export class FileError extends ApiError {
  constructor(message: string = 'File error', details?: Record<string, any>) {
    super(message, 'FILE_ERROR', 400, details);
    this.name = 'FileError';
  }
}

export class StorageError extends ApiError {
  constructor(
    message: string = 'Storage error',
    details?: Record<string, any>
  ) {
    super(message, 'STORAGE_ERROR', 500, details);
    this.name = 'StorageError';
  }
}

export class FileTooLargeError extends ApiError {
  public readonly maxSize: number;
  public readonly actualSize: number;

  constructor(
    maxSize: number,
    actualSize: number,
    details?: Record<string, any>
  ) {
    super(
      `File too large. Max: ${maxSize} bytes, Actual: ${actualSize} bytes`,
      'FILE_TOO_LARGE',
      413,
      { maxSize, actualSize, ...details }
    );
    this.name = 'FileTooLargeError';
    this.maxSize = maxSize;
    this.actualSize = actualSize;
  }
}

// Configuration errors
export class ConfigurationError extends ApiError {
  constructor(
    message: string = 'Configuration error',
    details?: Record<string, any>
  ) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
    this.name = 'ConfigurationError';
  }
}

export class MissingConfigError extends ApiError {
  public readonly configKey: string;

  constructor(configKey: string, details?: Record<string, any>) {
    super(`Missing configuration: ${configKey}`, 'MISSING_CONFIG', 500, {
      configKey,
      ...details,
    });
    this.name = 'MissingConfigError';
    this.configKey = configKey;
  }
}

// Error response format
export interface ErrorResponse {
  error: string;
  code: string;
  message?: string;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
  path?: string;
  method?: string;
}

// Error handler types
export interface ErrorHandler {
  canHandle(error: Error): boolean;
  handle(error: Error, request?: any): ErrorResponse;
}

// Error logging
export interface ErrorLog {
  id: string;
  error: string;
  code: string;
  message: string;
  stack?: string;
  details?: Record<string, any>;
  userId?: string;
  requestId?: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

// Error metrics
export interface ErrorMetrics {
  totalErrors: number;
  errorsByCode: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  averageResolutionTime: number;
  errorRate: number;
  topErrors: Array<{
    code: string;
    count: number;
    percentage: number;
  }>;
}
