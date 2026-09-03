// Proprietary data sanitization patterns for SupernovaAI

import { PatternDefinition, PatternLibrary } from '../types';

// PII (Personally Identifiable Information) Patterns
export const piiPatterns: PatternDefinition[] = [
  {
    name: 'SSN',
    pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
    replacement: '[SSN-REDACTED]',
    category: 'pii',
    severity: 'critical',
    confidence: 0.95,
    description: 'Social Security Number',
    examples: ['123-45-6789', '123456789'],
  },
  {
    name: 'Email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL-REDACTED]',
    category: 'pii',
    severity: 'high',
    confidence: 0.9,
    description: 'Email address',
    examples: ['user@example.com', 'test.email+tag@domain.co.uk'],
  },
  {
    name: 'Phone',
    pattern:
      /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    replacement: '[PHONE-REDACTED]',
    category: 'pii',
    severity: 'high',
    confidence: 0.85,
    description: 'Phone number',
    examples: ['(555) 123-4567', '555-123-4567', '+1 555 123 4567'],
  },
  {
    name: 'CreditCard',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: '[CARD-REDACTED]',
    category: 'pii',
    severity: 'critical',
    confidence: 0.9,
    description: 'Credit card number',
    examples: ['4111 1111 1111 1111', '4111-1111-1111-1111'],
  },
  {
    name: 'DriverLicense',
    pattern: /\b[A-Z]{1,2}\d{6,8}\b/g,
    replacement: '[DL-REDACTED]',
    category: 'pii',
    severity: 'high',
    confidence: 0.8,
    description: 'Driver license number',
    examples: ['D1234567', 'CA12345678'],
  },
];

// PHI (Protected Health Information) Patterns
export const phiPatterns: PatternDefinition[] = [
  {
    name: 'MedicalRecord',
    pattern: /\bMRN[:\s]*\d{6,12}\b/gi,
    replacement: '[MRN-REDACTED]',
    category: 'phi',
    severity: 'critical',
    confidence: 0.95,
    description: 'Medical Record Number',
    examples: ['MRN: 123456789', 'MRN 987654321'],
  },
  {
    name: 'PatientID',
    pattern: /\bPAT[:\s]*\d{6,12}\b/gi,
    replacement: '[PATIENT-ID-REDACTED]',
    category: 'phi',
    severity: 'critical',
    confidence: 0.95,
    description: 'Patient ID',
    examples: ['PAT: 123456789', 'PAT 987654321'],
  },
  {
    name: 'DiagnosisCode',
    pattern: /\b[A-Z]\d{2}(?:\.\d{1,3})?\b/g,
    replacement: '[DX-REDACTED]',
    category: 'phi',
    severity: 'high',
    confidence: 0.85,
    description: 'ICD-10 Diagnosis Code',
    examples: ['A12.3', 'Z99.9', 'F32.9'],
  },
  {
    name: 'InsuranceID',
    pattern: /\b(?:INS|POL)[:\s]*\d{6,15}\b/gi,
    replacement: '[INSURANCE-REDACTED]',
    category: 'phi',
    severity: 'high',
    confidence: 0.9,
    description: 'Insurance ID',
    examples: ['INS: 123456789', 'POL 987654321'],
  },
  {
    name: 'DateOfBirth',
    pattern: /\b(?:DOB|Birth)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
    replacement: '[DOB-REDACTED]',
    category: 'phi',
    severity: 'high',
    confidence: 0.8,
    description: 'Date of Birth',
    examples: ['DOB: 01/15/1990', 'Birth: 12-25-1985'],
  },
];

// Financial Patterns
export const financialPatterns: PatternDefinition[] = [
  {
    name: 'BankAccount',
    pattern: /\b\d{8,17}\b/g,
    replacement: '[ACCOUNT-REDACTED]',
    category: 'financial',
    severity: 'critical',
    confidence: 0.7,
    description: 'Bank account number',
    examples: ['1234567890123456', '9876543210987654'],
  },
  {
    name: 'RoutingNumber',
    pattern: /\b\d{9}\b/g,
    replacement: '[ROUTING-REDACTED]',
    category: 'financial',
    severity: 'critical',
    confidence: 0.8,
    description: 'Bank routing number',
    examples: ['123456789', '987654321'],
  },
  {
    name: 'TaxID',
    pattern: /\b(?:EIN|TIN)[:\s]*\d{2}-?\d{7}\b/gi,
    replacement: '[TAX-ID-REDACTED]',
    category: 'financial',
    severity: 'critical',
    confidence: 0.95,
    description: 'Tax ID (EIN/TIN)',
    examples: ['EIN: 12-3456789', 'TIN 98-7654321'],
  },
  {
    name: 'SWIFT',
    pattern: /\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/g,
    replacement: '[SWIFT-REDACTED]',
    category: 'financial',
    severity: 'high',
    confidence: 0.9,
    description: 'SWIFT/BIC code',
    examples: ['CHASUS33', 'DEUTDEFF'],
  },
];

