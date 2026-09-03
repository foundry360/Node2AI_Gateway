// Rule management for sanitization engine

import {
  SanitizationRule,
  ValidationResult,
  SanitizationError,
  TestCase,
} from '../types';
import { generateId } from '../utils';

export function createRule(
  name: string,
  pattern: string,
  replacement: string,
  category: string,
  severity: string,
  confidence: number = 0.8,
  priority: number = 0,
  description?: string,
  tags: string[] = [],
  testCases?: TestCase[]
): SanitizationRule {
  const now = new Date().toISOString();

  return {
    id: generateId(),
    name,
    description,
    pattern,
    replacement,
    category: category as any,
    severity: severity as any,
    isActive: true,
    priority,
    tags,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system',
    testCases,
  };
}

export function validateRule(rule: SanitizationRule): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!rule.id || rule.id.trim() === '') {
    errors.push('Rule ID is required');
  }

  if (!rule.name || rule.name.trim() === '') {
    errors.push('Rule name is required');
  }

  if (!rule.pattern || rule.pattern.trim() === '') {
    errors.push('Pattern is required');
  }

  if (rule.replacement === undefined || rule.replacement === null) {
    errors.push('Replacement is required');
  }

  if (
    !rule.category ||
    !['pii', 'phi', 'financial', 'government', 'custom'].includes(rule.category)
  ) {
    errors.push('Invalid category');
  }

  if (
    !rule.severity ||
    !['low', 'medium', 'high', 'critical'].includes(rule.severity)
  ) {
    errors.push('Invalid severity level');
  }

  // Pattern validation
  if (rule.pattern) {
    try {
      new RegExp(rule.pattern, 'g');
    } catch (error) {
      errors.push(
        `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Priority validation
  if (rule.priority < 0 || rule.priority > 100) {
    warnings.push('Priority should be between 0 and 100');
  }

  // Date validation
  if (rule.createdAt && !isValidDate(rule.createdAt)) {
    errors.push('Invalid createdAt date');
  }

  if (rule.updatedAt && !isValidDate(rule.updatedAt)) {
    errors.push('Invalid updatedAt date');
  }

  // Test cases validation
  if (rule.testCases) {
    for (const testCase of rule.testCases) {
      if (!testCase.input || testCase.input.trim() === '') {
        errors.push('Test case input is required');
      }
      if (!testCase.expectedOutput || testCase.expectedOutput.trim() === '') {
        errors.push('Test case expected output is required');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function updateRule(
  existingRule: SanitizationRule,
  updates: Partial<SanitizationRule>
): SanitizationRule {
  const updatedRule = {
    ...existingRule,
    ...updates,
    id: existingRule.id, // ID cannot be changed
    createdAt: existingRule.createdAt, // Created date cannot be changed
    updatedAt: new Date().toISOString(),
  };

  return updatedRule;
}

export function cloneRule(
  rule: SanitizationRule,
  newName?: string,
  newId?: string
): SanitizationRule {
  return {
    ...rule,
    id: newId || generateId(),
    name: newName || `${rule.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function testRule(
  rule: SanitizationRule,
  testInput: string
): {
  success: boolean;
  output: string;
  matches: number;
  errors: string[];
} {
  const errors: string[] = [];
  let output = testInput;
  let matches = 0;

  try {
    const pattern = new RegExp(rule.pattern, 'g');
    const patternMatches = testInput.match(pattern);

    if (patternMatches) {
      matches = patternMatches.length;
      output = testInput.replace(pattern, rule.replacement);
    }
  } catch (error) {
    errors.push(
      `Pattern error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return {
    success: errors.length === 0,
    output,
    matches,
    errors,
  };
}

export function runRuleTests(rule: SanitizationRule): {
  passed: number;
  failed: number;
  results: Array<{
    testCase: TestCase;
    success: boolean;
    actualOutput: string;
    error?: string;
  }>;
} {
  if (!rule.testCases || rule.testCases.length === 0) {
    return { passed: 0, failed: 0, results: [] };
  }

  const results = rule.testCases.map(testCase => {
    const testResult = testRule(rule, testCase.input);
    const success =
      testResult.success && testResult.output === testCase.expectedOutput;

    return {
      testCase,
      success,
      actualOutput: testResult.output,
      error: success
        ? undefined
        : `Expected: ${testCase.expectedOutput}, Got: ${testResult.output}`,
    };
  });

  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;

  return { passed, failed, results };
}

export function createTestCases(
  inputs: string[],
  expectedOutputs: string[],
  descriptions?: string[]
): TestCase[] {
  if (inputs.length !== expectedOutputs.length) {
    throw new SanitizationError(
      'Number of inputs must match number of expected outputs',
      'INVALID_TEST_CASES'
    );
  }

  return inputs.map((input, index) => ({
    input,
    expectedOutput: expectedOutputs[index],
    description: descriptions?.[index],
  }));
}

export function exportRules(rules: SanitizationRule[]): string {
  const exportData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rules: rules.map(rule => ({
      name: rule.name,
      description: rule.description,
      pattern: rule.pattern,
      replacement: rule.replacement,
      category: rule.category,
      severity: rule.severity,
      priority: rule.priority,
      tags: rule.tags,
      testCases: rule.testCases,
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

export function importRules(exportData: string): SanitizationRule[] {
  try {
    const data = JSON.parse(exportData);

    if (!data.rules || !Array.isArray(data.rules)) {
      throw new SanitizationError('Invalid export format', 'INVALID_EXPORT');
    }

    return data.rules.map((ruleData: any, index: number) => {
      const rule = createRule(
        ruleData.name || `Imported Rule ${index + 1}`,
        ruleData.pattern,
        ruleData.replacement,
        ruleData.category || 'custom',
        ruleData.severity || 'medium',
        0.8,
        ruleData.priority || 0,
        ruleData.description,
        ruleData.tags || [],
        ruleData.testCases
      );

      const validation = validateRule(rule);
      if (!validation.isValid) {
        throw new SanitizationError(
          `Invalid rule at index ${index}: ${validation.errors.join(', ')}`,
          'INVALID_IMPORT'
        );
      }

      return rule;
    });
  } catch (error) {
    if (error instanceof SanitizationError) {
      throw error;
    }
    throw new SanitizationError(
      `Failed to import rules: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'IMPORT_ERROR'
    );
  }
}

// Utility functions
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date.toISOString() === dateString;
}

export function getRulesByCategory(
  rules: SanitizationRule[],
  category: string
): SanitizationRule[] {
  return rules.filter(rule => rule.category === category);
}

export function getRulesBySeverity(
  rules: SanitizationRule[],
  severity: string
): SanitizationRule[] {
  return rules.filter(rule => rule.severity === severity);
}

export function getActiveRules(rules: SanitizationRule[]): SanitizationRule[] {
  return rules.filter(rule => rule.isActive);
}

export function sortRulesByPriority(
  rules: SanitizationRule[]
): SanitizationRule[] {
  return rules.sort((a, b) => b.priority - a.priority);
}
