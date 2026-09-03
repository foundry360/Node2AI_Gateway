import type {
  InterrogationContext,
  InterrogationResult,
  SemanticClassifier,
  SensitivityLabel,
} from './types.js';

/**
 * Lightweight heuristic "semantic" classifier for ambiguous content.
 * Returns structured evidence only — never ALLOW/BLOCK.
 */
export class HeuristicSemanticClassifier implements SemanticClassifier {
  async classify(input: {
    text: string;
    deterministic: InterrogationResult;
    context: InterrogationContext;
  }): Promise<{
    classification: SensitivityLabel;
    confidence: number;
    entities: [];
    intent?: string;
    risk?: 'low' | 'medium' | 'high';
    reason_codes: string[];
  }> {
    const lower = input.text.toLowerCase();
    const reason_codes: string[] = ['SEMANTIC_HEURISTIC'];

    if (
      /\b(patient|clinical|hipaa|prescription|lab result|ehr)\b/.test(lower)
    ) {
      return {
        classification: 'PHI',
        confidence: 0.72,
        entities: [],
        risk: 'high',
        reason_codes: [...reason_codes, 'HEALTH_INFORMATION'],
      };
    }

    if (/\b(ssn|social security|home address|date of birth)\b/.test(lower)) {
      return {
        classification: 'PII',
        confidence: 0.7,
        entities: [],
        risk: 'medium',
        reason_codes: [...reason_codes, 'PII_LANGUAGE'],
      };
    }

    if (/\b(confidential|proprietary|trade secret)\b/.test(lower)) {
      return {
        classification: 'Confidential',
        confidence: 0.65,
        entities: [],
        risk: 'medium',
        reason_codes: [...reason_codes, 'CONFIDENTIAL_LANGUAGE'],
      };
    }

    return {
      classification: input.deterministic.classification.sensitivity,
      confidence: Math.min(input.deterministic.classification.confidence, 0.55),
      entities: [],
      risk: input.deterministic.risk,
      reason_codes: [...reason_codes, 'SEMANTIC_NO_ELEVATION'],
    };
  }
}