// Government Patterns
export const governmentPatterns: PatternDefinition[] = [
  {
    name: 'Passport',
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
    replacement: '[PASSPORT-REDACTED]',
    category: 'government',
    severity: 'critical',
    confidence: 0.85,
    description: 'Passport number',
    examples: ['A1234567', 'CA123456789'],
  },
  {
    name: 'Visa',
    pattern: /\b(?:VISA|V)[:\s]*[A-Z0-9]{8,12}\b/gi,
    replacement: '[VISA-REDACTED]',
    category: 'government',
    severity: 'high',
    confidence: 0.8,
    description: 'Visa number',
    examples: ['VISA: A12345678', 'V B987654321'],
  },
  {
    name: 'AlienNumber',
    pattern: /\bA\d{8,9}\b/g,
    replacement: '[ALIEN-REDACTED]',
    category: 'government',
    severity: 'critical',
    confidence: 0.9,
    description: 'Alien Registration Number',
    examples: ['A12345678', 'A987654321'],
  },
  {
    name: 'CaseNumber',
    pattern: /\b(?:CASE|REF)[:\s]*[A-Z0-9]{6,12}\b/gi,
    replacement: '[CASE-REDACTED]',
    category: 'government',
    severity: 'high',
    confidence: 0.8,
    description: 'Government case number',
    examples: ['CASE: ABC123456', 'REF XYZ789012'],
  },
];

// Custom patterns for specific industries
export const customPatterns: PatternDefinition[] = [
  {
    name: 'EmployeeID',
    pattern: /\bEMP[:\s]*\d{4,8}\b/gi,
    replacement: '[EMP-ID-REDACTED]',
    category: 'custom',
    severity: 'medium',
    confidence: 0.8,
    description: 'Employee ID',
    examples: ['EMP: 12345', 'EMP 67890'],
  },
  {
    name: 'CustomerID',
    pattern: /\b(?:CUST|CUSTOMER)[:\s]*\d{4,10}\b/gi,
    replacement: '[CUSTOMER-ID-REDACTED]',
    category: 'custom',
    severity: 'medium',
    confidence: 0.8,
    description: 'Customer ID',
    examples: ['CUST: 123456', 'CUSTOMER 789012'],
  },
];

// Complete pattern library
export const patternLibrary: PatternLibrary = {
  pii: piiPatterns,
  phi: phiPatterns,
  financial: financialPatterns,
  government: governmentPatterns,
  custom: customPatterns,
};

// Pattern utilities
export function getPatternsByCategory(category: string): PatternDefinition[] {
  return patternLibrary[category as keyof PatternLibrary] || [];
}

export function getPatternsBySeverity(severity: string): PatternDefinition[] {
  const allPatterns = Object.values(patternLibrary).flat();
  return allPatterns.filter(pattern => pattern.severity === severity);
}

export function getHighConfidencePatterns(
  threshold: number = 0.8
): PatternDefinition[] {
  const allPatterns = Object.values(patternLibrary).flat();
  return allPatterns.filter(pattern => pattern.confidence >= threshold);
}

export function validatePattern(pattern: RegExp): boolean {
  try {
    pattern.test('test');
    return true;
  } catch {
    return false;
  }
}

export function createCustomPattern(
  name: string,
  pattern: string,
  replacement: string,
  category: string,
  severity: string,
  confidence: number = 0.8
): PatternDefinition {
  return {
    name,
    pattern: new RegExp(pattern, 'g'),
    replacement,
    category,
    severity,
    confidence,
    description: `Custom pattern: ${name}`,
    examples: [],
  };
}
