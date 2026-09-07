/**
 * Verified Gateway enforcement projection.
 * Distinct from deriveDecisionConsequence (expected action only).
 * Pack-agnostic — no regulatory branches.
 *
 * REVIEW safety note:
 * Legacy Gateway maps REVIEW → BLOCK as a fail-closed safety hold.
 * That is NOT a policy DENY. Pending REVIEW projects as REVIEW_REQUIRED /
 * NOT_EXECUTED / UNKNOWN — never as BLOCKED.
 */

import type { AuditEvent } from '../../audit/service.js';
import type { PolicyEvaluationRecord } from './evaluation-record.js';
import type { PolicyExplanation } from './types.js';

export type EnforcementStatus =
  | 'ALLOWED'
  | 'BLOCKED'
  | 'CONTROLS_APPLIED'
  | 'REVIEW_REQUIRED'
  | 'FAILED'
  | 'NOT_EXECUTED'
  | 'UNKNOWN';

export type ExpectedActionCode =
  | 'BLOCK'
  | 'ALLOW'
  | 'APPLY_CONTROLS'
  | 'HOLD'
  | 'PROCESS';

export interface EnforcementProjection {
  /** Observed/verified Gateway result — never invent success. */
  status: EnforcementStatus;
  /**
   * True when a Gateway audit/enforcement record was joined.
   * Distinct from customer-facing verification of a successful expected outcome —
   * see {@link customerVerificationLabel}.
   */
  verified: boolean;
  /** True when Gateway attempted enforcement for this request. */
  attempted: boolean;
  expected_action: ExpectedActionCode;
  action_attempted?: string;
  gateway_report?: string;
  request_id?: string;
  audit_id?: string;
  occurred_at?: string;
  summary: string;
  /**
   * True when Gateway blocked as fail-closed hold for REVIEW —
   * not a machine or human DENY.
   */
  safety_fallback?: boolean;
}

/**
 * Customer-facing verification of the expected enforcement outcome.
 * Distinct from `verified` (audit joined) and from cryptographic event integrity.
 *
 * ALLOWED / CONTROLS_APPLIED / BLOCKED + joined audit → VERIFIED
 * FAILED → FAILED (never VERIFIED, even when an audit exists)
 * UNKNOWN / missing / REVIEW_REQUIRED → UNVERIFIED
 */
export type CustomerVerificationLabel =
  | 'VERIFIED'
  | 'FAILED'
  | 'UNVERIFIED'
  | 'NOT_EXECUTED';

export function customerVerificationLabel(
  enforcement:
    | Pick<EnforcementProjection, 'status' | 'verified'>
    | null
    | undefined,
): CustomerVerificationLabel {
  if (!enforcement) return 'UNVERIFIED';
  if (enforcement.status === 'FAILED') return 'FAILED';
  if (enforcement.status === 'NOT_EXECUTED') return 'NOT_EXECUTED';
  if (
    enforcement.verified &&
    (enforcement.status === 'ALLOWED' ||
      enforcement.status === 'CONTROLS_APPLIED' ||
      enforcement.status === 'BLOCKED')
  ) {
    return 'VERIFIED';
  }
  return 'UNVERIFIED';
}

const HARD_FAILURE_CODES = new Set([
  'TRANSFORM_FAILURE',
  'DETOKENIZE_FAILURE',
  'INSPECTION_FAILURE',
  'INTERNAL_ERROR',
  'POLICY_ENGINE_FAILURE',
]);

function obligationCodes(
  explanation?: PolicyExplanation | null,
  obligations?: unknown[],
): Set<string> {
  const codes = new Set<string>();
  for (const o of obligations ?? []) {
    if (o && typeof o === 'object' && 'code' in o) {
      codes.add(String((o as { code: unknown }).code));
    }
  }
  for (const c of explanation?.operator?.enigma_obligations ?? []) {
    codes.add(String(c));
  }
  for (const a of explanation?.provenance?.enforcement?.actions ?? []) {
    codes.add(String(a));
  }
  return codes;
}

