// Utility functions for sanitization engine

import * as crypto from 'crypto';
import { AppliedRule } from '../types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a hash for data integrity
 */
export function generateHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Calculate risk score based on applied rules
 */
export function calculateRiskScore(
  appliedRules: AppliedRule[],
  categoriesFound: string[]
): number {
  if (appliedRules.length === 0) return 0;

  const severityWeights = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  const categoryWeights = {
    pii: 3,
    phi: 4,
    financial: 4,
    government: 5,
    custom: 1,
  };

  let totalScore = 0;
  let totalWeight = 0;

  appliedRules.forEach(rule => {
    const severityWeight =
      severityWeights[rule.severity as keyof typeof severityWeights] || 1;
    const categoryWeight =
      categoryWeights[rule.category as keyof typeof categoryWeights] || 1;
    const matchCount = rule.matches.length;

    const ruleScore = severityWeight * categoryWeight * matchCount;
    totalScore += ruleScore;
    totalWeight += categoryWeight * matchCount;
  });

  // Normalize to 0-100 scale
  const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 25 : 0;
  return Math.min(100, Math.max(0, normalizedScore));
}

/**
 * Sanitize text for logging (remove sensitive patterns)
 */
export function sanitizeForLogging(text: string): string {
  const sensitivePatterns = [
    /\b\d{3}-?\d{2}-?\d{4}\b/g, // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
    /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g, // Phone
    /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, // Credit Card
  ];

  let sanitized = text;
  sensitivePatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });

  return sanitized;
}

/**
 * Check if text contains sensitive data
 */
export function containsSensitiveData(text: string): {
  hasSensitiveData: boolean;
  categories: string[];
  confidence: number;
} {
  const patterns = {
    pii: [
      /\b\d{3}-?\d{2}-?\d{4}\b/g, // SSN
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g, // Phone
    ],
    financial: [
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, // Credit Card
      /\b\d{8,17}\b/g, // Bank Account
    ],
    phi: [
      /\bMRN[:\s]*\d{6,12}\b/gi, // Medical Record
      /\b[A-Z]\d{2}(?:\.\d{1,3})?\b/g, // Diagnosis Code
    ],
  };

  const categories: string[] = [];
  let totalMatches = 0;

  Object.entries(patterns).forEach(([category, categoryPatterns]) => {
    categoryPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        if (!categories.includes(category)) {
          categories.push(category);
        }
        totalMatches += matches.length;
      }
    });
  });

  const confidence = totalMatches > 0 ? Math.min(1, totalMatches / 10) : 0;

  return {
    hasSensitiveData: categories.length > 0,
    categories,
    confidence,
  };
}

/**
 * Format sanitization result for display
 */
