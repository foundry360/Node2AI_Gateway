/**
 * Phase D — Action Governance facts (technology-neutral).
 *
 * Builds a server-authored action snapshot for EPA + historical evidence.
 * Not a PDP. Client cannot supply category / class / enforcement boundary.
 */

import { deriveWriteGovernanceClass } from './packs/hipaa/write-field-class.js';

/** Minimal extensible taxonomy for consequence-aware policy. */
export type ActionCategory =
  | 'READ'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXECUTE'
  | 'TRANSMIT'
  | 'INVOKE'
  | 'OTHER';

/**
 * Where Enigma can actually stop side effects.
 * - gateway_enforced: Gateway can block/hold before model or before commit stamp
 * - client_commit_required: Decision is authoritative; external DML depends on client honor + outcome
 */
export type ActionEnforcementBoundary =
  | 'gateway_enforced'
  | 'client_commit_required';

/** Attribute keys safe to retain for governance evidence (no payload values). */
const SAFE_ATTRIBUTE_KEYS = new Set([
  'field',
  'entity_type',
  'record_type',
  'object_type',
  'resource_type',
]);

const SENSITIVE_ATTRIBUTE_KEYS = new Set([
  'value',
  'content',
  'body',
  'text',
  'note',
  'payload',
  'data',
  'message',
  'raw',
]);

export interface RuntimeActionFacts {
  /** Server-derived category — never client-supplied. */
  category: ActionCategory;
  /** Request operation string (e.g. write, summarize). */
  operation: string;
  /** Declared action.kind when present (request fact). */
  kind: string | null;
  /** Target identifier when present (not a payload). */
  target_id: string | null;
  /** Safe attribute subset (e.g. field name) — never free-form values. */
  attributes: Record<string, unknown>;
  /**
   * Server-derived write class when operation is write.
   * Reuses HIPAA field classification (technology-neutral tokens).
   */
  write_governance_class:
    | 'CLINICAL_NOTE'
    | 'ADMINISTRATIVE_LOW_RISK'
    | 'UNKNOWN'
    | null;
  /** How execution is bounded for this request path. */
  enforcement_boundary: ActionEnforcementBoundary;
  /** True when Gateway stamped client_commit for this evaluation. */
  client_commit: boolean;
}

export function sanitizeActionAttributes(
  attrs: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!attrs || typeof attrs !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const k = key.trim().toLowerCase();
    if (SENSITIVE_ATTRIBUTE_KEYS.has(k)) continue;
    if (!SAFE_ATTRIBUTE_KEYS.has(k)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

export function deriveActionCategory(input: {
  operation?: string | null;
  actionKind?: string | null;
}): ActionCategory {
  const op = String(input.operation ?? '')
    .trim()
    .toLowerCase();
  const kind = String(input.actionKind ?? '')
    .trim()
    .toLowerCase();

  if (
    op === 'read' ||
    op === 'retrieve' ||
    op === 'summarize' ||
    op === 'analyze' ||
    op === 'classify' ||
    op === 'generate'
  ) {
    return 'READ';
  }
  if (op === 'delete') return 'DELETE';
  if (op === 'export' || op === 'share' || op === 'transmit') return 'TRANSMIT';
  if (op === 'execute') return 'EXECUTE';
  if (op === 'invoke') return 'INVOKE';
  if (op === 'update') return 'UPDATE';
  if (op === 'create') return 'CREATE';

  if (op === 'write') {
    if (kind === 'clinical_note') return 'CREATE';
    if (kind === 'field_update') return 'UPDATE';
    return 'UPDATE';
  }

  if (kind.includes('delete')) return 'DELETE';
  if (kind.includes('create') || kind.includes('insert')) return 'CREATE';
  if (kind.includes('update') || kind.includes('patch')) return 'UPDATE';
  if (kind.includes('transmit') || kind.includes('export') || kind.includes('share')) {
    return 'TRANSMIT';
  }
  if (kind.includes('invoke') || kind.includes('call')) return 'INVOKE';

  return 'OTHER';
}

export function buildRuntimeActionFacts(input: {
  operation: string;
  action?: {
    kind: string;
    target_id?: string;
    attributes?: Record<string, unknown>;
  } | null;
  /** From governance_context.client_commit (actions path). */
  clientCommit?: boolean;
}): RuntimeActionFacts {
  const kind = input.action?.kind?.trim() || null;
  const safeAttrs = sanitizeActionAttributes(input.action?.attributes);
  const writeClass =
    deriveWriteGovernanceClass({
      operation: input.operation,
      action_kind: kind ?? undefined,
      action_attributes: input.action?.attributes,
    }) ?? null;

  const clientCommit = Boolean(input.clientCommit);

  return {
    category: deriveActionCategory({
      operation: input.operation,
      actionKind: kind,
    }),
    operation: input.operation,
    kind,
    target_id: input.action?.target_id?.trim() || null,
    attributes: safeAttrs,
    write_governance_class: writeClass,
    enforcement_boundary: clientCommit
      ? 'client_commit_required'
      : 'gateway_enforced',
    client_commit: clientCommit,
  };
}
