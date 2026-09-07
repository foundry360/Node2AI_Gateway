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

/**
 * Generic governance evidence/facts for policy evaluation.
 * Distinct from authorization/consent (`authorization_context`).
 * Pack-agnostic — packs map these into their own control inputs.
 */
export interface SecurityControlEvidence {
  prompt_injection_controls?: boolean;
  sensitive_data_controls?: boolean;
  supply_chain_controls?: boolean;
  poisoning_controls?: boolean;
  output_validation_controls?: boolean;
  agency_controls?: boolean;
  system_prompt_protection?: boolean;
  retrieval_security_controls?: boolean;
  grounding_controls?: boolean;
  resource_limits?: boolean;
}

/**
 * Generic AI management-system governance facts (reusable across standards).
 * Not ISO-specific — packs map these into management-system control inputs.
 */
export interface ManagementSystemEvidence {
  ai_policy_established?: boolean;
  roles_responsibilities_documented?: boolean;
  ai_system_inventory_documented?: boolean;
  risk_process_established?: boolean;
  risk_assessment_completed?: boolean;
  risk_treatment_documented?: boolean;
  impact_assessment_completed?: boolean;
  data_governance_established?: boolean;
  human_oversight_defined?: boolean;
  operational_controls_defined?: boolean;
  monitoring_established?: boolean;
  performance_evaluation_established?: boolean;
  incident_process_established?: boolean;
  internal_review_completed?: boolean;
  continual_improvement_process_established?: boolean;
}

/**
 * Generic regulatory / AI-system governance facts (reusable across authorities).
 * Not EU-specific — packs map these into obligation conditions.
 */
export interface RegulatoryGovernanceEvidence {
  /** provider | deployer | importer | distributor | other */
  actor_role?: string;
  deployment_jurisdiction?: string;
  market_placement_jurisdiction?: string;
  affected_person_jurisdiction?: string;
  provider_jurisdiction?: string;
  /**
   * Declared legal category when known:
   * PROHIBITED | HIGH_RISK | TRANSPARENCY | GPAI | MINIMAL_OR_NO_RISK | UNKNOWN
   */
  regulatory_risk_category?: string;
  /**
   * Declared Article 5 practice code when known, or `none` / `uncertain`.
   * Enigma does not infer prohibited practices from free text.
   */
  prohibited_practice_code?: string;
  /** Declared high-risk use (e.g. Annex III) when known. */
  high_risk_use_declared?: boolean;
  /** Explicit uncertain marker for high-risk applicability. */
  high_risk_applicability?: string;
  /** e.g. art6_1 for product-safety pathway. */
  high_risk_pathway?: string;
  high_risk_art6_1?: boolean;
  intended_purpose?: string;
  /** High-risk obligation evidence (Arts. 9–15 / deployer Art. 26). */
  risk_management_system?: boolean;
  data_governance?: boolean;
  technical_documentation?: boolean;
  logging_record_keeping?: boolean;
  deployer_transparency?: boolean;
  human_oversight?: boolean;
  accuracy_robustness_cybersecurity?: boolean;
  /** Article 50 applicability / evidence. */
  direct_ai_interaction?: boolean;
  ai_interaction_disclosure?: boolean;
  synthetic_or_manipulated_content?: boolean;
  synthetic_content_marking?: boolean;
  deepfake_content?: boolean;
  deepfake_labeling?: boolean;
  public_interest_ai_text?: boolean;
  human_review_or_editorial_control?: boolean;
  /** GPAI provider evidence (Arts. 51–55 family). */
  gpai_model?: boolean;
  gpai_systemic_risk?: boolean;
  gpai_technical_documentation?: boolean;
  gpai_downstream_information?: boolean;
  gpai_copyright_policy?: boolean;
  gpai_training_content_summary?: boolean;
  gpai_systemic_risk_assessment?: boolean;
  gpai_systemic_risk_mitigation?: boolean;
  gpai_incident_reporting?: boolean;
  gpai_cybersecurity?: boolean;
}

/**
 * Generic AI risk-management governance facts (reusable across authorities).
 * Not ISO-specific — packs map these into risk-management control inputs.
 * Distinct from organizational risk scoring / heatmaps.
 */
