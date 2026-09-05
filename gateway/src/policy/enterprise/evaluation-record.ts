/**
 * Generic evaluation audit record for policy_evaluations.explanation persistence.
 * Pack-agnostic — stores the full PolicyDecision explanation including provenance.
 */

import type {
  EvaluationPhase,
  PolicyDecision,
  PolicyEvaluationRequest,
  PolicyExplanation,
} from './types.js';

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
  decision: string;
  reason?: string;
  applicable_policies: unknown[];
  obligations: unknown[];
  explanation: PolicyExplanation;
  created_at: string;
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
    evidence_in: (request?.evidence as unknown as Record<string, unknown>) ?? {},
    decision: decision.decision,
    reason: decision.reason,
    applicable_policies: decision.applicable_policies,
    obligations: decision.obligations,
    explanation: decision.explanation,
    created_at: new Date().toISOString(),
  };
}
