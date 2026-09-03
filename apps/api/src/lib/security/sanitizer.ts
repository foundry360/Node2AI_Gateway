import {
  SanitizationResult,
  SanitizationConfig,
  DetectedEntity,
  TokenMapping,
  SanitizationStats,
  ComplianceReport,
  AuditEntry,
} from '../types/sanitization';
import { PatternDetector } from './patterns';
import { Tokenizer } from './tokenizer';

export class DataSanitizer {
  private patternDetector: PatternDetector;
  private tokenizer: Tokenizer;
  private config: SanitizationConfig;
  private stats: SanitizationStats;

  constructor(config?: Partial<SanitizationConfig>) {
    this.patternDetector = new PatternDetector();
    this.tokenizer = new Tokenizer(config?.encryptionKey);
    this.config = this.mergeConfig(config);
    this.stats = this.initializeStats();
  }

  /**
   * Main sanitization method
   */
  async sanitizeText(
    text: string,
    sessionId: string,
    organizationId: string
  ): Promise<SanitizationResult> {
    const startTime = Date.now();

    try {
      // Detect entities in the text
      const detectedEntities = this.patternDetector.detectEntities(text);

      // Filter entities based on configuration
      const filteredEntities = this.filterEntities(detectedEntities);

      // Create token mappings
      const tokenMappings = this.tokenizer.createTokenMappings(
        filteredEntities,
        sessionId,
        organizationId
      );

      // SAVE TO DATABASE
      if (tokenMappings.length > 0) {
        try {
          const { TokenMappingRepository } = await import(
            './token-mapping-repository'
          );
          const repo = new TokenMappingRepository();
          await repo.saveTokenMappings(
            tokenMappings,
            organizationId,
            sessionId
          );
        } catch (dbError) {
          console.warn('Failed to save token mappings to database:', dbError);
          // Continue with sanitization even if DB save fails
        }
      }

      // Sanitize the text
      const sanitizedText = this.tokenizer.sanitizeText(
        text,
        filteredEntities,
        tokenMappings
      );

      // Calculate risk level
      const riskLevel = this.patternDetector.getRiskLevel(filteredEntities);

      // Get compliance flags
      const complianceFlags =
        this.patternDetector.getComplianceFlags(filteredEntities);

      // Update statistics
      this.updateStats(filteredEntities, Date.now() - startTime);

      // Create audit entry
      await this.createAuditEntry(
        sessionId,
        organizationId,
        filteredEntities,
        riskLevel
      );

      return {
        sanitizedText,
        detectedEntities: filteredEntities,
        tokenMappings,
        riskLevel,
        complianceFlags,
      };
    } catch (error) {
      console.error('Sanitization failed:', error);
      throw new Error(
        `Sanitization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Desanitize text using token mappings
   */
  async desanitizeText(
    text: string,
    sessionId: string,
    organizationId: string
  ): Promise<string> {
    try {
      // FETCH FROM DATABASE
      const { TokenMappingRepository } = await import(
        './token-mapping-repository'
      );
      const repo = new TokenMappingRepository();
      const tokenMappings = await repo.getTokenMappings(
        organizationId,
        sessionId
      );

      if (tokenMappings.length === 0) {
        console.warn(`No token mappings found for session ${sessionId}`);
        return text; // Return as-is if no mappings
      }

      // Clean up expired mappings
      const validMappings =
        this.tokenizer.cleanupExpiredMappings(tokenMappings);

      if (validMappings.length === 0) {
        console.warn(`All token mappings expired for session ${sessionId}`);
        return text; // Return as-is if all expired
      }

      // Desanitize the text
      return this.tokenizer.desanitizeText(text, validMappings);
    } catch (error) {
      console.error('Desanitization failed:', error);
      return text; // Return sanitized version on error (not original to avoid data leak)
    }
  }

  /**
   * Filter entities based on configuration
   */
  private filterEntities(entities: DetectedEntity[]): DetectedEntity[] {
    return entities.filter(entity => {
      // Check if entity type is enabled
      switch (entity.type as any) {
        case 'SSN':
        case 'EMAIL':
        case 'PHONE_US':
        case 'PERSON_NAME':
          return this.config.enablePII;
        case 'MEDICAL_RECORD':
        case 'MRN':
        case 'PATIENT_ID':
          return this.config.enablePHI;
        case 'CREDIT_CARD':
        case 'AMEX':
        case 'VISA':
        case 'MASTERCARD':
          return this.config.enableFinancial;
        case 'PASSPORT_US':
        case 'PASSPORT_INTL':
        case 'DRIVER_LICENSE':
          return this.config.enableGovernment;
        default:
          return true;
      }
    });
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(
    config?: Partial<SanitizationConfig>
  ): SanitizationConfig {
    return {
      enablePII: true,
      enablePHI: true,
      enableFinancial: true,
      enableGovernment: true,
      customPatterns: [],
      tokenExpiryHours: 24,
      auditLevel: 'DETAILED',
      ...config,
    };
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): SanitizationStats {
    return {
      totalRequests: 0,
      entitiesDetected: 0,
      tokensGenerated: 0,
      riskDistribution: {},
      complianceViolations: 0,
      averageProcessingTime: 0,
    };
  }

  /**
   * Update statistics
   */
  private updateStats(
    entities: DetectedEntity[],
    processingTime: number
  ): void {
    this.stats.totalRequests++;
    this.stats.entitiesDetected += entities.length;
    this.stats.tokensGenerated += entities.length;

    // Update risk distribution
    const riskLevel = this.patternDetector.getRiskLevel(entities);
    this.stats.riskDistribution[riskLevel] =
      (this.stats.riskDistribution[riskLevel] || 0) + 1;

    // Update average processing time
    const totalTime =
      this.stats.averageProcessingTime * (this.stats.totalRequests - 1) +
      processingTime;
    this.stats.averageProcessingTime = totalTime / this.stats.totalRequests;

    // Check for compliance violations
    const complianceFlags = this.patternDetector.getComplianceFlags(entities);
    if (complianceFlags.length > 0) {
      this.stats.complianceViolations++;
    }
  }

  /**
   * Create audit entry for compliance
   */
  private async createAuditEntry(
    sessionId: string,
    organizationId: string,
    entities: DetectedEntity[],
    riskLevel: string
  ): Promise<void> {
    if (this.config.auditLevel === 'BASIC') return;

    const auditEntry: AuditEntry = {
      action: 'DATA_SANITIZATION',
      timestamp: new Date(),
      details: {
        sessionId,
        organizationId,
        entitiesDetected: entities.length,
        entityTypes: entities.map(e => e.type),
        riskLevel,
      },
      riskLevel,
    };

    // In a real implementation, this would be stored in the database
    console.log('Audit entry created:', auditEntry);
  }

  /**
   * Get sanitization statistics
   */
  getStats(): SanitizationStats {
    return { ...this.stats };
  }

  /**
   * Get compliance report
   */
  async getComplianceReport(
    organizationId: string,
    sessionId?: string
  ): Promise<ComplianceReport> {
    // In a real implementation, this would query the database
    return {
      organizationId,
      sessionId: sessionId || 'unknown',
      timestamp: new Date(),
      riskLevel: 'LOW',
      entitiesDetected: [],
      complianceFlags: [],
      auditTrail: [],
    };
  }

  /**
   * Add custom pattern
   */
  addCustomPattern(pattern: any): void {
    this.patternDetector.addCustomPattern(pattern);
    this.config.customPatterns.push(pattern);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SanitizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }
}
