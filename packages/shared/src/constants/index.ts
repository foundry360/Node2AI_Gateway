// Constants for SupernovaAI

export const DEPLOYMENT_MODES = {
  CLOUD: 'cloud',
  SELF_HOSTED: 'self-hosted',
  AIRGAP: 'airgap',
} as const;

export const LICENSE_TYPES = {
  ENTERPRISE: 'enterprise',
  PROFESSIONAL: 'professional',
  STANDARD: 'standard',
} as const;

export const USER_ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  AUDITOR: 'auditor',
} as const;

export const MODEL_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  LOCAL: 'local',
  CUSTOM: 'custom',
} as const;

export const MODEL_CAPABILITIES = {
  TEXT_GENERATION: 'text-generation',
  TEXT_COMPLETION: 'text-completion',
  CHAT: 'chat',
  EMBEDDINGS: 'embeddings',
  IMAGE_GENERATION: 'image-generation',
  CODE_GENERATION: 'code-generation',
  TRANSLATION: 'translation',
  SUMMARIZATION: 'summarization',
} as const;

export const SANITIZATION_CATEGORIES = {
  PII: 'pii',
  PHI: 'phi',
  FINANCIAL: 'financial',
  GOVERNMENT: 'government',
  CUSTOM: 'custom',
} as const;

export const SANITIZATION_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export const COMPLIANCE_MODES = {
  STRICT: 'strict',
  STANDARD: 'standard',
  RELAXED: 'relaxed',
} as const;

export const COMPLIANCE_TYPES = {
  GDPR: 'gdpr',
  HIPAA: 'hipaa',
  SOX: 'sox',
  CUSTOM: 'custom',
} as const;

export const AUDIT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
} as const;

export const HEALTH_CHECK_STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  WARN: 'warn',
} as const;

// API Constants
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    PROFILE: '/api/auth/profile',
  },
  USERS: {
    LIST: '/api/users',
    CREATE: '/api/users',
    GET: '/api/users/:id',
    UPDATE: '/api/users/:id',
    DELETE: '/api/users/:id',
  },
  MODELS: {
    LIST: '/api/models',
    CREATE: '/api/models',
    GET: '/api/models/:id',
    UPDATE: '/api/models/:id',
    DELETE: '/api/models/:id',
    TEST: '/api/models/:id/test',
  },
  SANITIZATION: {
    RULES: '/api/sanitization/rules',
    SANITIZE: '/api/sanitization/sanitize',
    TEST: '/api/sanitization/test',
  },
  COMPLIANCE: {
    REPORTS: '/api/compliance/reports',
    AUDIT_LOGS: '/api/compliance/audit-logs',
    FINDINGS: '/api/compliance/findings',
  },
  HEALTH: '/api/health',
  METRICS: '/api/metrics',
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYMENT_REQUIRED: 402,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error Codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  LICENSE_ERROR: 'LICENSE_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE_ERROR: 'SERVICE_UNAVAILABLE_ERROR',
} as const;

// Feature Flags
export const FEATURE_FLAGS = {
  SANITIZATION: 'sanitization',
  AUDIT_LOGS: 'audit_logs',
  COMPLIANCE_REPORTS: 'compliance_reports',
  OFFLINE_MODE: 'offline_mode',
  MULTI_TENANT: 'multi_tenant',
  SSO: 'sso',
} as const;

// Default Configuration
export const DEFAULT_CONFIG = {
  API_PORT: 3001,
  WEB_PORT: 3000,
  DATABASE_POOL_SIZE: 10,
  REDIS_DB: 0,
  SESSION_TIMEOUT: 3600, // 1 hour
  DATA_RETENTION_DAYS: 30,
  HEALTH_CHECK_INTERVAL: 30, // seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // milliseconds
} as const;

// Rate Limiting
export const RATE_LIMITS = {
  API: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 1000,
  },
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_ATTEMPTS: 5,
  },
  SANITIZATION: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 100,
  },
} as const;

// File Size Limits
export const FILE_LIMITS = {
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_MODEL_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
  MAX_BACKUP_SIZE: 50 * 1024 * 1024 * 1024, // 50GB
} as const;

// Supported File Types
export const SUPPORTED_FILE_TYPES = {
  DOCUMENTS: ['.pdf', '.doc', '.docx', '.txt', '.rtf'],
  IMAGES: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'],
  DATA: ['.csv', '.json', '.xml', '.yaml', '.yml'],
  MODELS: ['.bin', '.safetensors', '.gguf', '.pt', '.pth'],
} as const;

// Environment Variables
export const ENV_VARS = {
  DEPLOYMENT_MODE: 'DEPLOYMENT_MODE',
  LICENSE_KEY: 'SUPERNOVA_LICENSE_KEY',
  LICENSE_TYPE: 'SUPERNOVA_LICENSE_TYPE',
  DATABASE_URL: 'DATABASE_URL',
  REDIS_URL: 'REDIS_URL',
  API_SECRET_KEY: 'API_SECRET_KEY',
  JWT_SECRET: 'JWT_SECRET',
  ENCRYPTION_KEY: 'ENCRYPTION_KEY',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  LOCAL_MODEL_PATH: 'LOCAL_MODEL_PATH',
  AIRGAP_MODE: 'AIRGAP_MODE',
  SANITIZATION_ENGINE: 'SANITIZATION_ENGINE',
  COMPLIANCE_MODE: 'COMPLIANCE_MODE',
  LOG_LEVEL: 'LOG_LEVEL',
  METRICS_ENABLED: 'METRICS_ENABLED',
} as const;
