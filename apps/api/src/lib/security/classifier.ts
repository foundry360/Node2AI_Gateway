/**
 * Data Classification Engine for Node2AI
 * Identifies and classifies sensitive data types (PII, PHI, financial, government)
 * Uses pattern matching, ML models, and rule-based detection
 */

import { DetectedEntity } from '@/lib/types/security';

export class DataClassifier {
  private patterns: Map<string, RegExp[]>;
  private mlModels: Map<string, any>;
  private organizationRules: Map<string, any[]>;

  constructor() {
    this.patterns = new Map();
    this.mlModels = new Map();
    this.organizationRules = new Map();
    this.initializePatterns();
  }

  /**
   * Classify text and detect sensitive entities
   * @param text Input text to classify
   * @param organizationId Organization identifier for custom rules
   * @returns Array of detected entities
   */
  async classifyText(
    text: string,
    organizationId: string
  ): Promise<DetectedEntity[]> {
    const entities: DetectedEntity[] = [];

    // Pattern-based detection
    const patternEntities = await this.detectWithPatterns(text);
    entities.push(...patternEntities);

    // ML-based detection
    const mlEntities = await this.detectWithML(text);
    entities.push(...mlEntities);

    // Organization-specific rules
    const orgEntities = await this.detectWithOrganizationRules(
      text,
      organizationId
    );
    entities.push(...orgEntities);

    // Merge overlapping entities
    const mergedEntities = this.mergeOverlappingEntities(entities);

    // Filter by confidence threshold
    const filteredEntities = mergedEntities.filter(
      entity => entity.confidence >= 0.5
    );

    return filteredEntities;
  }

