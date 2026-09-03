import { detectDeterministic } from '../interrogation/detectors.js';
import type { DetectedEntity, SensitivityLabel } from '../interrogation/types.js';

export interface ResponseInspectionEvidence {
  sensitivity: SensitivityLabel;
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  reason_codes: string[];
  entities: DetectedEntity[];
  tool_or_action_detected: boolean;
  contains_tokens: boolean;
  prohibited_markers: string[];
}

export interface ResponseInspector {
  inspect(input: {
    content: string;
    model_id: string;
    operation: string;
  }): Promise<ResponseInspectionEvidence>;
}

const TOOL_PATTERNS = [
  /\btool_call\b/i,
  /\bfunction_call\b/i,
  /\binvoke_tool\b/i,
  /"name"\s*:\s*"[^"]+"\s*,\s*"arguments"/i,
  /\bexfiltrat(?:e|ion)\b/i,
  /\bsend_to_url\b/i,
];

const TOKEN_PATTERN = /\{\{TOK_[A-Za-z0-9_]+\}\}/;

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

/**
 * Response Inspector — evidence only. Never authorizes RELEASE/BLOCK.
 */
export class DeterministicResponseInspector implements ResponseInspector {
  constructor(private readonly options: { forceFailure?: boolean } = {}) {}

  async inspect(input: {
    content: string;
    model_id: string;
    operation: string;
  }): Promise<ResponseInspectionEvidence> {
    if (this.options.forceFailure) {
      throw new Error('ResponseInspector forced failure');
    }

    const detection = detectDeterministic(input.content);
    const labels: SensitivityLabel[] = ['Internal'];
    if (detection.categories.has('PHI')) labels.push('PHI');
    if (detection.categories.has('Credential')) labels.push('Credential');
    if (detection.categories.has('Financial')) labels.push('Financial');
    if (detection.categories.has('PII')) labels.push('PII');

    const tool_or_action_detected = TOOL_PATTERNS.some((p) => p.test(input.content));
    const contains_tokens = TOKEN_PATTERN.test(input.content);
    const prohibited_markers: string[] = [];
    if (tool_or_action_detected) prohibited_markers.push('TOOL_OR_ACTION');
    if (detection.categories.has('Credential')) prohibited_markers.push('CREDENTIAL');

    const sensitivity = maxSensitivity(labels);
    let risk: 'low' | 'medium' | 'high' = 'low';
    if (sensitivity === 'PHI' || sensitivity === 'Credential' || tool_or_action_detected) {
      risk = 'high';
    } else if (sensitivity === 'PII' || sensitivity === 'Financial') {
      risk = 'medium';
    }

    return {
      sensitivity,
      confidence: detection.entities.length > 0 || tool_or_action_detected ? 0.97 : 0.7,
      risk,
      reason_codes: [
        ...detection.reason_codes,
        'RESPONSE_DETERMINISTIC_INSPECTION',
        ...(tool_or_action_detected ? ['TOOL_OR_ACTION_DETECTED'] : []),
        ...(contains_tokens ? ['TOKEN_PRESENT_IN_RESPONSE'] : []),
      ],
      entities: detection.entities,
      tool_or_action_detected,
      contains_tokens,
      prohibited_markers,
    };
  }
}

export class FailingResponseInspector implements ResponseInspector {
  async inspect(): Promise<ResponseInspectionEvidence> {
    throw new Error('ResponseInspector unavailable');
  }
}
