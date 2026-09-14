/**
 * Product 1.0 — Enforcement integrity classification.
 *
 * Distinguishes Decision authority from Gateway control vs client-commit.
 * Does not invent execution proxy semantics.
 */

import type { PolicyEvaluationRecord } from './evaluation-record.js';

/** Product 1.0 enforcement boundary class (operator + API facing). */
export type EnforcementBoundaryClass =
  | 'GATEWAY_ENFORCED'
  | 'CLIENT_COMMIT_REQUIRED'
  | 'REVIEW_REQUIRED'
  | 'DENIED';

export type OutcomeIntegrityStatus =
  | 'COMPLETED'
  | 'REPORTED'
  | 'NOT_REPORTED'
  | 'FAILED'
  | 'NOT_APPLICABLE';

export interface EnforcementIntegrity {
  /**
   * What Enigma controls for this Decision.
   * Never implies Enigma performed external DML for CLIENT_COMMIT_REQUIRED.
   */
  boundary: EnforcementBoundaryClass;
  /** Human-readable boundary label. */
  boundary_label: string;
  /** True only when Gateway itself performed the governed side effect (e.g. model run). */
  gateway_executed_side_effect: boolean;
  /**
   * True when Gateway issued commit_allowed for this evaluation (actions path).
   * Null when not applicable (completions / denied / pending review).
   */
  commit_authorized: boolean | null;
  /** Short operator summary — technically honest. */
  summary: string;
}

function boundaryLabel(boundary: EnforcementBoundaryClass): string {
  switch (boundary) {
    case 'GATEWAY_ENFORCED':
      return 'Gateway enforced';
    case 'CLIENT_COMMIT_REQUIRED':
      return 'Client commit required';
    case 'REVIEW_REQUIRED':
      return 'Review required';
    case 'DENIED':
      return 'Denied';
    default:
      return boundary;
  }
}

function isClientCommitRecord(record: PolicyEvaluationRecord): boolean {
  const ag = record.ai_context?.action_governance as
    | { enforcement_boundary?: string; client_commit?: boolean }
    | undefined;
  if (ag?.enforcement_boundary === 'client_commit_required') return true;
  if (ag?.client_commit === true) return true;
  const heldGov = record.held_request?.governance_context as
    | { client_commit?: boolean }
    | undefined;
  if (heldGov?.client_commit === true) return true;
  return false;
}

/**
 * Classify enforcement integrity from the authoritative evaluation record
 * and optional known commit/outcome signals.
 */
export function deriveEnforcementIntegrity(input: {
  record: PolicyEvaluationRecord;
  reviewState?: 'none' | 'pending' | 'resolved' | string;
  /** True when an audit stamp CLIENT_COMMIT_ALLOWED exists for this evaluation. */
  commitAuthorized?: boolean;
  /** Latest client-reported outcome status, if any. */
  outcomeStatus?: string | null;
}): EnforcementIntegrity {
  const machine = String(input.record.decision ?? '').toUpperCase();
  const final = String(
    input.record.human_resolution?.final_decision ?? input.record.decision ?? '',
  ).toUpperCase();
  const reviewState = input.reviewState ?? 'none';
  const clientCommit = isClientCommitRecord(input.record);

  if (machine === 'DENY' || final === 'DENY') {
    return {
      boundary: 'DENIED',
      boundary_label: boundaryLabel('DENIED'),
      gateway_executed_side_effect: false,
      commit_authorized: false,
      summary:
        'Decision DENY — Gateway did not authorize commit or model execution.',
    };
  }

  if (reviewState === 'pending' || (machine === 'REVIEW' && reviewState !== 'resolved')) {
    return {
      boundary: 'REVIEW_REQUIRED',
      boundary_label: boundaryLabel('REVIEW_REQUIRED'),
      gateway_executed_side_effect: false,
      commit_authorized: false,
      summary:
        'Decision REVIEW — held until an authorized approver resolves; commit not authorized.',
    };
  }

  if (clientCommit) {
    const authorized = input.commitAuthorized === true;
    return {
      boundary: 'CLIENT_COMMIT_REQUIRED',
      boundary_label: boundaryLabel('CLIENT_COMMIT_REQUIRED'),
      gateway_executed_side_effect: false,
      commit_authorized: authorized,
      summary: authorized
        ? 'Gateway authorized client commit. External side effect is performed by the integrating system, not Enigma.'
        : 'Client commit required. External side effect proceeds only after Gateway issues commit authorization.',
    };
  }

  return {
    boundary: 'GATEWAY_ENFORCED',
    boundary_label: boundaryLabel('GATEWAY_ENFORCED'),
    gateway_executed_side_effect: true,
    commit_authorized: null,
    summary:
      'Gateway enforces this Decision on the model/transform path it controls.',
  };
}

export function deriveOutcomeIntegrityStatus(input: {
  boundary: EnforcementBoundaryClass;
  outcomeStatus?: string | null;
}): OutcomeIntegrityStatus {
  if (
    input.boundary === 'DENIED' ||
    input.boundary === 'REVIEW_REQUIRED' ||
    input.boundary === 'GATEWAY_ENFORCED'
  ) {
    if (input.boundary === 'GATEWAY_ENFORCED') {
      // Completions: outcome API is actions-path; N/A for model path.
      return 'NOT_APPLICABLE';
    }
    return 'NOT_APPLICABLE';
  }

  const raw = String(input.outcomeStatus ?? '').toUpperCase();
  if (!raw || raw === 'NOT_REPORTED') return 'NOT_REPORTED';
  if (raw === 'EXECUTED') return 'COMPLETED';
  if (raw === 'EXECUTION_FAILED' || raw === 'EXECUTION_TIMEOUT') return 'FAILED';
  if (raw === 'EXECUTION_UNKNOWN') return 'REPORTED';
  return 'REPORTED';
}
