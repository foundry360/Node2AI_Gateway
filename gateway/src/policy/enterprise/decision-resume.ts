/**
 * Minimal post-AUTHORIZE request resume — pack-agnostic.
 *
 * Completes an already evaluated, human-authorized governed action.
 * Not a workflow engine: no queues, SLA, or multi-level approvals.
 *
 * Authority:
 * - evaluation.decision remains the immutable machine decision
 * - human_resolution records AUTHORIZE / DENY
 * - execution tracks resume lifecycle only
 * - audit records what Gateway did on resume
 */

import type { PolicyEvaluationRecord } from './evaluation-record.js';

export type ResumeExecutionStatus =
  | 'AUTHORIZED_NOT_RESUMED'
  | 'RESUME_IN_PROGRESS'
  | 'RESUMED'
  | 'RESUME_FAILED';

export interface EvaluationExecution {
  status: ResumeExecutionStatus;
  updated_at: string;
  resumed_at?: string;
  resume_audit_id?: string;
  error?: string;
  attempt_count: number;
}

/** Minimal snapshot required to resume Gateway execution after AUTHORIZE. */
export interface HeldRequestSnapshot {
  version: 1;
  application_id: string;
  organization_id: string;
  user_id: string;
  operation: string;
  model?: string;
  messages: Array<{ role: string; content: string }>;
  correlation_id: string;
  classification: {
    sensitivity: string;
    confidence: number;
    intent?: string;
    risk: 'low' | 'medium' | 'high';
    reason_codes: string[];
    entities?: Array<{
      type: string;
      start: number;
      end: number;
      preview?: string;
    }>;
  };
  allowed_models: string[];
  available_models: string[];
  /** Healthcare / governance context preserved across human resolution. */
  purpose?: string;
  authorization_context?: string;
  recipient?: string;
  agent_id?: string;
  tool_id?: string;
  permitted_entity_types?: string[];
  source_system?: string;
  processing_location?: string;
  evaluation_as_of?: string;
  governance_context?: Record<string, unknown>;
}

export class ResumeEvaluationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'NOT_AUTHORIZED'
      | 'NOT_ALLOW'
      | 'MISSING_HELD_REQUEST'
      | 'ALREADY_RESUMED'
      | 'RESUME_IN_PROGRESS'
      | 'NOT_REVIEW'
      | 'DENY_CANNOT_RESUME'
      | 'SIMULATE_CANNOT_RESUME',
  ) {
    super(message);
    this.name = 'ResumeEvaluationError';
  }
}

export function hasResumableHeldRequest(
  record: PolicyEvaluationRecord,
): boolean {
  const held = record.held_request;
  if (!held || held.version !== 1) return false;
  if (!held.application_id || !held.organization_id || !held.user_id) return false;
  if (!held.operation || !Array.isArray(held.messages) || held.messages.length === 0) {
    return false;
  }
  // Lifecycle capability holds are authorized by committing baseline — not by
  // replaying the synthetic held snapshot through /v1/ai/completions.
  const op = String(held.operation).toLowerCase();
  if (op === 'lifecycle_change' || op.includes('lifecycle')) return false;
  const evidence = record.evidence_in as Record<string, unknown> | undefined;
  if (evidence?.lifecycle_hold === true) return false;
  return true;
}

export function assertResumeEligible(record: PolicyEvaluationRecord): void {
  const d = String(record.decision ?? '').toUpperCase();
  if (d !== 'REVIEW') {
    throw new ResumeEvaluationError(
      'Only REVIEW decisions can be resumed after human authorization',
      'NOT_REVIEW',
    );
  }
  if (record.phase === 'simulate') {
    throw new ResumeEvaluationError(
      'Simulation evaluations cannot resume Gateway execution',
      'SIMULATE_CANNOT_RESUME',
    );
  }
  const resolution = record.human_resolution;
  if (!resolution || resolution.resolution_status !== 'RESOLVED') {
    throw new ResumeEvaluationError(
      'Human AUTHORIZE is required before resume',
      'NOT_AUTHORIZED',
    );
  }
  if (resolution.human_disposition === 'DENY') {
    throw new ResumeEvaluationError(
      'DENY cannot resume the original request',
      'DENY_CANNOT_RESUME',
    );
  }
  if (resolution.human_disposition !== 'AUTHORIZE') {
    throw new ResumeEvaluationError(
      'Human AUTHORIZE is required before resume',
      'NOT_AUTHORIZED',
    );
  }
  if (resolution.final_decision !== 'ALLOW') {
    throw new ResumeEvaluationError(
      'Final decision must be ALLOW to resume',
      'NOT_ALLOW',
    );
  }
  if (!hasResumableHeldRequest(record)) {
    throw new ResumeEvaluationError(
      'Original request payload was not retained for resume',
      'MISSING_HELD_REQUEST',
    );
  }
  const status = record.execution?.status;
  if (status === 'RESUMED') {
    throw new ResumeEvaluationError(
      'Evaluation already resumed',
      'ALREADY_RESUMED',
    );
  }
  if (status === 'RESUME_IN_PROGRESS') {
    throw new ResumeEvaluationError(
      'Resume already in progress',
      'RESUME_IN_PROGRESS',
    );
  }
}

export function executionAfterAuthorize(
  record: PolicyEvaluationRecord,
  now = new Date().toISOString(),
): EvaluationExecution | undefined {
  if (record.human_resolution?.human_disposition !== 'AUTHORIZE') {
    return undefined;
  }
  if (record.phase === 'simulate' || !hasResumableHeldRequest(record)) {
    return undefined;
  }
  if (record.execution?.status === 'RESUMED' || record.execution?.status === 'RESUME_IN_PROGRESS') {
    return record.execution;
  }
  return {
    status: 'AUTHORIZED_NOT_RESUMED',
    updated_at: now,
    attempt_count: record.execution?.attempt_count ?? 0,
  };
}

export function markResumeInProgress(
  prior: EvaluationExecution | undefined,
  now = new Date().toISOString(),
): EvaluationExecution {
  return {
    status: 'RESUME_IN_PROGRESS',
    updated_at: now,
    attempt_count: (prior?.attempt_count ?? 0) + 1,
  };
}

export function markResumed(
  prior: EvaluationExecution | undefined,
  auditId: string,
  now = new Date().toISOString(),
): EvaluationExecution {
  return {
    status: 'RESUMED',
    updated_at: now,
    resumed_at: now,
    resume_audit_id: auditId,
    attempt_count: prior?.attempt_count ?? 1,
  };
}

export function markResumeFailed(
  prior: EvaluationExecution | undefined,
  error: string,
  now = new Date().toISOString(),
): EvaluationExecution {
  return {
    status: 'RESUME_FAILED',
    updated_at: now,
    error,
    attempt_count: prior?.attempt_count ?? 1,
  };
}
