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

/**
 * Generic enterprise assurance / control evidence (reusable across frameworks).
 * Not SOC 2-specific naming in fields — distinct from security_controls / management_system.
 * Not a certification, audit opinion, or compliance score.
 */
export interface AssuranceControlEvidence {
  control_environment_documented?: boolean;
  access_controls_verified?: boolean;
  change_management_controls_verified?: boolean;
  logical_access_controls_verified?: boolean;
  data_protection_controls_verified?: boolean;
  system_monitoring_controls_verified?: boolean;
  incident_response_controls_verified?: boolean;
  availability_controls_verified?: boolean;
  processing_integrity_controls_verified?: boolean;
  confidentiality_controls_verified?: boolean;
  /** When true, privacy-category evidence is in scope for this request. */
  privacy_category_applicable?: boolean;
  privacy_controls_verified?: boolean;
}

/**
 * Generic organizational AI governance evidence (board/executive direction,
 * oversight, stakeholders — reusable across authorities).
 * Distinct from management_system (ISO 42001 AIMS), ai_risk, impact,
 * assurance, and cybersecurity. Not a board-governance GRC product,
 * maturity score, or certification.
 */
export interface OrganizationalGovernanceEvidence {
  accountability?: {
    governing_body_accountable?: boolean;
    executive_accountability_defined?: boolean;
    ai_responsibilities_defined?: boolean;
  };
  direction?: {
    ai_governance_policy_defined?: boolean;
    strategic_alignment_documented?: boolean;
    acceptable_use_direction_defined?: boolean;
  };
  oversight?: {
    ai_oversight_established?: boolean;
    reporting_path_defined?: boolean;
    decision_rights_defined?: boolean;
  };
  stakeholder?: {
    relevant_stakeholders_identified?: boolean;
    stakeholder_impacts_considered?: boolean;
    stakeholder_communication_defined?: boolean;
  };
  decision_governance?: {
    human_accountability_defined?: boolean;
    escalation_path_defined?: boolean;
    significant_ai_decisions_reviewed?: boolean;
  };
  organizational_effectiveness?: {
    ai_use_objectives_defined?: boolean;
    performance_monitoring_established?: boolean;
    governance_review_established?: boolean;
  };
}

/**
 * Generic enterprise cybersecurity governance evidence (CSF-aligned, reusable).
 * Not NIST-specific field naming beyond function grouping — distinct from
 * security_controls (OWASP) and assurance (SOC 2).
 * Not a cybersecurity score, SIEM, or assessment product.
 */
export interface CybersecurityGovernanceEvidence {
  govern?: {
    accountability_documented?: boolean;
    cybersecurity_roles_defined?: boolean;
    cybersecurity_policy_documented?: boolean;
  };
  identify?: {
    assets_identified?: boolean;
    dependencies_identified?: boolean;
    cybersecurity_risk_identified?: boolean;
  };
  protect?: {
    access_controls_documented?: boolean;
    safeguards_implemented?: boolean;
    data_protection_documented?: boolean;
  };
  detect?: {
    monitoring_established?: boolean;
    anomalous_activity_detection?: boolean;
    cybersecurity_events_logged?: boolean;
  };
  respond?: {
    response_plan_documented?: boolean;
    incident_response_process?: boolean;
    communication_process?: boolean;
  };
  recover?: {
    recovery_plan_documented?: boolean;
    recovery_process?: boolean;
    lessons_learned_process?: boolean;
  };
}

/**
 * Generic information-security management-system evidence (ISMS-aligned, reusable).
 * Distinct from cybersecurity (CSF), security_controls (OWASP), assurance (SOC 2),
 * and management_system (ISO 42001 AIMS). Not a certification, SIEM, Annex A score,
 * or security assessment product.
 */
export interface InformationSecurityGovernanceEvidence {
  isms?: {
    scope_defined?: boolean;
    context_established?: boolean;
    interested_parties_identified?: boolean;
    information_security_objectives_defined?: boolean;
  };
  risk?: {
    risk_process_established?: boolean;
    risks_identified?: boolean;
    risks_assessed?: boolean;
    risk_treatment_defined?: boolean;
    risk_treatment_implemented?: boolean;
    residual_risk_reviewed?: boolean;
  };
  information_assets?: {
    assets_identified?: boolean;
    information_classification_defined?: boolean;
    asset_ownership_defined?: boolean;
  };
  access?: {
    access_control_defined?: boolean;
    identity_management_established?: boolean;
    privileged_access_controlled?: boolean;
    access_review_established?: boolean;
  };
  operations?: {
    operational_controls_established?: boolean;
    change_management_established?: boolean;
    logging_monitoring_established?: boolean;
    backup_recovery_established?: boolean;
  };
  supplier_security?: {
    supplier_risk_controls_established?: boolean;
    third_party_security_requirements_defined?: boolean;
    supplier_monitoring_established?: boolean;
  };
  incident?: {
    incident_management_established?: boolean;
    incident_response_defined?: boolean;
    incident_learning_established?: boolean;
  };
  continuity?: {
    business_continuity_security_defined?: boolean;
    resilience_controls_established?: boolean;
    recovery_capability_established?: boolean;
  };
  people?: {
    security_roles_defined?: boolean;
    security_awareness_established?: boolean;
    personnel_security_controls_established?: boolean;
  };
  monitoring?: {
    security_performance_monitored?: boolean;
    internal_review_established?: boolean;
    management_review_established?: boolean;
  };
  improvement?: {
    nonconformities_managed?: boolean;
    corrective_actions_managed?: boolean;
    continual_improvement_established?: boolean;
  };
}

