/**
 * Enigma Enterprise Policy evaluation contract.
 * Production types — PDP/PEP boundary. See docs/enigma/policy-evaluation-contract.md.
 */

export type EnigmaAction =
  | 'READ'
  | 'RETRIEVE'
  | 'SUMMARIZE'
  | 'ANALYZE'
  | 'CLASSIFY'
  | 'GENERATE'
  | 'EXECUTE'
  | 'WRITE'
  | 'UPDATE'
  | 'DELETE'
  | 'TRANSMIT'
  | 'EXPORT'
  | 'SHARE'
  | (string & {});

export type ClassificationLabel =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'RESTRICTED'
  | 'PII'
  | 'PHI'
  | 'FINANCIAL'
  | 'LEGAL'
  | 'CREDENTIAL'
  | (string & {});

export interface PolicySubject {
  user_id?: string;
  application_id: string;
  organization_id: string;
  tenant_id?: string;
  roles: string[];
  groups?: string[];
  agent_id?: string;
  service_id?: string;
  trust_level: 'untrusted' | 'standard' | 'trusted' | string;
  status: 'active' | 'inactive' | string;
}

export interface PolicyResource {
  type: string;
  id?: string;
  classification?: ClassificationLabel;
  attributes?: Record<string, unknown>;
}

export interface PolicyContext {
  environment: string;
  deployment_mode: 'connected' | 'airgap';
  tenant_id?: string;
  jurisdiction?: string;
  location?: string;
  network?: string;
  device?: string;
  time?: string;
  risk_level?: 'low' | 'medium' | 'high';
  session_id?: string;
  application_environment?: string;
}

export interface PolicyAIContext {
  model_id?: string;
  model_provider?: string;
  model_version?: string;
  model_type?: string;
  execution?: 'local' | 'private' | 'cloud';
  agent_id?: string;
  agent_version?: string;
  tool_id?: string;
  tool_provider?: string;
  mcp_server_id?: string;
  requested_model?: string;
  available_models?: string[];
  eligible_models_hint?: string[];
}

export interface PolicyEvidence {
  classification?: ClassificationLabel;
  confidence?: number;
  intent?: string;
  risk?: 'low' | 'medium' | 'high';
  reason_codes?: string[];
  entities?: Array<{ type: string; value_redacted?: string }>;
  inspector_findings?: Array<{ code: string; detail?: string }>;
  contains_tokens?: boolean;
  input_was_tokenized?: boolean;
}

export type EvaluationPhase = 'input' | 'output' | 'simulate';

export interface PolicyEvaluationRequest {
  evaluation_phase: EvaluationPhase;
  subject: PolicySubject;
  resource: PolicyResource;
  action: EnigmaAction;
  context: PolicyContext;
  ai_context: PolicyAIContext;
  evidence: PolicyEvidence;
  request_id?: string;
  correlation_id?: string;
}

export type PolicyDecisionCode =
  | 'ALLOW'
  | 'DENY'
  | 'TRANSFORM'
  | 'REDACT'
  | 'TOKENIZE'
  | 'MASK'
  | 'REQUIRE_APPROVAL'
  | 'ROUTE_LOCAL'
  | 'RESTRICT_MODEL'
  | 'RESTRICT_DATA'
  | 'BLOCK_OUTPUT';

export type ObligationCode =
  | 'TOKENIZE_PII'
  | 'LOCAL_MODEL_ONLY'
  | 'NO_EXTERNAL_TRANSMISSION'
  | 'NO_WRITE_BACK'
  | 'LOG_GOVERNANCE_EVENT'
  | 'APPROVED_MODEL_ONLY'
  | 'REDACT_CREDENTIALS'
  | 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION'
  | 'AUTHORIZE_DETOKENIZATION'
  | (string & {});

export interface ApplicablePolicyRef {
  policy_id: string;
  version: number;
  pack_id?: string;
  name?: string;
  scope_tier?: string;
}

export interface Obligation {
  code: ObligationCode;
  parameters?: Record<string, unknown>;
}

export interface PolicyExplanation {
  matched_conditions: Array<{
    policy_id: string;
    version: number;
    condition_key: string;
    detail?: string;
  }>;
  rejected_conditions: Array<{
    policy_id: string;
    version: number;
    condition_key: string;
    detail?: string;
  }>;
  final_reason: string;
}

export interface PolicyConflictRecord {
  conflict_type: 'decision' | 'obligation';
  policy_a: string;
  policy_b: string;
  detail: string;
  resolution: 'precedence' | 'deny_unresolved';
}

export interface PolicyDecision {
  decision: PolicyDecisionCode;
  reason: string;
  reason_codes: string[];
  applicable_policies: ApplicablePolicyRef[];
  obligations: Obligation[];
  transformations: Array<{ type: string; targets: string[] }>;
  restrictions: {
    eligible_models?: string[];
    deny_external_transmission?: boolean;
    require_local?: boolean;
  };
  approval_requirements: string[];
  conflicts: PolicyConflictRecord[];
  explanation: PolicyExplanation;
  evidence: PolicyEvidence;
  evaluation_id: string;
  fail_closed?: boolean;
}

/** Production PDP interface. */
export interface EnterprisePolicyDecisionPoint {
  evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision>;
}

export type PolicyEngineMode = 'legacy' | 'enterprise' | 'compare' | 'shadow';
