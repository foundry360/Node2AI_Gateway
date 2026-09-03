import { detectDeterministic } from './detectors.js';
import { classifyIntent } from './intent.js';
import { HeuristicSemanticClassifier } from './semantic.js';
import type {
  DataInterrogator,
  InterrogationContext,
  InterrogationResult,
  SemanticClassifier,
  SensitivityLabel,
} from './types.js';

const SENSITIVITY_RANK: Record<SensitivityLabel, number> = {
  Public: 0,
  Internal: 1,
  Proprietary: 2,
  Legal: 3,
  Confidential: 4,
  Restricted: 5,
  Financial: 6,
  PII: 7,
  SecuritySensitive: 8,
  Credential: 9,
  PHI: 10,
};

function maxSensitivity(labels: SensitivityLabel[]): SensitivityLabel {
  return labels.reduce((best, cur) =>
    SENSITIVITY_RANK[cur] > SENSITIVITY_RANK[best] ? cur : best,
  );
}

function riskFor(sensitivity: SensitivityLabel): 'low' | 'medium' | 'high' {
  if (sensitivity === 'PHI' || sensitivity === 'Credential') return 'high';
  if (
    sensitivity === 'PII' ||
    sensitivity === 'Financial' ||
    sensitivity === 'Restricted' ||
    sensitivity === 'SecuritySensitive'
  ) {
    return 'medium';
  }
  return 'low';
}

export class HybridDataInterrogator implements DataInterrogator {
  constructor(
    private readonly options: {
      semantic?: SemanticClassifier | null;
      /** Run semantic when deterministic confidence is below this threshold. */
      semanticConfidenceThreshold?: number;
      forceFailure?: boolean;
    } = {},
  ) {}

  async interrogate(
    text: string,
    context: InterrogationContext,
  ): Promise<InterrogationResult> {
    if (this.options.forceFailure) {
      throw new Error('DataInterrogator forced failure');
    }

    const detection = detectDeterministic(text);
    const intent = classifyIntent(context.operation, text);

    const labels: SensitivityLabel[] = ['Internal'];
    if (detection.categories.has('PHI')) labels.push('PHI');
    if (detection.categories.has('Credential')) labels.push('Credential');
    if (detection.categories.has('Financial')) labels.push('Financial');
    if (detection.categories.has('PII')) labels.push('PII');

    let sensitivity = maxSensitivity(labels);
    let confidence = detection.entities.length > 0 ? 0.97 : 0.6;
    let reason_codes = [
      ...detection.reason_codes,
      'DETERMINISTIC_CLASSIFICATION',
    ];
    let entities = detection.entities;
    let risk = riskFor(sensitivity);

    const threshold = this.options.semanticConfidenceThreshold ?? 0.85;
    const semantic =
      this.options.semantic === null
        ? null
        : (this.options.semantic ?? new HeuristicSemanticClassifier());

    let semanticMeta: InterrogationResult['semantic'] = { applied: false };

    const baseResult: InterrogationResult = {
      classification: { sensitivity, confidence },
      entities,
      intent,
      risk,
      reason_codes,
    };

    if (semantic && confidence < threshold) {
      const sem = await semantic.classify({
        text,
        deterministic: baseResult,
        context,
      });
      semanticMeta = {
        applied: true,
        classification: sem.classification,
        confidence: sem.confidence,
        reason_codes: sem.reason_codes,
      };
      // Semantic may elevate sensitivity; it never authorizes.
      if (SENSITIVITY_RANK[sem.classification] > SENSITIVITY_RANK[sensitivity]) {
        sensitivity = sem.classification;
        confidence = Math.max(confidence, sem.confidence);
        risk = sem.risk ?? riskFor(sensitivity);
      }
      reason_codes = [...reason_codes, ...sem.reason_codes];
      if (sem.intent) {
        // Prefer operation-derived intent; semantic may refine only if operation was generic
      }
    }

    return {
      classification: { sensitivity, confidence },
      entities,
      intent,
      risk,
      reason_codes,
      semantic: semanticMeta,
    };
  }
}

/** Test double that always throws (fail-closed proof). */
export class FailingDataInterrogator implements DataInterrogator {
  async interrogate(): Promise<InterrogationResult> {
    throw new Error('DataInterrogator unavailable');
  }
}
