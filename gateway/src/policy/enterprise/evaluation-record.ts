/**
 * Policy evaluation record for policy_evaluations persistence.
 * Authoritative historical store for what Enigma decided and why
 * (explanation, resolution, provenance, controls).
 * Distinct from audit_events (operational activity).
 * Pack-agnostic.
 */

import type {
  EvaluationPhase,
  PolicyDecision,
  PolicyEvaluationRequest,
  PolicyExplanation,
} from './types.js';
import type { HumanResolution } from './decision-resolution.js';
import type {
  EvaluationExecution,
  HeldRequestSnapshot,
} from './decision-resume.js';

export interface PolicyEvaluationRecord {
  evaluation_id: string;
  request_id?: string;
  phase: EvaluationPhase;
  organization_id?: string;
  subject: Record<string, unknown>;
  resource: Record<string, unknown>;
  action?: string;
  context: Record<string, unknown>;
  ai_context: Record<string, unknown>;
  evidence_in: Record<string, unknown>;
  /** Original machine decision — never overwritten by human resolution. */
  decision: string;
  reason?: string;
  reason_codes?: string[];
  applicable_policies: unknown[];
  obligations: unknown[];
  explanation: PolicyExplanation;
  created_at: string;
  /** Human governance intervention — does not replace machine decision. */
  human_resolution?: HumanResolution;
  /** Live request snapshot retained only when machine decision is REVIEW (for resume). */
  held_request?: HeldRequestSnapshot;
  /** Resume lifecycle after AUTHORIZE — not a workflow engine. */
  execution?: EvaluationExecution;
}

export function toEvaluationRecord(
  decision: PolicyDecision,
  request?: Partial<PolicyEvaluationRequest> & { phase?: EvaluationPhase },
): PolicyEvaluationRecord {
  const phase =
    request?.evaluation_phase ??
    request?.phase ??
    ('input' as EvaluationPhase);
  return {
    evaluation_id: decision.evaluation_id,
    request_id: request?.request_id,
    phase,
    organization_id: request?.subject?.organization_id,
    subject: (request?.subject as unknown as Record<string, unknown>) ?? {},
    resource: (request?.resource as unknown as Record<string, unknown>) ?? {},
    action: request?.action,
    context: (request?.context as unknown as Record<string, unknown>) ?? {},
    ai_context: (request?.ai_context as unknown as Record<string, unknown>) ?? {},
    evidence_in: {
      ...((request?.evidence as unknown as Record<string, unknown>) ?? {}),
      // Persist decision reason codes without a schema column change.
      decision_reason_codes: decision.reason_codes,
    },
    decision: decision.decision,
    reason: decision.reason,
    reason_codes: decision.reason_codes,
    applicable_policies: decision.applicable_policies,
    obligations: decision.obligations,
    explanation: decision.explanation,
    created_at: new Date().toISOString(),
  };
}