/** Transform / vault-style controls that leave evidence on audit transformations. */
function expectsTransformControls(
  decision: string,
  explanation?: PolicyExplanation | null,
  obligations?: unknown[],
): boolean {
  const d = String(decision ?? '').toUpperCase();
  const codes = obligationCodes(explanation, obligations);
  return (
    codes.has('TOKENIZE_PII') ||
    codes.has('AUTHORIZE_DETOKENIZATION') ||
    d === 'TOKENIZE' ||
    d === 'REDACT' ||
    d === 'MASK' ||
    d === 'TRANSFORM' ||
    (explanation?.operator?.enforcement_controls?.length ?? 0) > 0
  );
}

/**
 * Routing constraints (local-only / no external) are enforced by model eligibility,
 * not by input/response transforms. They must not force APPLY_CONTROLS verification
 * against transform fields — that falsely projects FAILED on successful releases.
 */
function decisionExpectsControls(
  decision: string,
  explanation?: PolicyExplanation | null,
  obligations?: unknown[],
): boolean {
  return expectsTransformControls(decision, explanation, obligations);
}

function routingControlSatisfied(audit: AuditEvent): boolean {
  const model = String(audit.model_selected ?? '');
  if (!model) return false;
  return model.startsWith('local-');
}

export function expectedActionFromDecision(
  decision: string,
  explanation?: PolicyExplanation | null,
  obligations?: unknown[],
): ExpectedActionCode {
  const d = String(decision ?? '').toUpperCase();
  if (d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT') return 'BLOCK';
  if (d === 'REVIEW') return 'HOLD';
  if (decisionExpectsControls(decision, explanation, obligations)) {
    return 'APPLY_CONTROLS';
  }
  if (d === 'ALLOW') return 'ALLOW';
  return 'PROCESS';
}

/** Expected action for operators — uses final decision after human resolution. */
export function effectiveExpectedAction(
  record: PolicyEvaluationRecord,
): ExpectedActionCode {
  const resolved = record.human_resolution;
  if (resolved?.resolution_status === 'RESOLVED') {
    return expectedActionFromDecision(
      resolved.final_decision,
      record.explanation,
      record.obligations,
    );
  }
  return expectedActionFromDecision(
    record.decision,
    record.explanation,
    record.obligations,
  );
}

function isBlockAudit(audit: AuditEvent): boolean {
  return audit.response_decision === 'BLOCK' || audit.policy_decision === 'BLOCK';
}

function isResolutionAudit(audit: AuditEvent): boolean {
  return (
    audit.operation === 'evaluation_resolve' ||
    audit.metadata?.resolution === true ||
    String(audit.metadata?.operation ?? '') === 'evaluation_resolve'
  );
}

function hasControlsApplied(audit: AuditEvent): boolean {
  const input = audit.input_transformation ?? 'none';
  const response = audit.response_transformation ?? 'none';
  return (
    (input !== 'none' && input !== 'failed') ||
    (response !== 'none' && response !== 'failed')
  );
}

function hasHardFailure(audit: AuditEvent): boolean {
  if (audit.errors != null) return true;
  if (audit.input_transformation === 'failed') return true;
  if (audit.response_transformation === 'failed') return true;
  return (audit.reason_codes ?? []).some((c) => HARD_FAILURE_CODES.has(c));
}

function gatewayReport(audit: AuditEvent): string {
  const parts = [
    audit.operation ? `operation=${audit.operation}` : null,
    audit.policy_decision ? `policy=${audit.policy_decision}` : null,
    audit.response_decision ? `response=${audit.response_decision}` : null,
    audit.input_transformation && audit.input_transformation !== 'none'
      ? `input_xform=${audit.input_transformation}`
      : null,
    audit.response_transformation && audit.response_transformation !== 'none'
      ? `response_xform=${audit.response_transformation}`
      : null,
  ].filter(Boolean);
  return parts.join('; ') || 'recorded';
}

function isPendingReview(record: PolicyEvaluationRecord): boolean {
  if (record.human_resolution?.resolution_status === 'RESOLVED') return false;
  const d = String(record.decision ?? '').toUpperCase();
  if (d === 'REVIEW') return true;
  const category = record.explanation?.resolution?.category;
  return category === 'UNRESOLVED' || category === 'CONFLICT';
}

/**
 * Project verified enforcement from evaluation + optional Gateway audit event.
 * Without a linked audit, status is UNKNOWN (or NOT_EXECUTED for simulate / hold).
 */
export function projectEnforcementResult(
  record: PolicyEvaluationRecord,
  audit?: AuditEvent | null,
): EnforcementProjection {
  const expected = effectiveExpectedAction(record);
  const requestId = record.request_id ?? audit?.request_id;
  const resolved = record.human_resolution?.resolution_status === 'RESOLVED'
    ? record.human_resolution
    : undefined;

  // Human-resolved: prefer resolution audit / final decision semantics.
  if (resolved) {
    const baseExpected = expected;
    if (record.phase === 'simulate' && !audit) {
      return {
        status: 'NOT_EXECUTED',
        verified: false,
        attempted: false,
        expected_action: baseExpected,
        request_id: requestId,
        summary: `Human resolved to ${resolved.final_decision}; Gateway was not re-executed (simulate)`,
      };
    }
    if (!audit) {
      return {
        status: 'UNKNOWN',
        verified: false,
        attempted: false,
        expected_action: baseExpected,
        request_id: requestId,
        summary: `Human resolved to ${resolved.final_decision}; no Gateway enforcement record yet`,
      };
    }
    const base = {
      verified: true,
      attempted: true,
      expected_action: baseExpected,
      action_attempted: baseExpected,
      gateway_report: gatewayReport(audit),
      request_id: audit.request_id,
      audit_id: audit.audit_id,
      occurred_at: audit.timestamp,
    };
    if (hasHardFailure(audit) && !isResolutionAudit(audit)) {
      return { ...base, status: 'FAILED', summary: 'Gateway enforcement failed' };
    }
    if (resolved.final_decision === 'DENY') {
      if (isBlockAudit(audit) || isResolutionAudit(audit)) {
        return {
          ...base,
          status: 'BLOCKED',
          action_attempted: 'BLOCK',
          summary: isResolutionAudit(audit)
            ? 'Human DENY recorded; Gateway enforcement confirms block'
            : 'Gateway blocked after human DENY',
        };
      }
      return {
        ...base,
        status: 'UNKNOWN',
        summary: 'Human DENY recorded; Gateway block not verified',
      };
    }
    // AUTHORIZE → final ALLOW. Resolution audit alone is not Gateway success.
    {
      const resumeStatus = record.execution?.status;
      if (resumeStatus === 'RESUME_FAILED') {
        return {
          status: 'FAILED',
          verified: false,
          attempted: true,
          expected_action: baseExpected,
          request_id: requestId,
          audit_id: audit.audit_id,
          occurred_at: audit.timestamp,
          gateway_report: gatewayReport(audit),
          summary: record.execution?.error
            ? `Resume failed: ${record.execution.error}`
            : 'Authorized ALLOW but Gateway resume failed',
        };
      }
      if (
        resumeStatus === 'AUTHORIZED_NOT_RESUMED' ||
        resumeStatus === 'RESUME_IN_PROGRESS' ||
        (isResolutionAudit(audit) && resumeStatus !== 'RESUMED')
      ) {
        return {
          status: 'UNKNOWN',
          verified: false,
          attempted: false,
          expected_action: baseExpected,
          request_id: requestId,
          audit_id: isResolutionAudit(audit) ? audit.audit_id : undefined,
          summary:
            resumeStatus === 'RESUME_IN_PROGRESS'
              ? 'Human AUTHORIZE recorded; Gateway resume in progress'
              : record.held_request
                ? 'Human AUTHORIZE recorded; Gateway execution not yet resumed'
                : 'Human AUTHORIZE recorded; no resumable held request (disposition only)',
        };
      }
      if (isResolutionAudit(audit) && resumeStatus !== 'RESUMED') {
        return {
          status: 'UNKNOWN',
          verified: false,
          attempted: false,
          expected_action: baseExpected,
          request_id: requestId,
          summary: 'Human AUTHORIZE recorded; Gateway execution not verified',
        };
      }
      if (hasHardFailure(audit) && !isResolutionAudit(audit)) {
        return { ...base, status: 'FAILED', summary: 'Gateway enforcement failed after resume' };
      }
      if (
        !isResolutionAudit(audit) &&
        (audit.response_decision === 'RELEASE' || audit.policy_decision === 'ALLOW')
      ) {
        return {
          ...base,
          status: hasControlsApplied(audit) ? 'CONTROLS_APPLIED' : 'ALLOWED',
          action_attempted: hasControlsApplied(audit) ? 'APPLY_CONTROLS' : 'ALLOW',
          summary: 'Gateway allowed after human AUTHORIZE resume',
        };
      }
      if (isBlockAudit(audit) && !isResolutionAudit(audit)) {
        if (resumeStatus === 'RESUMED') {
          return {
            ...base,
            verified: false,
            status: 'FAILED',
            summary: 'Authorized ALLOW but Gateway blocked on resume',
          };
        }
        return {
          ...base,
          verified: false,
          status: 'UNKNOWN',
          safety_fallback: true,
          action_attempted: 'HOLD',
          summary:
            'Prior safety hold still visible; human AUTHORIZE recorded - resume Gateway to verify',
        };
      }
      return {
        status: 'UNKNOWN',
        verified: false,
        attempted: false,
        expected_action: baseExpected,
        request_id: requestId,
        summary: 'Human AUTHORIZE recorded; Gateway execution not verified',
      };
    }
  }

  // Pending REVIEW: never project as BLOCKED (that would imply DENY).
  if (isPendingReview(record)) {
    if (record.phase === 'simulate') {
      return {
        status: 'NOT_EXECUTED',
        verified: false,
        attempted: false,
        expected_action: 'HOLD',
        request_id: requestId,
        summary: 'Pending human review - Gateway not executed (simulate)',
      };
    }
    if (!audit) {
      return {
        status: 'UNKNOWN',
        verified: false,
        attempted: false,
        expected_action: 'HOLD',
        request_id: requestId,
        summary: 'Pending human review - no Gateway hold record linked',
      };
    }
    if (isBlockAudit(audit)) {
      return {
        status: 'REVIEW_REQUIRED',
        verified: true,
        attempted: true,
        expected_action: 'HOLD',
        action_attempted: 'HOLD',
        gateway_report: gatewayReport(audit),
        request_id: audit.request_id,
        audit_id: audit.audit_id,
        occurred_at: audit.timestamp,
        safety_fallback: true,
        summary:
          'Safety hold pending human review - not a policy DENY',
      };
    }
    return {
      status: 'REVIEW_REQUIRED',
      verified: true,
      attempted: true,
      expected_action: 'HOLD',
      gateway_report: gatewayReport(audit),
      request_id: audit.request_id,
      audit_id: audit.audit_id,
      occurred_at: audit.timestamp,
      summary: 'Pending human review',
    };
  }

  if (record.phase === 'simulate') {
    return {
      status: 'NOT_EXECUTED',
      verified: false,
      attempted: false,
      expected_action: expected,
      request_id: requestId,
      summary: 'Simulation only - Gateway enforcement was not executed',
    };
  }

  if (!audit) {
    return {
      status: 'UNKNOWN',
      verified: false,
      attempted: false,
      expected_action: expected,
      request_id: requestId,
      summary: 'No verified Gateway enforcement record for this decision',
    };
  }

  const base = {
    verified: true,
    attempted: true,
    expected_action: expected,
    action_attempted: expected,
    gateway_report: gatewayReport(audit),
    request_id: audit.request_id,
    audit_id: audit.audit_id,
    occurred_at: audit.timestamp,
  };

  if (hasHardFailure(audit)) {
    return {
      ...base,
      status: 'FAILED',
      summary: 'Gateway enforcement failed',
    };
  }

  if (expected === 'BLOCK') {
    if (isBlockAudit(audit)) {
      return {
        ...base,
        status: 'BLOCKED',
        action_attempted: 'BLOCK',
        summary: 'Gateway blocked the request',
      };
    }
    return {
      ...base,
      status: 'FAILED',
      summary: 'Expected block was not confirmed by Gateway',
    };
  }

  if (expected === 'APPLY_CONTROLS') {
    if (isBlockAudit(audit) && !hasControlsApplied(audit)) {
      return {
        ...base,
        status: 'BLOCKED',
        action_attempted: 'BLOCK',
        summary: 'Gateway blocked during controlled execution',
      };
    }
    if (audit.response_decision === 'RELEASE' || audit.policy_decision) {
      if (hasControlsApplied(audit)) {
        return {
          ...base,
          status: 'CONTROLS_APPLIED',
          action_attempted: 'APPLY_CONTROLS',
          summary: 'Gateway applied required controls',
        };
      }
      if (audit.response_decision === 'RELEASE') {
        // Transform controls were expected but not observed on a successful release.
        return {
          ...base,
          status: 'FAILED',
          summary: 'Expected transform controls were not observed on Gateway release',
        };
      }
    }
  }

  if (expected === 'ALLOW' || expected === 'PROCESS') {
    if (audit.response_decision === 'RELEASE') {
      const codes = obligationCodes(record.explanation, record.obligations);
      const routingOnly =
        (codes.has('LOCAL_MODEL_ONLY') || codes.has('NO_EXTERNAL_TRANSMISSION')) &&
        !expectsTransformControls(record.decision, record.explanation, record.obligations);
      if (hasControlsApplied(audit)) {
        return {
          ...base,
          status: 'CONTROLS_APPLIED',
          action_attempted: 'APPLY_CONTROLS',
          summary: 'Gateway released with controls',
        };
      }
      if (routingOnly && routingControlSatisfied(audit)) {
        return {
          ...base,
          status: 'ALLOWED',
          action_attempted: 'ALLOW',
          summary: 'Gateway allowed with local/routing constraints satisfied',
        };
      }
      return {
        ...base,
        status: 'ALLOWED',
        action_attempted: 'ALLOW',
        summary: 'Gateway allowed the request',
      };
    }
    if (isBlockAudit(audit)) {
      return {
        ...base,
        status: 'BLOCKED',
        action_attempted: 'BLOCK',
        summary: 'Gateway blocked the request',
      };
    }
  }

  return {
    ...base,
    status: 'UNKNOWN',
    verified: true,
    summary: 'Gateway record present but enforcement status could not be classified',
  };
}

/** Index audit events by request_id (latest wins). */
export function indexAuditsByRequestId(
  events: AuditEvent[],
): Map<string, AuditEvent> {
  const map = new Map<string, AuditEvent>();
  for (const e of events) {
    if (!e.request_id) continue;
    const prev = map.get(e.request_id);
    if (!prev || String(e.timestamp) >= String(prev.timestamp)) {
      map.set(e.request_id, e);
    }
  }
  return map;
}

/** Prefer request_id join; prefer non-resolution completion audits over resolve audits. */
export function findAuditForEvaluation(
  record: PolicyEvaluationRecord,
  events: AuditEvent[],
): AuditEvent | null {
  const matching: AuditEvent[] = [];
  for (const e of events) {
    if (record.request_id && e.request_id === record.request_id) {
      matching.push(e);
      continue;
    }
    const meta = e.metadata ?? {};
    if (
      meta.evaluation_id === record.evaluation_id ||
      meta.response_evaluation_id === record.evaluation_id
    ) {
      matching.push(e);
    }
  }
  if (matching.length === 0) return null;
  matching.sort((a, b) => (String(a.timestamp) < String(b.timestamp) ? 1 : -1));
  const completion = matching.find((e) => !isResolutionAudit(e));
  return completion ?? matching[0] ?? null;
}
