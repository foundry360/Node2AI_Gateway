/**
 * Security-related TypeScript types for Node2AI
 * Defines interfaces for data sanitization, classification, and encryption
 */

// Entity detection and classification
export interface DetectedEntity {
  type: string;
  category: 'pii' | 'phi' | 'financial' | 'government' | 'custom';
  value: string;
  start: number;
  end: number;
  confidence: number;
  context: string;
}

export interface TokenMapping {
  token: string;
  originalValue: string;
  entityType: string;
  category: string;
  confidence: number;
  position: number;
  length: number;
}

export interface SanitizationResult {
  sanitizedText: string;
  detectedEntities: DetectedEntity[];
  tokenMappings: TokenMapping[];
  sessionId: string;
  confidence: number;
  warnings: string[];
}

// Data classification
export interface ClassificationRule {
  id: string;
  name: string;
  pattern: string;
  category: string;
  entityType: string;
  confidence: number;
  isActive: boolean;
  description?: string;
  tags?: string[];
}

export interface ClassificationResult {
  entities: DetectedEntity[];
  categories: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  recommendations: string[];
}

// Encryption and security
export interface EncryptionConfig {
  algorithm: string;
  keySize: number;
  mode: string;
  padding: string;
}

export interface EncryptedData {
  data: string;
  iv: string;
  tag?: string;
  algorithm: string;
  keyId: string;
}

export interface DecryptionResult {
  data: string;
  success: boolean;
  error?: string;
}

// Audit and compliance
export interface SecurityEvent {
  id: string;
  type: 'sanitization' | 'classification' | 'encryption' | 'access' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  userId: string;
  sessionId: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
}

export interface ComplianceCheck {
  id: string;
  type: 'gdpr' | 'hipaa' | 'sox' | 'pci' | 'custom';
  status: 'pass' | 'fail' | 'warning';
  description: string;
  details: Record<string, any>;
  timestamp: string;
  remediated: boolean;
}

// Data retention and privacy
export interface DataRetentionPolicy {
  id: string;
  name: string;
  description: string;
  dataTypes: string[];
  retentionPeriod: number; // in days
  action: 'delete' | 'anonymize' | 'archive';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrivacySettings {
  userId: string;
  dataProcessing: {
    analytics: boolean;
    marketing: boolean;
    research: boolean;
    thirdParty: boolean;
  };
  dataRetention: {
    personalData: number; // days
    usageData: number; // days
    auditLogs: number; // days
  };
  sharing: {
    anonymized: boolean;
    aggregated: boolean;
    identifiable: boolean;
  };
  updatedAt: string;
}

// Access control and permissions
export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  rules: SecurityRule[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityRule {
  id: string;
  name: string;
  condition: string;
  action: 'allow' | 'deny' | 'sanitize' | 'encrypt';
  priority: number;
  isActive: boolean;
}

export interface AccessControl {
  userId: string;
  resources: string[];
  permissions: string[];
  conditions?: Record<string, any>;
  expiresAt?: string;
  createdAt: string;
}

// Threat detection and monitoring
export interface ThreatDetection {
  id: string;
  type: 'anomaly' | 'intrusion' | 'data_leak' | 'unauthorized_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  indicators: string[];
  confidence: number;
  timestamp: string;
  source: string;
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  averageConfidence: number;
  falsePositiveRate: number;
  detectionLatency: number;
  coverage: number;
}

// Data anonymization
export interface AnonymizationRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  category: string;
  isActive: boolean;
  description?: string;
}

export interface AnonymizationResult {
  originalText: string;
  anonymizedText: string;
  rulesApplied: string[];
  confidence: number;
  warnings: string[];
}

// Security configuration
export interface SecurityConfig {
  sanitization: {
    enabled: boolean;
    strictMode: boolean;
    preserveFormat: boolean;
    customRules: string[];
  };
  encryption: {
    enabled: boolean;
    algorithm: string;
    keyRotation: number; // days
    atRest: boolean;
    inTransit: boolean;
  };
  audit: {
    enabled: boolean;
    retention: number; // days
    level: 'basic' | 'detailed' | 'comprehensive';
    realTime: boolean;
  };
  access: {
    mfa: boolean;
    sessionTimeout: number; // minutes
    ipWhitelist: string[];
    rateLimit: {
      enabled: boolean;
      requests: number;
      window: number; // minutes
    };
  };
}

// Security validation
export interface SecurityValidation {
  isValid: boolean;
  score: number;
  issues: SecurityIssue[];
  recommendations: string[];
  lastChecked: string;
}

export interface SecurityIssue {
  type: 'configuration' | 'permissions' | 'encryption' | 'audit' | 'access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  remediation: string;
  affected: string[];
}

// Data lineage and tracking
export interface DataLineage {
  id: string;
  dataId: string;
  source: string;
  transformations: DataTransformation[];
  destinations: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DataTransformation {
  id: string;
  type: 'sanitization' | 'encryption' | 'anonymization' | 'aggregation';
  description: string;
  timestamp: string;
  operator: string;
  parameters: Record<string, any>;
}

// Security incidents
export interface SecurityIncident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'contained' | 'resolved';
  affectedUsers: string[];
  affectedData: string[];
  timeline: IncidentEvent[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface IncidentEvent {
  timestamp: string;
  type: 'detected' | 'investigated' | 'contained' | 'resolved';
  description: string;
  actor: string;
  details: Record<string, any>;
}
