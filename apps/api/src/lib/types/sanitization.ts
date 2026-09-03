export interface DetectedEntity {
  type:
    | 'PERSON'
    | 'SSN'
    | 'EMAIL'
    | 'PHONE'
    | 'FAX'
    | 'CREDIT_CARD'
    | 'MEDICAL_RECORD'
    | 'ADDRESS'
    | 'STREET_ADDRESS'
    | 'CITY'
    | 'COUNTY'
    | 'PRECINCT'
    | 'ZIP_CODE'
    | 'DATE_OF_BIRTH'
    | 'ADMISSION_DATE'
    | 'DISCHARGE_DATE'
    | 'DATE_OF_DEATH'
    | 'AGE_OVER_89'
    | 'HEALTH_PLAN_BENEFICIARY_NUMBER'
    | 'ACCOUNT_NUMBER'
    | 'PASSPORT'
    | 'DRIVER_LICENSE'
    | 'LICENSE_CERTIFICATE'
    | 'VEHICLE_ID'
    | 'LICENSE_PLATE'
    | 'DEVICE_SERIAL'
    | 'URL'
    | 'IP_ADDRESS'
    | 'BIOMETRIC'
    | 'PHOTO_IMAGE'
    | 'UNIQUE_IDENTIFIER';
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
  context?: string;
}

export interface TokenMapping {
  token: string;
  originalValue: string;
  entityType: string;
  sessionId: string;
  organizationId: string;
  encryptedValue: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface SanitizationResult {
  sanitizedText: string;
  detectedEntities: DetectedEntity[];
  tokenMappings: TokenMapping[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  complianceFlags: string[];
  tokenCount?: number;
  processingTime?: number;
}

export interface SanitizationConfig {
  enablePII: boolean;
  enablePHI: boolean;
  enableFinancial: boolean;
  enableGovernment: boolean;
  customPatterns: CustomPattern[];
  encryptionKey?: string;
  tokenExpiryHours: number;
  auditLevel: 'BASIC' | 'DETAILED' | 'COMPREHENSIVE';
}

export interface CustomPattern {
  name: string;
  pattern: RegExp;
  entityType: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
}

export interface SanitizationStats {
  totalRequests: number;
  entitiesDetected: number;
  tokensGenerated: number;
  riskDistribution: Record<string, number>;
  complianceViolations: number;
  averageProcessingTime: number;
}

export interface ComplianceReport {
  organizationId: string;
  sessionId: string;
  timestamp: Date;
  riskLevel: string;
  entitiesDetected: DetectedEntity[];
  complianceFlags: string[];
  auditTrail: AuditEntry[];
}

export interface AuditEntry {
  action: string;
  timestamp: Date;
  details: Record<string, any>;
  riskLevel: string;
}
