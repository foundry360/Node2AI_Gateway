import type { Application, User } from '../identity/types.js';
import type { DetectedEntity, SensitivityLabel } from '../interrogation/types.js';
import type { ResponseInspectionEvidence } from '../response/inspector.js';

export type PolicyDecision =
  | 'ALLOW'
  | 'TOKENIZE'
  | 'REDACT'
  | 'MASK'
  | 'TRANSFORM'
  | 'BLOCK';

export type ResponseDecision = 'RELEASE' | 'TRANSFORM' | 'REDACT' | 'BLOCK';

export interface ClassificationEvidence {
  sensitivity: SensitivityLabel | string;
  confidence: number;
  intent?: string;
  risk: 'low' | 'medium' | 'high';
  reason_codes: string[];
  entities?: DetectedEntity[];
}

export interface PolicyRequestContext {
  user: User;
  application: Application;
  operation: string;
  requestedModel?: string;
  availableModels: string[];
  environment: string;
  classification: ClassificationEvidence;
  deploymentMode: 'connected' | 'airgap';
  /** Optional purpose; explicit 'unknown' must not silently become approved. */
  purpose?: string;
  recipient?: string;
  source_system?: string;
  processing_location?: string;
  authorization_context?: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  reason_codes: string[];
  eligible_models: string[];
  policy_ids: string[];
  policy_version: number;
  transforms: Array<{ type: string; targets: string[] }>;
}

export interface PolicyResponseContext {
  user: User;
  application: Application;
  operation: string;
  model_id: string;
  request_classification: ClassificationEvidence;
  inspection: ResponseInspectionEvidence;
  /** True when input path produced vault tokens that may appear in output. */
  input_was_tokenized: boolean;
  purpose?: string;
  recipient?: string;
  authorization_context?: string;
  /** Explicit Enigma release evaluation result when provided. */
  release_conditions_satisfied?: boolean;
}

export interface PolicyResponseResult {
  decision: ResponseDecision;
  reason_codes: string[];
  policy_ids: string[];
  policy_version: number;
  transforms: Array<{ type: string; targets: string[] }>;
  /** Detokenization is privileged — default false. */
  authorize_detokenization: boolean;
}

export interface PolicyEngine {
  evaluateRequest(context: PolicyRequestContext): Promise<PolicyEvaluationResult>;
  evaluateResponse(context: PolicyResponseContext): Promise<PolicyResponseResult>;
}
