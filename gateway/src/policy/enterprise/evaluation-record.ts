/**
 * Policy evaluation record for policy_evaluations persistence.
 * Authoritative historical store for what Enigma decided and why
 * (explanation, resolution, provenance, controls, decision restrictions).
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

/** Durable decision restrictions — immutable snapshot from evaluation time. */
export type EvaluationRestrictions = {
  /** Exact EPA-authorized model IDs for this evaluation (may be []). */
  eligible_models: string[];
  deny_external_transmission?: boolean;
  require_local?: boolean;
};

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
  /**
   * Decision restrictions at evaluation time (authorized model set, etc.).
   * Must not be recalculated from current registry/policy state on read.
   */
  restrictions?: EvaluationRestrictions;
  explanation: PolicyExplanation;
  created_at: string;
  /** Human governance intervention — does not replace machine decision. */
  human_resolution?: HumanResolution;
  /** Live request snapshot retained only when machine decision is REVIEW (for resume). */
  held_request?: HeldRequestSnapshot;
  /** Resume lifecycle after AUTHORIZE — not a workflow engine. */
  execution?: EvaluationExecution;
}

/** Normalize decision restrictions for durable storage. Always records eligible_models. */
export function snapshotDecisionRestrictions(
  restrictions: PolicyDecision['restrictions'] | undefined,
): EvaluationRestrictions {
  const eligible = restrictions?.eligible_models;
  return {
    eligible_models: Array.isArray(eligible) ? [...eligible] : [],
    ...(restrictions?.deny_external_transmission != null
      ? { deny_external_transmission: !!restrictions.deny_external_transmission }
      : {}),
    ...(restrictions?.require_local != null
      ? { require_local: !!restrictions.require_local }
      : {}),
  };
}

/** Restore restrictions from a stored record / evidence_in without recalculation. */
export function restoreEvaluationRestrictions(
  record: Pick<PolicyEvaluationRecord, 'restrictions' | 'evidence_in'>,
): EvaluationRestrictions | undefined {
  if (record.restrictions && Array.isArray(record.restrictions.eligible_models)) {
    return {
      eligible_models: [...record.restrictions.eligible_models],
      ...(record.restrictions.deny_external_transmission != null
        ? {
            deny_external_transmission:
              !!record.restrictions.deny_external_transmission,
          }
        : {}),
      ...(record.restrictions.require_local != null
        ? { require_local: !!record.restrictions.require_local }
        : {}),
    };
  }
  const fromEvidence = record.evidence_in?.restrictions;
  if (fromEvidence && typeof fromEvidence === 'object') {
    const eligible = (fromEvidence as { eligible_models?: unknown }).eligible_models;
    if (Array.isArray(eligible)) {
      const row = fromEvidence as {
        eligible_models: unknown[];
        deny_external_transmission?: unknown;
        require_local?: unknown;
      };
      return {
        eligible_models: row.eligible_models.map(String),
        ...(row.deny_external_transmission != null
          ? { deny_external_transmission: !!row.deny_external_transmission }
          : {}),
        ...(row.require_local != null
          ? { require_local: !!row.require_local }
          : {}),
      };
    }
  }
  // Legacy records without persisted eligibility remain incomplete (do not invent).
  return undefined;
}

export function toEvaluationRecord(
  decision: PolicyDecision,
  request?: Partial<PolicyEvaluationRequest> & { phase?: EvaluationPhase },
): PolicyEvaluationRecord {
  const phase =
    request?.evaluation_phase ??
    request?.phase ??
    ('input' as EvaluationPhase);
  const restrictions = snapshotDecisionRestrictions(decision.restrictions);
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
      // Dual-write restrictions into evidence_in so older DB schemas still retain them.
      restrictions,
    },
    decision: decision.decision,
    reason: decision.reason,
    reason_codes: decision.reason_codes,
    applicable_policies: decision.applicable_policies,
    obligations: decision.obligations,
    restrictions,
    explanation: decision.explanation,
    created_at: new Date().toISOString(),
  };
}