/**
 * Generic privacy information management evidence (PIMS-aligned, reusable).
 * Distinct from information_security (ISO 27001), assurance (SOC 2), and
 * regulatory packs (HIPAA / EU AI Act). Governance evidence only — not PII values,
 * not a GDPR engine, DSAR workflow, DPIA app, privacy score, or certification.
 *
 * Pack namespaces under privacy remain distinct:
 * - ISO/IEC 27701 uses top-level PIMS families (pims, pii_governance, …)
 * - NIST Privacy Framework uses `nist_pf` only
 * Satisfying one does not satisfy the other.
 */
export type PrivacyProcessingRole =
  | 'controller'
  | 'processor'
  | 'joint_controller'
  | 'other_defined_role'
  | 'unknown';

export type PrivacyPurposeStatus =
  | 'specified'
  | 'documented'
  | 'authorized'
  | 'unknown';

/** NIST Privacy Framework 1.0 evidence (IDENTIFY-P / GOVERN-P / CONTROL-P / COMMUNICATE-P / PROTECT-P). */
export interface NistPrivacyFrameworkEvidence {
  identify?: {
    processing_context_documented?: boolean;
    privacy_risk_identified?: boolean;
    data_actions_documented?: boolean;
  };
  govern?: {
    policies_documented?: boolean;
    roles_documented?: boolean;
    risk_governance_documented?: boolean;
  };
  control?: {
    data_actions_controlled?: boolean;
    individual_choice_addressed?: boolean;
  };
  communicate?: {
    transparency_documented?: boolean;
    expectations_documented?: boolean;
  };
  protect?: {
    privacy_risk_mitigation_documented?: boolean;
  };
}

export interface PrivacyGovernanceEvidence {
  /** Optional processing role — do not infer; unknown → review when role is required. */
  processing_role?: PrivacyProcessingRole;
  /** Optional purpose evidence status — not a lawful-basis determination. */
  purpose_status?: PrivacyPurposeStatus;
  /** NIST Privacy Framework 1.0 evidence — distinct from ISO/IEC 27701 PIMS fields. */
  nist_pf?: NistPrivacyFrameworkEvidence;
  pims?: {
    scope_defined?: boolean;
    privacy_context_established?: boolean;
    roles_responsibilities_defined?: boolean;
    privacy_objectives_defined?: boolean;
  };
  pii_governance?: {
    pii_processing_inventory_established?: boolean;
    processing_purposes_defined?: boolean;
    processing_roles_defined?: boolean;
    controller_processor_role_defined?: boolean;
    processing_responsibilities_defined?: boolean;
  };
  privacy_risk?: {
    privacy_risk_process_established?: boolean;
    privacy_risks_identified?: boolean;
    privacy_risks_assessed?: boolean;
    privacy_risk_treatment_defined?: boolean;
    residual_privacy_risk_reviewed?: boolean;
  };
  privacy_impact?: {
    privacy_impact_assessment_established?: boolean;
    potential_impacts_identified?: boolean;
    affected_individuals_considered?: boolean;
    mitigations_defined?: boolean;
    residual_impact_reviewed?: boolean;
  };
  data_lifecycle?: {
    collection_governance_established?: boolean;
    use_governance_established?: boolean;
    sharing_governance_established?: boolean;
    retention_governance_established?: boolean;
    deletion_disposal_governance_established?: boolean;
  };
  rights?: {
    privacy_rights_process_established?: boolean;
    rights_request_handling_established?: boolean;
    identity_verification_for_rights_established?: boolean;
    response_process_established?: boolean;
  };
  transparency?: {
    privacy_information_provided?: boolean;
    processing_transparency_established?: boolean;
    notice_governance_established?: boolean;
  };
  third_party?: {
    processor_requirements_defined?: boolean;
    third_party_privacy_requirements_defined?: boolean;
    processor_monitoring_established?: boolean;
  };
  privacy_incident?: {
    privacy_incident_process_established?: boolean;
    privacy_breach_response_established?: boolean;
    notification_process_established?: boolean;
  };
  monitoring?: {
    privacy_performance_monitored?: boolean;
    privacy_review_established?: boolean;
    management_review_established?: boolean;
  };
  improvement?: {
    privacy_nonconformities_managed?: boolean;
    corrective_actions_managed?: boolean;
    continual_improvement_established?: boolean;
  };
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
  /** Generic enterprise assurance / control evidence (framework packs). */
  assurance?: AssuranceControlEvidence;
  /** Generic enterprise cybersecurity governance evidence (CSF-aligned). */
  cybersecurity?: CybersecurityGovernanceEvidence;
  /** Generic organizational AI governance evidence (governing body / direction). */
  organizational_governance?: OrganizationalGovernanceEvidence;
  /** Generic information-security management-system evidence (ISMS-aligned). */
  information_security?: InformationSecurityGovernanceEvidence;
  /** Generic privacy information management evidence (PIMS-aligned). */
  privacy?: PrivacyGovernanceEvidence;
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
