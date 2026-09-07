/**
 * AI Lifecycle & Change Governance (Pack #15 capability).
 * Generic control-plane types — NOT a policy authority / pack.
 * Lifecycle decisions ≠ policy decisions.
 */

import type { GovernanceContext } from '../../types.js';

/** Extensible change types — additional strings allowed without redesign. */
export type GovernanceChangeType =
  | 'MODEL_VERSION'
  | 'MODEL_PROVIDER'
  | 'MODEL_CONFIGURATION'
  | 'SYSTEM_PROMPT'
  | 'AGENT_INSTRUCTION'
  | 'TOOL_ADDED'
  | 'TOOL_REMOVED'
  | 'TOOL_PERMISSION'
  | 'DATA_SOURCE_ADDED'
  | 'DATA_SOURCE_REMOVED'
  | 'DATA_SOURCE_CHANGED'
  | 'KNOWLEDGE_SOURCE'
  | 'RETRIEVAL_CONFIGURATION'
  | 'ACCESS_CHANGE'
  | 'WRITE_CAPABILITY'
  | 'DEPLOYMENT_CONTEXT'
  | 'PROCESSING_LOCATION'
  | 'GOVERNANCE_CONTEXT'
  | 'POLICY_CONFIGURATION'
  | 'APPLICATION_CONFIGURATION'
  | 'AUTONOMY_LEVEL'
  | 'UI_LABEL'
  | (string & {});

export type MaterialityClass = 'NON_MATERIAL' | 'MATERIAL' | 'CRITICAL' | 'UNKNOWN';

/** Lifecycle outcome — distinct from PolicyDecisionCode. */
export type LifecycleDecision =
  | 'NO_REEVALUATION'
  | 'REEVALUATION_REQUIRED'
  | 'MANDATORY_REVIEW'
  | 'UNKNOWN';

/** Generic governance dimensions — not authority names. */
export type GovernanceImpactDimension =
  | 'SECURITY'
  | 'PRIVACY'
  | 'SAFETY'
  | 'REGULATORY'
  | 'MODEL_GOVERNANCE'
  | 'HUMAN_OVERSIGHT'
  | 'DATA_GOVERNANCE'
  | 'ACCESS_CONTROL'
  | 'AUTONOMY'
  | 'EXTERNAL_ACTION'
  | 'PROCESSING_LOCATION'
  | 'KNOWLEDGE';

export type AutonomyLevel = 'ASSISTIVE' | 'HUMAN_APPROVED' | 'AUTONOMOUS';

export type GovernanceBaselineTargetType = 'application' | 'model' | 'system';

export interface GovernanceBaselineCapabilities {
  write_capability?: boolean;
  autonomy_level?: AutonomyLevel;
  tools?: Array<{ id: string; write?: boolean; permission?: string }>;
  data_sources?: string[];
  knowledge_sources?: string[];
  model_id?: string;
  model_version?: string;
  model_provider?: string;
  processing_location?: string;
  system_prompt_hash?: string;
  agent_instruction_hash?: string;
  deployment_context?: string;
}

/**
 * Immutable known governed state of an AI system at a point in time.
 * New state → new baseline version; never mutate historical rows.
 */
export interface GovernanceBaseline {
  baseline_id: string;
  version: number;
  target_type: GovernanceBaselineTargetType;
  target_id: string;
  organization_id?: string;
  components: Record<string, unknown>;
  configuration: Record<string, unknown>;
  capabilities: GovernanceBaselineCapabilities;
  governance_context?: GovernanceContext;
  applicable_authorities?: string[];
  created_at: string;
  supersedes_baseline_id?: string;
  change_id?: string;
}

export interface NormalizedChange {
  change_id: string;
  target_type: GovernanceBaselineTargetType;
  target_id: string;
  previous_baseline_id?: string;
  previous_state: Record<string, unknown>;
  proposed_state: Record<string, unknown>;
  change_types: GovernanceChangeType[];
  source: string;
  detected_at: string;
  actor?: string;
  correlation_id?: string;
  request_id?: string;
  materiality: MaterialityClass;
  lifecycle_decision: LifecycleDecision;
  governance_impacts: GovernanceImpactDimension[];
  materiality_reasons: string[];
  evaluation_id?: string;
  next_baseline_id?: string;
}

export interface ChangeInput {
  target_type: GovernanceBaselineTargetType;
  target_id: string;
  previous_baseline_id?: string;
  /** Explicit change types; when omitted, inferred from state delta when possible. */
  change_types?: GovernanceChangeType[];
  previous_state?: Record<string, unknown>;
  proposed_state?: Record<string, unknown>;
  source?: string;
  actor?: string;
  correlation_id?: string;
  request_id?: string;
  detected_at?: string;
  /** When insufficient state is provided, materiality becomes UNKNOWN. */
  incomplete?: boolean;
}

export interface MaterialityAssessment {
  materiality: MaterialityClass;
  lifecycle_decision: LifecycleDecision;
  governance_impacts: GovernanceImpactDimension[];
  materiality_reasons: string[];
  change_types: GovernanceChangeType[];
}

export interface ChangeEvaluationResult {
  change: NormalizedChange;
  previous_baseline?: GovernanceBaseline;
  next_baseline?: GovernanceBaseline;
  materiality: MaterialityClass;
  lifecycle_decision: LifecycleDecision;
  governance_impacts: GovernanceImpactDimension[];
  materiality_reasons: string[];
  /** Present when PDP was invoked (MATERIAL / CRITICAL / UNKNOWN). */
  policy_decision?: import('../types.js').PolicyDecision;
  evaluation_id?: string;
  /** True when existing PDP evaluateLegacyRequest was called. */
  pdp_invoked: boolean;
}
