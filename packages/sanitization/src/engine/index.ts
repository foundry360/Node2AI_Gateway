// Core sanitization engine implementation

import {
  SanitizationEngine,
  SanitizationOptions,
  SanitizationResult,
  SanitizationRule,
  AppliedRule,
  Match,
  SanitizationMetadata,
  ValidationResult,
  SanitizationError,
  PatternError,
} from '../types';
import { patternLibrary, getPatternsByCategory } from '../patterns';
import { validateRule, createRule } from '../rules';
import { calculateRiskScore, generateHash } from '../utils';

export class SupernovaSanitizationEngine implements SanitizationEngine {
  private rules: Map<string, SanitizationRule> = new Map();
  private config: {
    strictMode: boolean;
    preserveFormat: boolean;
    maxProcessingTime: number;
  };

  constructor(
    config?: Partial<{
      strictMode: boolean;
      preserveFormat: boolean;
      maxProcessingTime: number;
    }>
  ) {
    this.config = {
      strictMode: false,
      preserveFormat: true,
      maxProcessingTime: 5000,
      ...config,
    };

    this.initializeDefaultRules();
  }

  async sanitize(
    input: string,
    options: SanitizationOptions = {}
  ): Promise<SanitizationResult> {
    const startTime = Date.now();

    if (!input || typeof input !== 'string') {
      throw new SanitizationError(
        'Invalid input: must be a non-empty string',
        'INVALID_INPUT'
      );
    }

    const {
      categories = ['pii', 'phi', 'financial', 'government'],
      severity = ['low', 'medium', 'high', 'critical'],
      strictMode = this.config.strictMode,
      preserveFormat = this.config.preserveFormat,
      customRules = [],
      context = {},
    } = options;

    let sanitized = input;
    const appliedRules: AppliedRule[] = [];
    const warnings: string[] = [];
    const categoriesFound: string[] = [];
    const severityLevels: string[] = [];

    // Combine default rules with custom rules
    const allRules = this.getApplicableRules(categories, severity, customRules);

    // Process each rule
    for (const rule of allRules) {
      if (!rule.isActive) continue;

      try {
        const result = this.applyRule(
          sanitized,
          rule,
          strictMode,
          preserveFormat
        );

        if (result.matches.length > 0) {
          sanitized = result.sanitized;
          appliedRules.push({
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            severity: rule.severity,
            pattern: rule.pattern,
            replacement: rule.replacement,
            matches: result.matches,
          });

          if (!categoriesFound.includes(rule.category)) {
            categoriesFound.push(rule.category);
          }
          if (!severityLevels.includes(rule.severity)) {
            severityLevels.push(rule.severity);
          }
        }
      } catch (error) {
        const warning = `Rule ${rule.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        warnings.push(warning);

        if (strictMode) {
          throw new SanitizationError(
            `Strict mode: Rule ${rule.name} failed`,
            'RULE_FAILURE',
            { ruleId: rule.id, error: warning }
          );
        }
      }

      // Check processing time limit
      if (Date.now() - startTime > this.config.maxProcessingTime) {
        warnings.push('Processing time limit exceeded');
        break;
      }
    }

    const processingTime = Date.now() - startTime;
    const totalMatches = appliedRules.reduce(
      (sum, rule) => sum + rule.matches.length,
      0
    );
    const riskScore = calculateRiskScore(appliedRules, categoriesFound);

    const metadata: SanitizationMetadata = {
      processingTime,
      totalMatches,
      categoriesFound,
      severityLevels,
      riskScore,
    };

    const confidence = this.calculateConfidence(appliedRules, warnings);

    return {
      original: input,
      sanitized,
      rulesApplied: appliedRules,
      confidence,
      warnings,
      metadata,
    };
  }

  addRule(rule: SanitizationRule): void {
    const validation = this.validateRule(rule);
    if (!validation.isValid) {
      throw new SanitizationError(
        `Invalid rule: ${validation.errors.join(', ')}`,
        'INVALID_RULE',
        { errors: validation.errors }
      );
    }

    this.rules.set(rule.id, rule);
  }

  removeRule(ruleId: string): void {
    if (!this.rules.has(ruleId)) {
      throw new SanitizationError(`Rule ${ruleId} not found`, 'RULE_NOT_FOUND');
    }
    this.rules.delete(ruleId);
  }

  updateRule(ruleId: string, updates: Partial<SanitizationRule>): void {
    const existingRule = this.rules.get(ruleId);
    if (!existingRule) {
      throw new SanitizationError(`Rule ${ruleId} not found`, 'RULE_NOT_FOUND');
    }

    const updatedRule = { ...existingRule, ...updates, id: ruleId };
    const validation = this.validateRule(updatedRule);

    if (!validation.isValid) {
      throw new SanitizationError(
        `Invalid rule update: ${validation.errors.join(', ')}`,
        'INVALID_RULE',
        { errors: validation.errors }
      );
    }

    this.rules.set(ruleId, updatedRule);
  }

  getRules(): SanitizationRule[] {
    return Array.from(this.rules.values());
  }

  getRuleById(ruleId: string): SanitizationRule | undefined {
    return this.rules.get(ruleId);
  }

  validateRule(rule: SanitizationRule): ValidationResult {
    return validateRule(rule);
  }

  private initializeDefaultRules(): void {
    // Load default patterns from pattern library
    Object.entries(patternLibrary).forEach(([category, patterns]) => {
      patterns.forEach((pattern: any) => {
        const rule = createRule(
          pattern.name,
          pattern.pattern.source,
          pattern.replacement,
          category as any,
          pattern.severity as any,
          pattern.confidence
        );
        this.rules.set(rule.id, rule);
      });
    });
  }

  private getApplicableRules(
    categories: string[],
    severity: string[],
    customRules: SanitizationRule[]
  ): SanitizationRule[] {
    const applicableRules: SanitizationRule[] = [];

    // Add custom rules first (higher priority)
    customRules.forEach(rule => {
      if (
        categories.includes(rule.category) &&
        severity.includes(rule.severity)
      ) {
        applicableRules.push(rule);
      }
    });

    // Add default rules
    this.rules.forEach(rule => {
      if (
        categories.includes(rule.category) &&
        severity.includes(rule.severity)
      ) {
        applicableRules.push(rule);
      }
    });

    // Sort by priority (higher priority first)
    return applicableRules.sort((a, b) => b.priority - a.priority);
  }

  private applyRule(
    input: string,
    rule: SanitizationRule,
    strictMode: boolean,
    preserveFormat: boolean
  ): { sanitized: string; matches: Match[] } {
    try {
      const pattern = new RegExp(rule.pattern, 'g');
      const matches: Match[] = [];
      let sanitized = input;
      let lastIndex = 0;

      let match;
      while ((match = pattern.exec(input)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const text = match[0];

        matches.push({
          start,
          end,
          text,
          confidence: this.calculateMatchConfidence(text, rule),
        });

        // Replace the match
        const replacement = preserveFormat
          ? this.preserveFormat(text, rule.replacement)
          : rule.replacement;

        sanitized = sanitized.replace(text, replacement);
      }

      return { sanitized, matches };
    } catch (error) {
      throw new PatternError(
        `Pattern error in rule ${rule.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rule.pattern
      );
    }
  }

  private calculateMatchConfidence(
    text: string,
    rule: SanitizationRule
  ): number {
    // Base confidence from rule
    let confidence = 0.8; // Default confidence

    // Adjust based on text characteristics
    if (text.length > 10) confidence += 0.1;
    if (/[A-Z]/.test(text) && /[a-z]/.test(text)) confidence += 0.05;
    if (/\d/.test(text)) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  private preserveFormat(original: string, replacement: string): string {
    // Preserve case and formatting
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }
    if (original === original.toLowerCase()) {
      return replacement.toLowerCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  private calculateConfidence(
    appliedRules: AppliedRule[],
    warnings: string[]
  ): number {
    if (appliedRules.length === 0) return 1.0;

    const totalConfidence = appliedRules.reduce((sum, rule) => {
      const avgMatchConfidence =
        rule.matches.reduce((s, m) => s + m.confidence, 0) /
        rule.matches.length;
      return sum + avgMatchConfidence;
    }, 0);

    const avgConfidence = totalConfidence / appliedRules.length;
    const warningPenalty = warnings.length * 0.05;

    return Math.max(0, Math.min(1, avgConfidence - warningPenalty));
  }
}

// Factory function for creating engine instances
export function createSanitizationEngine(
  config?: Partial<{
    strictMode: boolean;
    preserveFormat: boolean;
    maxProcessingTime: number;
  }>
): SanitizationEngine {
  return new SupernovaSanitizationEngine(config);
}

// Default engine instance
export const defaultEngine = createSanitizationEngine();
