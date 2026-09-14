/**
 * Phase 4 / 4.1 — client-reported execution Outcome evidence.
 *
 * Outcome is distinct from Decision and Enforcement:
 *   Decision     = what policy decided
 *   Enforcement  = what Gateway allowed/blocked (e.g. CLIENT_COMMIT_ALLOWED)
 *   Execution    = what the client attempted downstream
 *   Outcome      = what the authorized client reported happened
 *
 * Phase 4.1: one (deployment_id, execution_id) has one authoritative Outcome.
 * Claim the projection before sealing CLIENT_OUTCOME_RECEIPT.
 *
 * Outcome is client-reported evidence. It is not independent verification of
 * the external system unless Enigma has a separate verification mechanism.
 */

import { createHash } from 'node:crypto';
import type { AuditEvent } from './service.js';
import type { PolicyEvaluationRecord } from '../policy/enterprise/evaluation-record.js';

export const CLIENT_OUTCOME_STATUSES = [
  'EXECUTED',
  'EXECUTION_FAILED',
  'EXECUTION_TIMEOUT',
  'EXECUTION_UNKNOWN',
] as const;

export type ClientOutcomeStatus = (typeof CLIENT_OUTCOME_STATUSES)[number];

export function isClientOutcomeStatus(v: unknown): v is ClientOutcomeStatus {
  return (
    typeof v === 'string' &&
    (CLIENT_OUTCOME_STATUSES as readonly string[]).includes(v)
  );
}

/** Audit reason code stamped on accepted outcome receipts. */
export function outcomeReasonCode(outcome: ClientOutcomeStatus): string {
  return `CLIENT_OUTCOME_${outcome}`;
}

export const OUTCOME_REASON_CODES = {
  RECEIPT: 'CLIENT_OUTCOME_RECEIPT',
  CONFLICT: 'CLIENT_OUTCOME_CONFLICT',
} as const;

/**
 * Server-derived binding context from the authorizing evaluation / audit.
 * Authoritative for Outcome identity — not restated from the client.
 */
export type AuthorizedOutcomeContext = {
  application_id: string;
  evaluation_id: string;
  user_id: string | null;
  agent_id: string | null;
  tool_id: string | null;
  operation: string | null;
  purpose: string | null;
  authorization_context: string | null;
  action_kind: string | null;
  target_id: string | null;
  /** e.g. Patient field API name when authorized as attributes.field */
  action_field: string | null;
  request_id: string | null;
};

type ActionShape = {
  kind?: string;
  target_id?: string;
  attributes?: Record<string, unknown>;
};

function asAction(raw: unknown): ActionShape | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as ActionShape;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Derive the authorized execution context Enigma already knows.
 * Prefers held_request (REVIEW path), then authz audit metadata / evaluation fields.
 */
export function deriveAuthorizedOutcomeContext(opts: {
  evaluation: PolicyEvaluationRecord;
  authzAudit: AuditEvent;
  applicationId: string;
}): AuthorizedOutcomeContext {
  const { evaluation, authzAudit, applicationId } = opts;
  const held = evaluation.held_request;
  const gov = held?.governance_context as Record<string, unknown> | undefined;
  const action =
    asAction(gov?.action) ??
    asAction(authzAudit.metadata?.action) ??
    asAction(evaluation.ai_context?.action);

  const ai = evaluation.ai_context ?? {};
  const fieldRaw = action?.attributes?.field;

  return {
    application_id: applicationId,
    evaluation_id: evaluation.evaluation_id,
    user_id:
      strOrNull(held?.user_id) ??
      strOrNull(authzAudit.user_id) ??
      strOrNull(evaluation.subject?.user_id),
    agent_id:
      strOrNull(held?.agent_id) ??
      strOrNull(ai.agent_id) ??
      strOrNull(authzAudit.metadata?.agent_id),
    tool_id:
      strOrNull(held?.tool_id) ??
      strOrNull(ai.tool_id) ??
      strOrNull(authzAudit.metadata?.tool_id),
    operation:
      strOrNull(held?.operation) ??
      strOrNull(authzAudit.operation) ??
      strOrNull(evaluation.action),
    purpose: strOrNull(held?.purpose) ?? strOrNull(evaluation.context?.purpose),
    authorization_context:
      strOrNull(held?.authorization_context) ??
      strOrNull(evaluation.context?.authorization_context),
    action_kind: strOrNull(action?.kind),
    target_id: strOrNull(action?.target_id),
    action_field: strOrNull(fieldRaw),
    request_id:
      strOrNull(evaluation.request_id) ?? strOrNull(authzAudit.request_id),
  };
}

/**
 * Reject when the client asserts a value that disagrees with server-derived binding.
 * Omitted client fields are fine — binding uses server-derived values.
 */
