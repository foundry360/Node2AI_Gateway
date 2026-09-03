import { DetectedEntity, CustomPattern } from '../types/sanitization';
import * as crypto from 'crypto';

export class PatternDetector {
  private patterns: Map<string, RegExp> = new Map();
  private customPatterns: CustomPattern[] = [];
  private patternCache: Map<string, DetectedEntity[]> = new Map();
  private maxCacheSize: number = 1000; // Limit cache size to prevent memory issues

  constructor() {
    this.initializeBuiltInPatterns();
  }

  private initializeBuiltInPatterns(): void {
    // SSN Patterns (US)
    this.patterns.set('SSN', /\b\d{3}-?\d{2}-?\d{4}\b/g);
    this.patterns.set('SSN_ALT', /\b\d{9}\b/g);

    // Email Patterns
    this.patterns.set(
      'EMAIL',
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    );

    // Phone Number Patterns
    this.patterns.set(
      'PHONE_US',
      /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g
    );
    this.patterns.set(
      'PHONE_INTL',
      /\b\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g
    );

    // Credit Card Patterns
    this.patterns.set('CREDIT_CARD', /\b(?:\d{4}[-\s]?){3}\d{4}\b/g);
    this.patterns.set('AMEX', /\b3[47]\d{13}\b/g);
    this.patterns.set('VISA', /\b4\d{12}(?:\d{3})?\b/g);
    this.patterns.set('MASTERCARD', /\b5[1-5]\d{14}\b/g);

    // Medical Record Numbers
    this.patterns.set('MRN', /\bMRN[:\s]*\d{6,12}\b/gi);
    this.patterns.set('PATIENT_ID', /\bPAT[:\s]*\d{6,12}\b/gi);

    // Date of Birth Patterns
    this.patterns.set(
      'DOB_MMDDYYYY',
      /\b(0[1-9]|1[0-2])[\/\-](0[1-9]|[12][0-9]|3[01])[\/\-](19|20)\d{2}\b/g
    );
    this.patterns.set(
      'DOB_DDMMYYYY',
      /\b(0[1-9]|[12][0-9]|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](19|20)\d{2}\b/g
    );

    // Address Patterns
    this.patterns.set(
      'STREET_ADDRESS',
      /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/gi
    );
    this.patterns.set('ZIP_CODE', /\b\d{5}(?:-\d{4})?\b/g);

    // Passport Patterns
    this.patterns.set('PASSPORT_US', /\b[A-Z]{1}\d{8}\b/g);
    this.patterns.set('PASSPORT_INTL', /\b[A-Z]{2}\d{6,9}\b/g);

    // Driver's License Patterns
    this.patterns.set('DL_US', /\b[A-Z]\d{7,8}\b/g);

    // Common Names (basic pattern)
    this.patterns.set('PERSON_NAME', /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g);

    // Fax Number Patterns (HIPAA Identifier #5)
    this.patterns.set(
      'FAX',
      /\b(?:Fax|F)[:\s]*[\(]?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/gi
    );

    // Geographic Subdivisions (HIPAA Identifier #2)
    this.patterns.set(
      'CITY',
      /\b(?:City|Municipality)[:\s]*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gi
    );
    this.patterns.set(
      'COUNTY',
      /\b(?:County|Cty)[:\s]*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gi
    );
    this.patterns.set('PRECINCT', /\b(?:Precinct|Pct)[:\s]*\d+\b/gi);

    // Medical Dates (HIPAA Identifier #3)
    this.patterns.set(
      'ADMISSION_DATE',
      /\b(?:Admission|Admitted)[:\s]*(0[1-9]|1[0-2])[\/\-](0[1-9]|[12][0-9]|3[01])[\/\-]\d{2,4}\b/gi
    );
    this.patterns.set(
      'DISCHARGE_DATE',
      /\b(?:Discharge|Discharged)[:\s]*(0[1-9]|1[0-2])[\/\-](0[1-9]|[12][0-9]|3[01])[\/\-]\d{2,4}\b/gi
    );
    this.patterns.set(
      'DATE_OF_DEATH',
      /\b(?:Date\s+of\s+Death|DOD|Died)[:\s]*(0[1-9]|1[0-2])[\/\-](0[1-9]|[12][0-9]|3[01])[\/\-]\d{2,4}\b/gi
    );

    // Ages Over 89 (HIPAA Identifier #3)
    this.patterns.set(
      'AGE_OVER_89',
      /\b(?:Age|DOB|Birth)[:\s]*(?:9[0-9]|[1-9][0-9][0-9])\s*(?:years?|yrs?|old)\b/gi
    );

    // Health Plan Beneficiary Number (HIPAA Identifier #9)
    this.patterns.set(
      'HEALTH_PLAN_BENEFICIARY_NUMBER',
      /\b(?:HBN|Health\s+Plan\s+Beneficiary|Member\s+ID|Subscriber\s+ID|Patient\s+Account)[:\s-]*\d{6,12}\b/gi
    );

    // Account Numbers (HIPAA Identifier #10)
    this.patterns.set(
      'ACCOUNT_NUMBER',
      /\b(?:Account|Acct|Acc)[:\s#-]*\d{8,12}\b/gi
    );

    // Additional License/Certificate Numbers (HIPAA Identifier #11)
    this.patterns.set(
      'LICENSE_CERTIFICATE',
      /\b(?:License|Cert|Certificate|Permit)[:\s#-]*[A-Z0-9\-]{6,12}\b/gi
    );

    // Vehicle Identifiers (HIPAA Identifier #12)
    this.patterns.set(
      'VEHICLE_ID',
      /\b(?:VIN|Vehicle\s+ID|Vehicle\s+Number)[:\s-]*[A-Z0-9]{17}\b/gi
    );
    this.patterns.set(
      'LICENSE_PLATE',
      /\b(?:License\s+Plate|Plate\s+Number|Tag\s+Number)[:\s-]*[A-Z]{1,3}-?\d{1,4}[A-Z]?\b/gi
    );

    // Device Identifiers (HIPAA Identifier #13)
    this.patterns.set(
      'DEVICE_SERIAL',
      /\b(?:Serial\s+Number|Device\s+ID|Equipment\s+ID|IMEI|Serial\s+No)[:\s#-]*[A-Z0-9\-]{6,20}\b/gi
    );

    // URLs (HIPAA Identifier #14)
    this.patterns.set(
      'URL',
      /\bhttps?:\/\/(?:[-\w.])+(?:[:\d]+)?(?:\/(?:[\w\/_.])*(?:\?(?:[\w=&%.])*)?(?:\#[\w]*)?)?\b/gi
    );

    // IP Addresses (HIPAA Identifier #15)
    this.patterns.set(
      'IP_ADDRESS',
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g
    );

    // Biometric Identifiers (HIPAA Identifier #16)
    this.patterns.set(
      'BIOMETRIC',
      /\b(?:Biometric|Fingerprint|Voice\s+Print|Voiceprint|Retinal\s+Scan|Iris\s+Scan|DNA)[:\s-]*[A-Z0-9\-]{10,40}\b/gi
    );

    // Full Face Photographic Images (HIPAA Identifier #17)
    this.patterns.set(
      'PHOTO_IMAGE',
      /\b(?:Photo|Image|Picture|Photograph|Face\s+Photo|Facial\s+Image|Patient\s+Photo)[:\s]*(?:of|patient)\s+[A-Z][a-z]+\b/gi
    );

    // Unique Identifiers (HIPAA Identifier #18)
    this.patterns.set(
      'UNIQUE_IDENTIFIER',
      /\b(?:UID|Unique\s+ID|Identifier|Unique\s+Code)[:\s-]*[A-Z0-9\-]{8,24}\b/gi
    );
  }

  /**
   * Add custom patterns for organization-specific data
   */
  addCustomPattern(pattern: CustomPattern): void {
    this.customPatterns.push(pattern);
  }

  /**
   * Detect all entities in text
   * Uses caching to improve performance for repeated patterns
   */
  detectEntities(text: string): DetectedEntity[] {
    // Generate cache key from text hash
    const textHash = crypto.createHash('sha256').update(text).digest('hex');
    const cacheKey = `pattern:${textHash}`;

    // Check cache first
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey)!;
    }

    const entities: DetectedEntity[] = [];

    // Check built-in patterns
    for (const [type, pattern] of this.patterns) {
      const matches = this.findMatches(text, pattern, type);
      entities.push(...matches);
    }

    // Check custom patterns
    for (const customPattern of this.customPatterns) {
      const matches = this.findMatches(
        text,
        customPattern.pattern,
        customPattern.entityType
      );
      entities.push(...matches);
    }

    // Remove overlapping entities (keep the most specific one)
    const result = this.removeOverlappingEntities(entities);

    // Cache result (with size limit)
    if (this.patternCache.size >= this.maxCacheSize) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.patternCache.keys().next().value;
      this.patternCache.delete(firstKey);
    }
    this.patternCache.set(cacheKey, result);

    return result;
  }

  /**
   * Find matches for a specific pattern
   */
  private findMatches(
    text: string,
    pattern: RegExp,
    entityType: string
  ): DetectedEntity[] {
    const entities: DetectedEntity[] = [];
    let match;

    // Reset regex lastIndex to ensure global search works correctly
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      const value = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + value.length;

      // Calculate confidence based on pattern specificity
      const confidence = this.calculateConfidence(entityType, value);

      entities.push({
        type: entityType as any,
        value,
        startIndex,
        endIndex,
        confidence,
        context: this.extractContext(text, startIndex, endIndex),
      });
    }

    return entities;
  }

  /**
   * Calculate confidence score for detected entity
   */
  private calculateConfidence(entityType: string, value: string): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for specific patterns
    switch (entityType) {
      case 'SSN':
        if (value.includes('-')) confidence = 0.9;
        else confidence = 0.7;
        break;
      case 'EMAIL':
        confidence = 0.95;
        break;
      case 'CREDIT_CARD':
        if (this.validateCreditCard(value)) confidence = 0.9;
        else confidence = 0.6;
        break;
      case 'PHONE_US':
      case 'FAX':
        if (value.includes('(') && value.includes(')')) confidence = 0.9;
        else confidence = 0.7;
        break;
      case 'PERSON_NAME':
        // Lower confidence for common names
        confidence = 0.3;
        break;
      case 'IP_ADDRESS':
        confidence = 0.95;
        break;
      case 'URL':
        confidence = 0.8;
        break;
      case 'HEALTH_PLAN_BENEFICIARY_NUMBER':
        confidence = 0.9;
        break;
      case 'ACCOUNT_NUMBER':
        confidence = 0.85;
        break;
      case 'VEHICLE_ID':
        if (value.length === 17) confidence = 0.95;
        else confidence = 0.7;
        break;
      case 'DEVICE_SERIAL':
        confidence = 0.85;
        break;
      case 'BIOMETRIC':
        confidence = 0.9;
        break;
      case 'UNIQUE_IDENTIFIER':
        confidence = 0.8;
        break;
      case 'ADMISSION_DATE':
      case 'DISCHARGE_DATE':
      case 'DATE_OF_DEATH':
        confidence = 0.85;
        break;
      case 'AGE_OVER_89':
        confidence = 0.9;
        break;
      default:
        confidence = 0.6;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Validate credit card number using Luhn algorithm
   */
  private validateCreditCard(cardNumber: string): boolean {
    const cleaned = cardNumber.replace(/[-\s]/g, '');
    if (!/^\d{13,19}$/.test(cleaned)) return false;

    let sum = 0;
    let isEven = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Extract context around detected entity
   */
  private extractContext(
    text: string,
    startIndex: number,
    endIndex: number,
    contextLength: number = 50
  ): string {
    const start = Math.max(0, startIndex - contextLength);
    const end = Math.min(text.length, endIndex + contextLength);
    return text.substring(start, end);
  }

  /**
   * Remove overlapping entities, keeping the most specific one
   */
  private removeOverlappingEntities(
    entities: DetectedEntity[]
  ): DetectedEntity[] {
    // Sort by start index
    entities.sort((a, b) => a.startIndex - b.startIndex);

    const filtered: DetectedEntity[] = [];
    let lastEntity: DetectedEntity | null = null;

    for (const entity of entities) {
      if (!lastEntity || entity.startIndex >= lastEntity.endIndex) {
        // No overlap
        filtered.push(entity);
        lastEntity = entity;
      } else {
        // Overlap detected - keep the one with higher confidence
        if (entity.confidence > lastEntity.confidence) {
          filtered[filtered.length - 1] = entity;
          lastEntity = entity;
        }
      }
    }

    return filtered;
  }

  /**
   * Get risk level for detected entities
   */
  getRiskLevel(
    entities: DetectedEntity[]
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (entities.length === 0) return 'LOW';

    const criticalTypes = [
      'SSN',
      'CREDIT_CARD',
      'MEDICAL_RECORD',
      'BIOMETRIC',
      'HEALTH_PLAN_BENEFICIARY_NUMBER',
    ];
    const highTypes = [
      'EMAIL',
      'PHONE_US',
      'FAX',
      'PASSPORT',
      'DATE_OF_DEATH',
      'AGE_OVER_89',
      'ACCOUNT_NUMBER',
      'IP_ADDRESS',
      'DEVICE_SERIAL',
      'VEHICLE_ID',
      'UNIQUE_IDENTIFIER',
    ];
    const mediumTypes = [
      'PERSON_NAME',
      'ADDRESS',
      'STREET_ADDRESS',
      'CITY',
      'COUNTY',
      'ADMISSION_DATE',
      'DISCHARGE_DATE',
      'LICENSE_PLATE',
      'PHOTO_IMAGE',
      'URL',
    ];

    const hasCritical = entities.some(e => criticalTypes.includes(e.type));
    const hasHigh = entities.some(e => highTypes.includes(e.type));
    const hasMedium = entities.some(e => mediumTypes.includes(e.type));

    if (hasCritical) return 'CRITICAL';
    if (hasHigh) return 'HIGH';
    if (hasMedium) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get compliance flags for detected entities
   */
  getComplianceFlags(entities: DetectedEntity[]): string[] {
    const flags: string[] = [];

    const hasSSN = entities.some(e => e.type === 'SSN');
    const hasMedical = entities.some(e => e.type === 'MEDICAL_RECORD');
    const hasHIPAAIdentifiers = entities.some(e =>
      [
        'PERSON',
        'STREET_ADDRESS',
        'CITY',
        'COUNTY',
        'ZIP_CODE',
        'DATE_OF_BIRTH',
        'ADMISSION_DATE',
        'DISCHARGE_DATE',
        'DATE_OF_DEATH',
        'AGE_OVER_89',
        'PHONE',
        'FAX',
        'EMAIL',
        'SSN',
        'MEDICAL_RECORD',
        'HEALTH_PLAN_BENEFICIARY_NUMBER',
        'ACCOUNT_NUMBER',
        'LICENSE_CERTIFICATE',
        'VEHICLE_ID',
        'LICENSE_PLATE',
        'DEVICE_SERIAL',
        'URL',
        'IP_ADDRESS',
        'BIOMETRIC',
        'PHOTO_IMAGE',
        'UNIQUE_IDENTIFIER',
      ].includes(e.type)
    );
    const hasFinancial = entities.some(e =>
      ['CREDIT_CARD', 'EMAIL'].includes(e.type)
    );
    const hasGovernment = entities.some(e =>
      ['PASSPORT', 'DRIVER_LICENSE'].includes(e.type)
    );

    if (hasHIPAAIdentifiers) flags.push('HIPAA_POTENTIAL', 'PHI_DETECTED');
    if (hasMedical) flags.push('HIPAA_VIOLATION', 'PHI_DETECTED');
    if (hasSSN) flags.push('PII_DETECTED');
    if (hasFinancial) flags.push('PCI_DSS_POTENTIAL', 'FINANCIAL_DATA');
    if (hasGovernment) flags.push('GOVERNMENT_DATA', 'CLASSIFIED_POTENTIAL');

    return flags;
  }
}