export interface AiRiskManagementEvidence {
  risk_management_established?: boolean;
  risk_context_defined?: boolean;
  risk_identification_completed?: boolean;
  risk_analysis_completed?: boolean;
  risk_evaluation_completed?: boolean;
  risk_treatment_defined?: boolean;
  risk_treatment_implemented?: boolean;
  residual_risk_accepted?: boolean;
  risk_monitoring_established?: boolean;
  risk_communication_established?: boolean;
  risk_review_established?: boolean;
}

/**
 * Generic AI system impact-assessment governance facts (reusable across authorities).
 * Not ISO-specific — distinct from ai_risk (risk management) and management_system.
 * Not an impact score or assessment workflow.
 */
export interface ImpactAssessmentEvidence {
  impact_assessment_completed?: boolean;
  impact_scope_defined?: boolean;
  affected_stakeholders_identified?: boolean;
  potential_impacts_identified?: boolean;
  impact_severity_assessed?: boolean;
  impact_likelihood_assessed?: boolean;
  mitigations_defined?: boolean;
  mitigations_implemented?: boolean;
  residual_impact_reviewed?: boolean;
  impact_monitoring_established?: boolean;
  impact_review_established?: boolean;
}

export interface GovernanceContext {
  accountability_documented?: boolean;
  system_context_documented?: boolean;
  measurement_documented?: boolean;
  risk_response_documented?: boolean;
  /** Generic AI security control attestations (guidance packs). */
  security_controls?: SecurityControlEvidence;
  /** Generic AI management-system governance facts (standards packs). */
  management_system?: ManagementSystemEvidence;
  /** Generic AI risk-management governance facts (guidance/standards packs). */
  ai_risk?: AiRiskManagementEvidence;
  /** Generic AI system impact-assessment governance facts. */
  impact?: ImpactAssessmentEvidence;
  /** Generic regulatory / AI-system governance facts. */
  regulatory?: RegulatoryGovernanceEvidence;
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
  /** Authorization/consent basis only — not governance documentation. */
  authorization_context?: string;
  /** Generic governance evidence (accountability, context, measurement, risk response). */
  governance_context?: GovernanceContext;
  /**
   * Evaluation timestamp (ISO-8601) used for phased obligation applicability.
   * Prefer an explicit client/request value; Gateway may stamp request time once
   * at the boundary — packs must not call Date.now() themselves.
   */
  evaluation_as_of?: string;
  /** Gateway request id — stamped onto policy_evaluations for enforcement join. */
  request_id?: string;
  /** When 'simulate', evaluation is recorded as not Gateway-executed. */
  evaluation_phase?: 'input' | 'simulate';
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  reason_codes: string[];
  eligible_models: string[];
  policy_ids: string[];
  policy_version: number;
  transforms: Array<{ type: string; targets: string[] }>;
  /** EPA evaluation id when available — for Gateway audit correlation. */
  evaluation_id?: string;
  /**
   * EPA machine decision before legacy wire mapping.
   * REVIEW remains REVIEW here even when decision is BLOCK (safety hold).
   */
  machine_decision?: string;
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
  /** Authorization/consent basis only — not governance documentation. */
  authorization_context?: string;
  /** Generic governance evidence for output-phase packs when applicable. */
  governance_context?: GovernanceContext;
  /** Evaluation timestamp for phased obligations (ISO-8601). */
  evaluation_as_of?: string;
  /** Explicit Enigma release evaluation result when provided. */
  release_conditions_satisfied?: boolean;
  /** Gateway request id — stamped onto policy_evaluations for enforcement join. */
  request_id?: string;
}

export interface PolicyResponseResult {
  decision: ResponseDecision;
  reason_codes: string[];
  policy_ids: string[];
  policy_version: number;
  transforms: Array<{ type: string; targets: string[] }>;
  /** Detokenization is privileged — default false. */
  authorize_detokenization: boolean;
  /** EPA evaluation id when available — for Gateway audit correlation. */
  evaluation_id?: string;
}

export interface PolicyEngine {
  evaluateRequest(context: PolicyRequestContext): Promise<PolicyEvaluationResult>;
  evaluateResponse(context: PolicyResponseContext): Promise<PolicyResponseResult>;
}