export function clientOutcomeContextMismatch(
  bound: AuthorizedOutcomeContext,
  client: {
    user?: { id: string };
    agent_id?: string;
    tool_id?: string;
    operation?: string;
    purpose?: string;
    authorization_context?: string;
    action?: {
      kind: string;
      target_id?: string;
      attributes?: Record<string, unknown>;
    };
  },
): string | null {
  const check = (
    label: string,
    expected: string | null,
    provided: string | undefined,
  ): string | null => {
    if (expected == null || provided == null) return null;
    if (provided !== expected) return label;
    return null;
  };

  if (check('USER_MISMATCH', bound.user_id, client.user?.id)) {
    return 'USER_MISMATCH';
  }
  if (check('AGENT_MISMATCH', bound.agent_id, client.agent_id)) {
    return 'AGENT_MISMATCH';
  }
  if (check('TOOL_MISMATCH', bound.tool_id, client.tool_id)) {
    return 'TOOL_MISMATCH';
  }
  if (check('OPERATION_MISMATCH', bound.operation, client.operation)) {
    return 'OPERATION_MISMATCH';
  }
  if (check('PURPOSE_MISMATCH', bound.purpose, client.purpose)) {
    return 'PURPOSE_MISMATCH';
  }
  if (
    check(
      'AUTHORIZATION_CONTEXT_MISMATCH',
      bound.authorization_context,
      client.authorization_context,
    )
  ) {
    return 'AUTHORIZATION_CONTEXT_MISMATCH';
  }
  if (check('ACTION_KIND_MISMATCH', bound.action_kind, client.action?.kind)) {
    return 'ACTION_KIND_MISMATCH';
  }
  if (
    check('TARGET_MISMATCH', bound.target_id, client.action?.target_id)
  ) {
    return 'TARGET_MISMATCH';
  }
  const clientField =
    typeof client.action?.attributes?.field === 'string'
      ? client.action.attributes.field
      : undefined;
  if (check('FIELD_MISMATCH', bound.action_field, clientField)) {
    return 'FIELD_MISMATCH';
  }
  return null;
}

/**
 * Stable fingerprint of an accepted receipt for idempotent replay detection.
 * Uses server-derived binding context + outcome (not volatile timestamps).
 */
export function computeOutcomeReceiptHash(input: {
  deployment_id: string;
  evaluation_id: string;
  execution_id: string;
  outcome: ClientOutcomeStatus;
  application_id: string;
  user_id?: string | null;
  agent_id?: string | null;
  tool_id?: string | null;
  operation?: string | null;
  purpose?: string | null;
  authorization_context?: string | null;
  action_kind?: string | null;
  target_id?: string | null;
  action_field?: string | null;
  request_id?: string | null;
}): string {
  const canonical = JSON.stringify({
    deployment_id: input.deployment_id,
    evaluation_id: input.evaluation_id,
    execution_id: input.execution_id,
    outcome: input.outcome,
    application_id: input.application_id,
    user_id: input.user_id ?? null,
    agent_id: input.agent_id ?? null,
    tool_id: input.tool_id ?? null,
    operation: input.operation ?? null,
    purpose: input.purpose ?? null,
    authorization_context: input.authorization_context ?? null,
    action_kind: input.action_kind ?? null,
    target_id: input.target_id ?? null,
    action_field: input.action_field ?? null,
    request_id: input.request_id ?? null,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Immutable projection of an accepted client outcome (idempotency / claim index). */
export interface ActionOutcomeRecord {
  deployment_id: string;
  execution_id: string;
  evaluation_id: string;
  application_id: string;
  outcome: ClientOutcomeStatus;
  receipt_hash: string;
  audit_event_id: string;
  request_id?: string | null;
  reported_at: string;
  user_id?: string | null;
  agent_id?: string | null;
  tool_id?: string | null;
  operation?: string | null;
  purpose?: string | null;
  authorization_context?: string | null;
  action_kind?: string | null;
  target_id?: string | null;
  action_field?: string | null;
  /** Explicit: evidence is client-asserted, not independently verified. */
  evidence_class: 'client_reported';
}

export function projectOutcomeFromRecord(
  row: ActionOutcomeRecord | null | undefined,
): {
  status: ClientOutcomeStatus | 'NOT_REPORTED';
  execution_id?: string;
  audit_event_id?: string;
  reported_at?: string;
  application_id?: string;
  evidence_class: 'client_reported' | 'not_reported';
  summary: string;
} {
  if (!row) {
    return {
      status: 'NOT_REPORTED',
      evidence_class: 'not_reported',
      summary:
        'No client outcome receipt recorded. Authorization alone does not prove downstream execution.',
    };
  }
  return {
    status: row.outcome,
    execution_id: row.execution_id,
    audit_event_id: row.audit_event_id,
    reported_at: row.reported_at,
    application_id: row.application_id,
    evidence_class: 'client_reported',
    summary: `Client reported ${row.outcome} for execution ${row.execution_id}`,
  };
}