  /**
   * Detect entities using regex patterns
   * @param text Input text
   * @returns Array of detected entities
   */
  private async detectWithPatterns(text: string): Promise<DetectedEntity[]> {
    const entities: DetectedEntity[] = [];

    for (const [category, patterns] of this.patterns) {
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          entities.push({
            type: this.getEntityType(pattern),
            category: category as
              | 'pii'
              | 'phi'
              | 'financial'
              | 'government'
              | 'custom',
            value: match[0],
            start: match.index,
            end: match.index + match[0].length,
            confidence: this.calculatePatternConfidence(pattern, match[0]),
            context: this.extractContext(text, match.index, match[0].length),
          });
        }
      }
    }

    return entities;
  }

  /**
   * Detect entities using ML models
   * @param text Input text
   * @returns Array of detected entities
   */
  private async detectWithML(text: string): Promise<DetectedEntity[]> {
    // TODO: Implement ML-based entity detection
    // This would use pre-trained models for NER (Named Entity Recognition)
    // Models could include spaCy, Transformers, or custom models

    const entities: DetectedEntity[] = [];

    // Placeholder implementation
    // In a real implementation, this would:
    // 1. Load appropriate ML models
    // 2. Preprocess text
    // 3. Run inference
    // 4. Post-process results

    return entities;
  }

  /**
   * Detect entities using organization-specific rules
   * @param text Input text
   * @param organizationId Organization identifier
   * @returns Array of detected entities
   */
  private async detectWithOrganizationRules(
    text: string,
    organizationId: string
  ): Promise<DetectedEntity[]> {
    const entities: DetectedEntity[] = [];
    const rules = this.organizationRules.get(organizationId) || [];

    for (const rule of rules) {
      const matches = text.match(new RegExp(rule.pattern, 'gi'));
      if (matches) {
        for (const match of matches) {
          const index = text.indexOf(match);
          entities.push({
            type: rule.entityType,
            category: rule.category,
            value: match,
            start: index,
            end: index + match.length,
            confidence: rule.confidence || 0.8,
            context: this.extractContext(text, index, match.length),
          });
        }
      }
    }

    return entities;
  }

  /**
   * Initialize regex patterns for common entity types
   */
  private initializePatterns(): void {
    // PII Patterns
    this.patterns.set('pii', [
      // Email addresses
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

      // Phone numbers (US format)
      /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,

      // Social Security Numbers
      /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,

      // Credit Card Numbers
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

      // Names (basic pattern)
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
    ]);

    // PHI Patterns
    this.patterns.set('phi', [
      // Medical Record Numbers
      /\bMRN[:\s]*\d{6,}\b/gi,

      // Patient IDs
      /\bPID[:\s]*\d{6,}\b/gi,

      // ICD-10 codes
      /\b[A-Z]\d{2}\.?\d{0,2}\b/g,

      // Medication names (common patterns)
      /\b(?:Aspirin|Ibuprofen|Acetaminophen|Lisinopril|Metformin)\b/gi,
    ]);

    // Financial Patterns
    this.patterns.set('financial', [
      // Bank Account Numbers
      /\b\d{8,12}\b/g,

      // Routing Numbers
      /\b\d{9}\b/g,

      // Credit Card Numbers (more specific)
      /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,

      // Account Numbers
      /\b(?:Account|Acct)[:\s#]*\d{6,}\b/gi,
    ]);

    // Government Patterns
    this.patterns.set('government', [
      // Passport Numbers
      /\b[A-Z]{2}\d{6,}\b/g,

      // Driver's License (varies by state)
      /\b[A-Z]\d{7,8}\b/g,

      // Security Clearance Levels
      /\b(?:Confidential|Secret|Top Secret)\b/gi,

      // Government IDs
      /\b(?:SSN|EIN|TIN)[:\s]*\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/gi,
    ]);
  }

  /**
   * Get entity type from regex pattern
   * @param pattern Regex pattern
   * @returns Entity type
   */
  private getEntityType(pattern: RegExp): string {
    const patternStr = pattern.toString();

    if (patternStr.includes('@')) return 'email';
    if (patternStr.includes('\\d{3}[-.\\s]?\\d{2}[-.\\s]?\\d{4}')) return 'ssn';
    if (patternStr.includes('\\d{4}[-\\s]?')) return 'credit_card';
    if (patternStr.includes('MRN')) return 'medical_record';
    if (patternStr.includes('PID')) return 'patient_id';
    if (patternStr.includes('[A-Z][a-z]+ [A-Z][a-z]+')) return 'name';

    return 'unknown';
  }

  /**
   * Calculate confidence score for pattern match
   * @param pattern Regex pattern
   * @param match Matched text
   * @returns Confidence score (0-1)
   */
  private calculatePatternConfidence(pattern: RegExp, match: string): number {
    let confidence = 0.5; // Base confidence

    // Adjust based on pattern specificity
    if (pattern.toString().includes('\\b')) confidence += 0.1; // Word boundaries
    if (pattern.toString().includes('^') || pattern.toString().includes('$'))
      confidence += 0.1; // Anchors

    // Adjust based on match characteristics
    if (match.length > 10) confidence += 0.1; // Longer matches are more likely
    if (/[A-Z]/.test(match) && /[a-z]/.test(match)) confidence += 0.1; // Mixed case

    return Math.min(confidence, 1.0);
  }

  /**
   * Extract context around detected entity
   * @param text Full text
   * @param start Start position
   * @param length Entity length
   * @returns Context string
   */
  private extractContext(text: string, start: number, length: number): string {
    const contextWindow = 50;
    const contextStart = Math.max(0, start - contextWindow);
    const contextEnd = Math.min(text.length, start + length + contextWindow);

    return text.substring(contextStart, contextEnd);
  }

  /**
   * Merge overlapping entities, keeping the one with highest confidence
   * @param entities Array of detected entities
   * @returns Merged entities
   */
  private mergeOverlappingEntities(
    entities: DetectedEntity[]
  ): DetectedEntity[] {
    if (entities.length === 0) return entities;

    // Sort by start position
    const sorted = entities.sort((a, b) => a.start - b.start);
    const merged: DetectedEntity[] = [];

    for (const entity of sorted) {
      const lastMerged = merged[merged.length - 1];

      if (!lastMerged || entity.start >= lastMerged.end) {
        // No overlap, add entity
        merged.push(entity);
      } else if (entity.confidence > lastMerged.confidence) {
        // Overlap and higher confidence, replace
        merged[merged.length - 1] = entity;
      }
      // Otherwise, keep the existing entity (higher confidence)
    }

    return merged;
  }

  /**
   * Add organization-specific rule
   * @param organizationId Organization identifier
   * @param rule Rule configuration
   */
  addOrganizationRule(
    organizationId: string,
    rule: {
      pattern: string;
      entityType: string;
      category: string;
      confidence?: number;
    }
  ): void {
    if (!this.organizationRules.has(organizationId)) {
      this.organizationRules.set(organizationId, []);
    }

    this.organizationRules.get(organizationId)!.push(rule);
  }

  /**
   * Get classification statistics
   * @returns Classification statistics
   */
  getStatistics(): {
    totalPatterns: number;
    organizationRules: number;
    mlModels: number;
  } {
    let totalPatterns = 0;
    for (const patterns of this.patterns.values()) {
      totalPatterns += patterns.length;
    }

    let organizationRules = 0;
    for (const rules of this.organizationRules.values()) {
      organizationRules += rules.length;
    }

    return {
      totalPatterns,
      organizationRules,
      mlModels: this.mlModels.size,
    };
  }
}
