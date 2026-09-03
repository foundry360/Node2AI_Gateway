// SDK Types and Interfaces

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

// Health Status Types
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

// Client Configuration
export interface SupernovaClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
  version?: string;
}

// API Client Types
export interface ApiClient {
  auth: AuthClient;
  users: UsersClient;
  models: ModelsClient;
  sanitization: SanitizationClient;
  compliance: ComplianceClient;
  health: HealthClient;
}

export interface AuthClient {
  login(credentials: LoginCredentials): Promise<AuthResponse>;
  logout(): Promise<void>;
  refreshToken(): Promise<AuthResponse>;
  getProfile(): Promise<User>;
  changePassword(request: ChangePasswordRequest): Promise<void>;
}

export interface UsersClient {
  list(options?: ListOptions): Promise<PaginatedResponse<User>>;
  get(id: string): Promise<User>;
  create(user: CreateUserRequest): Promise<User>;
  update(id: string, user: UpdateUserRequest): Promise<User>;
  delete(id: string): Promise<void>;
  getPermissions(id: string): Promise<Permission[]>;
  updatePermissions(id: string, permissions: Permission[]): Promise<void>;
}

export interface ModelsClient {
  list(options?: ListOptions): Promise<PaginatedResponse<AIModel>>;
  get(id: string): Promise<AIModel>;
  create(model: CreateModelRequest): Promise<AIModel>;
  update(id: string, model: UpdateModelRequest): Promise<AIModel>;
  delete(id: string): Promise<void>;
  test(id: string, input: string): Promise<ModelTestResponse>;
  getCapabilities(): Promise<ModelCapability[]>;
}

export interface SanitizationClient {
  sanitize(
    input: string,
    options?: SanitizationOptions
  ): Promise<SanitizationResult>;
  getRules(options?: ListOptions): Promise<PaginatedResponse<SanitizationRule>>;
  createRule(rule: CreateRuleRequest): Promise<SanitizationRule>;
  updateRule(id: string, rule: UpdateRuleRequest): Promise<SanitizationRule>;
  deleteRule(id: string): Promise<void>;
  testRule(rule: TestRuleRequest): Promise<TestRuleResponse>;
  getCategories(): Promise<string[]>;
  getSeverityLevels(): Promise<string[]>;
}

export interface ComplianceClient {
  getReports(
    options?: ListOptions
  ): Promise<PaginatedResponse<ComplianceReport>>;
  generateReport(request: GenerateReportRequest): Promise<ComplianceReport>;
  getAuditLogs(options?: AuditLogOptions): Promise<PaginatedResponse<AuditLog>>;
  getFindings(options?: FindingsOptions): Promise<ComplianceFinding[]>;
  exportReport(id: string, format: 'pdf' | 'csv' | 'json'): Promise<Blob>;
}

export interface HealthClient {
  check(): Promise<HealthStatus>;
  getMetrics(): Promise<Metrics>;
  getVersion(): Promise<VersionInfo>;
}

// Request/Response Types
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  role: string;
  permissions?: Permission[];
  tenantId?: string;
}

export interface UpdateUserRequest {
  name?: string;
  role?: string;
  permissions?: Permission[];
  isActive?: boolean;
}

export interface CreateModelRequest {
  name: string;
  provider: string;
  model: string;
  version: string;
  capabilities: string[];
  config: Record<string, any>;
}

export interface UpdateModelRequest {
  name?: string;
  isActive?: boolean;
  config?: Record<string, any>;
}

export interface ModelTestResponse {
  success: boolean;
  output: string;
  processingTime: number;
  tokensUsed: number;
  cost: number;
}

export interface SanitizationOptions {
  categories?: string[];
  severity?: string[];
  strictMode?: boolean;
  preserveFormat?: boolean;
  customRules?: string[];
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  category: string;
  severity: string;
  matches: number;
}

export interface SanitizationMetadata {
  processingTime: number;
  totalMatches: number;
  categoriesFound: string[];
  severityLevels: string[];
  riskScore: number;
}

export interface CreateRuleRequest {
  name: string;
  pattern: string;
  replacement: string;
  category: string;
  severity: string;
  priority?: number;
  description?: string;
  tags?: string[];
}

export interface UpdateRuleRequest {
  name?: string;
  pattern?: string;
  replacement?: string;
  category?: string;
  severity?: string;
  priority?: number;
  isActive?: boolean;
  description?: string;
  tags?: string[];
}

export interface TestRuleRequest {
  pattern: string;
  replacement: string;
  testInput: string;
}

export interface TestRuleResponse {
  success: boolean;
  output: string;
  matches: number;
  errors: string[];
}

export interface GenerateReportRequest {
  type: 'gdpr' | 'hipaa' | 'sox' | 'custom';
  period: {
    start: string;
    end: string;
  };
  includeAuditLogs?: boolean;
  includeFindings?: boolean;
}

export interface AuditLogOptions extends ListOptions {
  userId?: string;
  action?: string;
  resource?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
}

export interface FindingsOptions {
  category?: string;
  severity?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// Common Types
export interface ListOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  filter?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Metrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  sanitization: {
    totalProcessed: number;
    averageProcessingTime: number;
    rulesApplied: number;
  };
  compliance: {
    reportsGenerated: number;
    findingsDetected: number;
    auditLogsCreated: number;
  };
}

export interface VersionInfo {
  version: string;
  buildDate: string;
  features: string[];
  deployment: {
    mode: string;
    environment: string;
  };
}

// Client interface (to avoid circular dependencies)
export interface ISupernovaClient {
  setAuthToken(token: string, refreshToken?: string): void;
  clearAuth(): void;
}

// Error Types
export class SupernovaSDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SupernovaSDKError';
  }
}

export class AuthenticationError extends SupernovaSDKError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends SupernovaSDKError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends SupernovaSDKError {
  constructor(message: string, field: string) {
    super(message, 'VALIDATION_ERROR', 400, { field });
    this.name = 'ValidationError';
  }
}

export class NetworkError extends SupernovaSDKError {
  constructor(message: string, originalError?: Error) {
    super(message, 'NETWORK_ERROR', 0, {
      originalError: originalError?.message,
    });
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends SupernovaSDKError {
  constructor(message: string, retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class ServerError extends SupernovaSDKError {
  constructor(message: string, statusCode: number) {
    super(message, 'SERVER_ERROR', statusCode);
    this.name = 'ServerError';
  }
}
