/**
 * Human review / decision resolution — pack-agnostic.
 *
 * Authority:
 * - policy_evaluations.decision = original machine decision (immutable)
 * - human_resolution = governance intervention (AUTHORIZE | DENY)
 * - final_decision = enforceable intent after resolution
 * - audit_events = operational history of the intervention
 */

import type { PolicyEvaluationRecord } from './evaluation-record.js';

export type HumanDisposition = 'AUTHORIZE' | 'DENY';

export type ResolutionStatus = 'PENDING_REVIEW' | 'RESOLVED';

export type ReviewState = 'not_applicable' | 'pending' | 'resolved';

export interface HumanResolution {
  resolution_status: 'RESOLVED';
  original_decision: string;
  human_disposition: HumanDisposition;
  final_decision: 'ALLOW' | 'DENY';
  resolution_reason: string;
  resolved_by: string;
  resolved_at: string;
}

export interface ResolveDecisionInput {
  disposition: HumanDisposition;
  reason: string;
  resolved_by: string;
}

export class ResolveDecisionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'NOT_ELIGIBLE'
      | 'ALREADY_RESOLVED'
      | 'REASON_REQUIRED'
      | 'INVALID_DISPOSITION',
  ) {
    super(message);
    this.name = 'ResolveDecisionError';
  }
}

export function isEligibleForHumanReview(record: PolicyEvaluationRecord): boolean {
  if (record.human_resolution?.resolution_status === 'RESOLVED') {
    return false;
  }
  const d = String(record.decision ?? '').toUpperCase();
  if (d === 'REVIEW') return true;
  const category = record.explanation?.resolution?.category;
  return category === 'UNRESOLVED' || category === 'CONFLICT';
}

export function reviewStateForRecord(record: PolicyEvaluationRecord): ReviewState {
  if (record.human_resolution?.resolution_status === 'RESOLVED') {
    return 'resolved';
  }
  if (isEligibleForHumanReview(record)) return 'pending';
  return 'not_applicable';
}

export function buildHumanResolution(
  record: PolicyEvaluationRecord,
  input: ResolveDecisionInput,
): HumanResolution {
  const reason = String(input.reason ?? '').trim();
  if (!reason) {
    throw new ResolveDecisionError(
      'Resolution reason is required',
      'REASON_REQUIRED',
    );
  }
  const disposition = String(input.disposition ?? '').toUpperCase();
  if (disposition !== 'AUTHORIZE' && disposition !== 'DENY') {
    throw new ResolveDecisionError(
      'disposition must be AUTHORIZE or DENY',
      'INVALID_DISPOSITION',
    );
  }
  if (!isEligibleForHumanReview(record)) {
    if (record.human_resolution?.resolution_status === 'RESOLVED') {
      throw new ResolveDecisionError(
        'Decision already resolved',
        'ALREADY_RESOLVED',
      );
    }
    throw new ResolveDecisionError(
      'Decision is not eligible for human review',
      'NOT_ELIGIBLE',
    );
  }

  const final_decision = disposition === 'AUTHORIZE' ? 'ALLOW' : 'DENY';
  return {
    resolution_status: 'RESOLVED',
    original_decision: record.decision,
    human_disposition: disposition as HumanDisposition,
    final_decision,
    resolution_reason: reason,
    resolved_by: String(input.resolved_by || 'approver').trim() || 'approver',
    resolved_at: new Date().toISOString(),
  };
}

/**
 * Apply resolution to a clone — never mutates the caller's record in place
 * without returning a new object. Machine decision field is preserved.
 */
export function withHumanResolution(
  record: PolicyEvaluationRecord,
  resolution: HumanResolution,
): PolicyEvaluationRecord {
  return {
    ...record,
    decision: record.decision, // explicit: machine decision immutable
    human_resolution: resolution,
  };
}
