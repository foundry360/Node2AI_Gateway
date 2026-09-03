// Sanitization Engine Types

export interface SanitizationEngine {
  sanitize(
    input: string,
    options?: SanitizationOptions
  ): Promise<SanitizationResult>;
  addRule(rule: SanitizationRule): void;
  removeRule(ruleId: string): void;
  updateRule(ruleId: string, rule: Partial<SanitizationRule>): void;
  getRules(): SanitizationRule[];
  getRuleById(ruleId: string): SanitizationRule | undefined;
  validateRule(rule: SanitizationRule): ValidationResult;
}

export interface SanitizationOptions {
  categories?: string[];
  severity?: string[];
  strictMode?: boolean;
  preserveFormat?: boolean;
  customRules?: SanitizationRule[];
  context?: Record<string, any>;
}

export interface SanitizationResult {
  original: string;
  sanitized: string;
  rulesApplied: AppliedRule[];
  confidence: number;
  warnings: string[];
  metadata: SanitizationMetadata;
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  category: string;
  severity: string;
  pattern: string;
  replacement: string;
  matches: Match[];
}

export interface Match {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface SanitizationMetadata {
  processingTime: number;
  totalMatches: number;
  categoriesFound: string[];
  severityLevels: string[];
  riskScore: number;
}

export interface SanitizationRule {
  id: string;
  name: string;
  description?: string;
  pattern: string;
  replacement: string;
  category: SanitizationCategory;
  severity: SanitizationSeverity;
  isActive: boolean;
  priority: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  testCases?: TestCase[];
}

export type SanitizationCategory =
  | 'pii'
  | 'phi'
  | 'financial'
  | 'government'
  | 'custom';

export type SanitizationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface TestCase {
  input: string;
  expectedOutput: string;
  description?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Pattern matching types
export interface PatternMatch {
  pattern: RegExp;
  category: string;
  severity: string;
  replacement: string;
  confidence: number;
}

export interface PatternLibrary {
  pii: PatternDefinition[];
  phi: PatternDefinition[];
  financial: PatternDefinition[];
  government: PatternDefinition[];
  custom: PatternDefinition[];
}

export interface PatternDefinition {
  name: string;
  pattern: RegExp;
  replacement: string;
  category: string;
  severity: string;
  confidence: number;
  description: string;
  examples: string[];
}

// Compliance and audit types
export interface ComplianceCheck {
  category: string;
  severity: string;
  found: boolean;
  count: number;
  details: string[];
}

export interface SanitizationAudit {
  id: string;
  timestamp: string;
  inputLength: number;
  outputLength: number;
  rulesApplied: number;
  categoriesFound: string[];
  severityLevels: string[];
  processingTime: number;
  riskScore: number;
  complianceChecks: ComplianceCheck[];
}

// Configuration types
export interface SanitizationConfig {
  strictMode: boolean;
  preserveFormat: boolean;
  maxProcessingTime: number;
  enableAuditLogging: boolean;
  complianceMode: 'strict' | 'standard' | 'relaxed';
  customCategories: string[];
  excludedPatterns: string[];
}

// Error types
export class SanitizationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SanitizationError';
  }
}

export class PatternError extends SanitizationError {
  constructor(message: string, pattern: string) {
    super(message, 'PATTERN_ERROR', { pattern });
    this.name = 'PatternError';
  }
}

export class ValidationError extends SanitizationError {
  constructor(message: string, field: string) {
    super(message, 'VALIDATION_ERROR', { field });
    this.name = 'ValidationError';
  }
}

export class ComplianceError extends SanitizationError {
  constructor(message: string, category: string) {
    super(message, 'COMPLIANCE_ERROR', { category });
    this.name = 'ComplianceError';
  }
}
