/**
 * Enigma Enterprise Policy evaluation contract.
 * Production types — PDP/PEP boundary. See docs/enigma/policy-evaluation-contract.md.
 */

import type { GovernanceContext } from '../types.js';

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
  /** WHO/WHAT/WHY — optional; unknown must not silently become approved. */
  purpose?: string;
  recipient?: string;
  source?: string;
  processing_location?: string;
  /** Authorization/consent basis only. */
  authorization?: string;
  /**
   * Generic governance evidence (accountability, system context, measurement,
   * risk response). Distinct from authorization.
   */
  governance?: GovernanceContext;
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

export interface ClassificationProvenanceEvidence {
  classification: string;
  classification_basis?: {
    type: 'ENIGMA_HEURISTIC' | 'REGULATORY_DEFINITION' | 'DETECTOR' | 'REQUEST_SUPPLIED' | (string & {});
    rule_id?: string;
  };
  regulatory_reference?: {
    source_ids: string[];
    citations: string[];
  };
  applicability?: {
    packs: string[];
    basis: 'ENIGMA_OPERATIONAL' | (string & {});
  };
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
  /** Distinguishes Enigma heuristics from regulatory definition references. */
  classification_provenance?: ClassificationProvenanceEvidence;
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
  | 'REVIEW'
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

export interface MatchedRuleProvenanceEvidence {
  rule_id: string;
  obligation_ids: string[];
  citations: string[];
  source_ids: string[];
  authority_tier?: number;
  authority?: string;
  authority_type?: string;
  legal_authority?: boolean;
  control_ids?: string[];
  requirement_type?: string;
  obligations?: Array<{
    obligation_id: string;
    citations: string[];
    source_ids: string[];
    authority_tier?: number;
    requirement_type?: string;
  }>;
}

export interface PolicyExplanationProvenance {
  matched_rules: MatchedRuleProvenanceEvidence[];
  sources?: Array<{
    source_id: string;
    authority: string;
    authority_tier: number;
    authority_type?: string;
    legal_authority?: boolean;
    authority_id?: string;
    citation?: string;
    title?: string;
    publisher?: string;
    canonical_url?: string | null;
  }>;
  classification?: ClassificationProvenanceEvidence;
  controls?: Array<{ control_id: string; control_type?: string }>;
  enforcement?: {
    actions: string[];
    authorize_detokenization?: boolean;
  };
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
  /** Structured Rule → Obligation → Citation → Source chain (pack-agnostic). */
  provenance?: PolicyExplanationProvenance;
  /** Multi-pack resolution summary (when multiple packs contributed). */
  resolution?: PolicyResolutionEvidence;
  /** Derived operator narrative / view model (pack-agnostic). */
  operator?: OperatorDecisionExplanationEvidence;
}

export interface PolicyConflictRecord {
  conflict_type: 'decision' | 'obligation';
  policy_a: string;
  policy_b: string;
  detail: string;
  resolution:
    | 'precedence'
    | 'deny_unresolved'
    | 'compose'
    | 'review_unresolved'
    | 'agreement';
  /** Generic conflict category when recorded by the policy resolver. */
  category?:
    | 'NONE'
    | 'AGREEMENT'
    | 'COMPLEMENTARY'
    | 'RESTRICTIVE'
    | 'CONFLICT'
    | 'UNRESOLVED';
  pack_a?: string;
  pack_b?: string;
  resolution_basis?: string;
}

export interface PolicyResolutionContributionEvidence {
  pack_id: string;
  pack_name?: string;
  pack_version?: string;
  policy_id: string;
  policy_name?: string;
  policy_version: number;
  decision: string;
  rule_ids: string[];
  obligation_ids: string[];
  obligations?: string[];
  controls?: Array<{ control_id: string; control_type?: string }>;
  reason_codes?: string[];
}

export interface PolicyResolutionEvidence {
  category:
    | 'NONE'
    | 'AGREEMENT'
    | 'COMPLEMENTARY'
    | 'RESTRICTIVE'
    | 'CONFLICT'
    | 'UNRESOLVED';
  basis: string;
  contributing_pack_ids: string[];
  detail: string;
  conflict_pairs?: Array<{
    pack_a: string;
    pack_b: string;
    policy_a: string;
    policy_b: string;
    category: string;
    detail: string;
  }>;
  contributions?: PolicyResolutionContributionEvidence[];
}

/** Pack-agnostic operator-facing explanation derived from structured evaluation data. */
export interface OperatorDecisionExplanationEvidence {
  final_decision: string;
  resolution_category?: PolicyResolutionEvidence['category'];
  resolution_basis?: string;
  resolution_label: string;
  basis_label: string;
  narrative: string;
  contributing_pack_ids: string[];
  contributions: Array<{
    pack_id: string;
    pack_name: string;
    pack_version?: string;
    policy_id: string;
    policy_name?: string;
    policy_version: number;
    decision: string;
    rule_ids: string[];
    obligation_ids: string[];
    obligations: string[];
    controls: Array<{ control_id: string; control_type?: string }>;
    reason_codes: string[];
    has_provenance: boolean;
  }>;
  authorities: Array<{
    source_id: string;
    authority: string;
    citation?: string;
    authority_tier?: number;
    authority_type?: string;
    legal_authority?: boolean;
    pack_ids: string[];
  }>;
  enforcement_controls: Array<{ control_id: string; control_type?: string }>;
  enforcement_actions: string[];
  enigma_obligations: string[];
  flow: string[];
  conflict_detail?: string;
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