export function formatSanitizationResult(result: any): string {
  const lines = [
    `Original Length: ${result.original.length} characters`,
    `Sanitized Length: ${result.sanitized.length} characters`,
    `Rules Applied: ${result.rulesApplied.length}`,
    `Confidence: ${(result.confidence * 100).toFixed(1)}%`,
    `Risk Score: ${result.metadata.riskScore.toFixed(1)}/100`,
    `Processing Time: ${result.metadata.processingTime}ms`,
    `Categories Found: ${result.metadata.categoriesFound.join(', ')}`,
    `Severity Levels: ${result.metadata.severityLevels.join(', ')}`,
  ];

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.length}`);
    result.warnings.forEach((warning: string) => {
      lines.push(`  - ${warning}`);
    });
  }

  return lines.join('\n');
}

/**
 * Create a summary of sanitization statistics
 */
export function createSanitizationSummary(results: any[]): {
  totalProcessed: number;
  totalRulesApplied: number;
  averageConfidence: number;
  averageRiskScore: number;
  categoriesFound: Record<string, number>;
  severityLevels: Record<string, number>;
  processingTime: {
    total: number;
    average: number;
    min: number;
    max: number;
  };
} {
  if (results.length === 0) {
    return {
      totalProcessed: 0,
      totalRulesApplied: 0,
      averageConfidence: 0,
      averageRiskScore: 0,
      categoriesFound: {},
      severityLevels: {},
      processingTime: { total: 0, average: 0, min: 0, max: 0 },
    };
  }

  const totalProcessed = results.length;
  const totalRulesApplied = results.reduce(
    (sum, r) => sum + r.rulesApplied.length,
    0
  );
  const averageConfidence =
    results.reduce((sum, r) => sum + r.confidence, 0) / totalProcessed;
  const averageRiskScore =
    results.reduce((sum, r) => sum + r.metadata.riskScore, 0) / totalProcessed;

  const categoriesFound: Record<string, number> = {};
  const severityLevels: Record<string, number> = {};

  results.forEach(result => {
    result.metadata.categoriesFound.forEach((category: string) => {
      categoriesFound[category] = (categoriesFound[category] || 0) + 1;
    });

    result.metadata.severityLevels.forEach((severity: string) => {
      severityLevels[severity] = (severityLevels[severity] || 0) + 1;
    });
  });

  const processingTimes = results.map(r => r.metadata.processingTime);
  const processingTime = {
    total: processingTimes.reduce((sum, time) => sum + time, 0),
    average:
      processingTimes.reduce((sum, time) => sum + time, 0) /
      processingTimes.length,
    min: Math.min(...processingTimes),
    max: Math.max(...processingTimes),
  };

  return {
    totalProcessed,
    totalRulesApplied,
    averageConfidence,
    averageRiskScore,
    categoriesFound,
    severityLevels,
    processingTime,
  };
}

/**
 * Validate sanitization configuration
 */
export function validateSanitizationConfig(config: any): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (
    config.strictMode !== undefined &&
    typeof config.strictMode !== 'boolean'
  ) {
    errors.push('strictMode must be a boolean');
  }

  if (
    config.preserveFormat !== undefined &&
    typeof config.preserveFormat !== 'boolean'
  ) {
    errors.push('preserveFormat must be a boolean');
  }

  if (config.maxProcessingTime !== undefined) {
    if (
      typeof config.maxProcessingTime !== 'number' ||
      config.maxProcessingTime <= 0
    ) {
      errors.push('maxProcessingTime must be a positive number');
    } else if (config.maxProcessingTime > 30000) {
      warnings.push(
        'maxProcessingTime is very high, consider reducing for better performance'
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Create a performance benchmark
 */
export function benchmarkSanitization(
  engine: any,
  testData: string[],
  iterations: number = 1
): {
  averageTime: number;
  totalTime: number;
  throughput: number; // characters per second
  memoryUsage: number;
} {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    testData.forEach(data => {
      engine.sanitize(data);
    });
  }

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  const totalTime = endTime - startTime;
  const averageTime = totalTime / (testData.length * iterations);
  const totalCharacters = testData.reduce((sum, data) => sum + data.length, 0);
  const throughput = (totalCharacters * iterations) / (totalTime / 1000);
  const memoryUsage = endMemory - startMemory;

  return {
    averageTime,
    totalTime,
    throughput,
    memoryUsage,
  };
}

/**
 * Generate a compliance report
 */
export function generateComplianceReport(results: any[]): {
  gdprCompliant: boolean;
  hipaaCompliant: boolean;
  soxCompliant: boolean;
  findings: Array<{
    category: string;
    severity: string;
    count: number;
    description: string;
  }>;
  recommendations: string[];
} {
  const findings: Array<{
    category: string;
    severity: string;
    count: number;
    description: string;
  }> = [];

  const categoriesFound: Record<string, Record<string, number>> = {};

  results.forEach(result => {
    result.rulesApplied.forEach((rule: any) => {
      if (!categoriesFound[rule.category]) {
        categoriesFound[rule.category] = {};
      }
      categoriesFound[rule.category][rule.severity] =
        (categoriesFound[rule.category][rule.severity] || 0) +
        rule.matches.length;
    });
  });

  Object.entries(categoriesFound).forEach(([category, severities]) => {
    Object.entries(severities).forEach(([severity, count]) => {
      findings.push({
        category,
        severity,
        count,
        description: `${count} ${severity} ${category} matches found`,
      });
    });
  });

  const criticalFindings = findings.filter(f => f.severity === 'critical');
  const highFindings = findings.filter(f => f.severity === 'high');

  const gdprCompliant =
    criticalFindings.length === 0 && highFindings.length === 0;
  const hipaaCompliant = !findings.some(
    f => f.category === 'phi' && ['high', 'critical'].includes(f.severity)
  );
  const soxCompliant = !findings.some(
    f => f.category === 'financial' && ['high', 'critical'].includes(f.severity)
  );

  const recommendations: string[] = [];

  if (criticalFindings.length > 0) {
    recommendations.push(
      'Immediate action required: Critical data exposure detected'
    );
  }
  if (highFindings.length > 0) {
    recommendations.push('Review and address high-severity findings');
  }
  if (!gdprCompliant) {
    recommendations.push(
      'GDPR compliance issues detected - review data handling practices'
    );
  }
  if (!hipaaCompliant) {
    recommendations.push(
      'HIPAA compliance issues detected - review PHI handling'
    );
  }
  if (!soxCompliant) {
    recommendations.push(
      'SOX compliance issues detected - review financial data handling'
    );
  }

  return {
    gdprCompliant,
    hipaaCompliant,
    soxCompliant,
    findings,
    recommendations,
  };
}
