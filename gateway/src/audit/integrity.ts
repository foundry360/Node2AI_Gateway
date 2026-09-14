import { createHash, createHmac } from 'node:crypto';
import type { AuditEvent } from './service.js';

export const GENESIS_PREV = 'GENESIS';
export const AUDIT_CANONICAL_VERSION_LEGACY = 0;
export const AUDIT_CANONICAL_VERSION_V1 = 1;

/** SHA-256 hex of the exact response bytes released (or empty if blocked). */
export function hashResponseContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function hashInputContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function nonEmpty(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

export type CanonicalEventInput = {
  audit_id: string;
  timestamp: string;
  request_id: string;
  correlation_id: string;
  organization_id?: string;
  application_id?: string;
  user_id?: string;
  operation?: string;
  policy_decision?: string;
  response_decision?: string;
  model_selected?: string;
  provider?: string;
  reason_codes?: string[];
  evaluation_id?: string | null;
  decision_hash?: string | null;
  response_hash: string;
  prev_event_hash: string;
  /** Phase 1 fields — when set, seals as canonical v1 */
  deployment_id?: string | null;
  sequence_number?: number | null;
  audit_canonical_version?: number | null;
  input_hash?: string | null;
};

/**
 * Legacy (v0) canonical payload — preserved byte-for-byte semantics for
 * historical events. evaluation_id / decision_hash included only when present.
 */
export function canonicalEventPayloadLegacy(event: CanonicalEventInput): string {
  const body: Record<string, unknown> = {
    audit_id: event.audit_id,
    timestamp: event.timestamp,
    request_id: event.request_id,
    correlation_id: event.correlation_id,
    organization_id: event.organization_id ?? null,
    application_id: event.application_id ?? null,
    user_id: event.user_id ?? null,
    operation: event.operation ?? null,
    policy_decision: event.policy_decision ?? null,
    response_decision: event.response_decision ?? null,
    model_selected: event.model_selected ?? null,
    provider: event.provider ?? null,
    reason_codes: event.reason_codes ?? [],
    response_hash: event.response_hash,
    prev_event_hash: event.prev_event_hash,
  };
  const evaluationId = nonEmpty(event.evaluation_id ?? undefined);
  const decisionHash = nonEmpty(event.decision_hash ?? undefined);
  if (evaluationId !== undefined) body.evaluation_id = evaluationId;
  if (decisionHash !== undefined) body.decision_hash = decisionHash;
  return JSON.stringify(body);
}

/**
 * Canonical v1 — versioned, deployment-scoped, sequenced.
 * Does not include secrets or raw PHI.
 */
export function canonicalEventPayloadV1(event: CanonicalEventInput): string {
  const body: Record<string, unknown> = {
    audit_canonical_version: AUDIT_CANONICAL_VERSION_V1,
    audit_id: event.audit_id,
    deployment_id: event.deployment_id ?? null,
    sequence_number: event.sequence_number ?? null,
    timestamp: event.timestamp,
    request_id: event.request_id,
    correlation_id: event.correlation_id,
    organization_id: event.organization_id ?? null,
    application_id: event.application_id ?? null,
    user_id: event.user_id ?? null,
    operation: event.operation ?? null,
    policy_decision: event.policy_decision ?? null,
    response_decision: event.response_decision ?? null,
    model_selected: event.model_selected ?? null,
    provider: event.provider ?? null,
    reason_codes: event.reason_codes ?? [],
    evaluation_id: nonEmpty(event.evaluation_id ?? undefined) ?? null,
    decision_hash: nonEmpty(event.decision_hash ?? undefined) ?? null,
    input_hash: nonEmpty(event.input_hash ?? undefined) ?? null,
    response_hash: event.response_hash,
    prev_event_hash: event.prev_event_hash,
  };
  return JSON.stringify(body);
}

/** Pick serializer from event version (default legacy when absent). */
export function canonicalEventPayload(event: CanonicalEventInput): string {
  const version = event.audit_canonical_version ?? AUDIT_CANONICAL_VERSION_LEGACY;
  if (version === AUDIT_CANONICAL_VERSION_V1) {
    return canonicalEventPayloadV1(event);
  }
  if (version !== AUDIT_CANONICAL_VERSION_LEGACY) {
    throw new Error(`UNSUPPORTED_CANONICAL_VERSION:${version}`);
  }
  return canonicalEventPayloadLegacy(event);
}

/** @deprecated Prefer canonicalEventPayload — kept as alias for callers. */
export const canonicalEventPayloadCompat = canonicalEventPayload;

export function computeEventHash(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function signEventHash(eventHash: string, signingKey: string): string {
  return createHmac('sha256', signingKey).update(eventHash, 'utf8').digest('hex');
}

export function verifyEventSignature(
  eventHash: string,
  signature: string,
  signingKey: string,
): boolean {
  const expected = signEventHash(eventHash, signingKey);
  return expected === signature;
}

export type IntegrityVerifyResult = {
  ok: boolean;
  checked: number;
  broken_at_audit_id?: string;
  reason?: string;
};

function toCanonicalInput(e: AuditEvent): CanonicalEventInput {
  return {
    audit_id: e.audit_id,
    timestamp: e.timestamp,
    request_id: e.request_id,
    correlation_id: e.correlation_id,
    organization_id: e.organization_id,
    application_id: e.application_id,
    user_id: e.user_id,
    operation: e.operation,
    policy_decision: e.policy_decision,
    response_decision: e.response_decision,
    model_selected: e.model_selected,
    provider: e.provider,
    reason_codes: e.reason_codes,
    evaluation_id: e.evaluation_id,
    decision_hash: e.decision_hash,
    response_hash: e.response_hash!,
    prev_event_hash: e.prev_event_hash!,
    deployment_id: e.deployment_id,
    sequence_number: e.sequence_number,
    audit_canonical_version: e.audit_canonical_version,
    input_hash: e.input_hash,
  };
}

/**
 * Verify hash chain + HMAC signatures. Detects rewrite / reorder / gap.
 * Legacy events without integrity fields are skipped as a prefix only.
 */
export function verifyAuditChain(
  events: AuditEvent[],
  signingKey: string,
): IntegrityVerifyResult {
  let start = 0;
  while (
    start < events.length &&
    (!events[start]!.response_hash ||
      !events[start]!.event_hash ||
      !events[start]!.integrity_signature ||
      !events[start]!.prev_event_hash)
  ) {
    start += 1;
  }

  let prev: string | null = null;
  for (let i = start; i < events.length; i++) {
    const e = events[i]!;
    if (!e.response_hash || !e.event_hash || !e.integrity_signature || !e.prev_event_hash) {
      return {
        ok: false,
        checked: i - start,
        broken_at_audit_id: e.audit_id,
        reason: 'missing_integrity_fields',
      };
    }
    if (prev === null) {
      prev = e.prev_event_hash;
    } else if (e.prev_event_hash !== prev) {
      return {
        ok: false,
        checked: i - start,
        broken_at_audit_id: e.audit_id,
        reason: 'prev_hash_mismatch',
      };
    }
    let expectedHash: string;
    try {
      expectedHash = computeEventHash(canonicalEventPayload(toCanonicalInput(e)));
    } catch (err) {
      return {
        ok: false,
        checked: i - start,
        broken_at_audit_id: e.audit_id,
        reason:
          err instanceof Error && err.message.startsWith('UNSUPPORTED_CANONICAL_VERSION')
            ? 'UNSUPPORTED_CANONICAL_VERSION'
            : 'event_hash_mismatch',
      };
    }
    if (expectedHash !== e.event_hash) {
      return {
        ok: false,
        checked: i - start,
        broken_at_audit_id: e.audit_id,
        reason: 'event_hash_mismatch',
      };
    }
    if (!verifyEventSignature(e.event_hash, e.integrity_signature, signingKey)) {
      return {
        ok: false,
        checked: i - start,
        broken_at_audit_id: e.audit_id,
        reason: 'signature_invalid',
      };
    }
    prev = e.event_hash;
  }
  return { ok: true, checked: events.length - start };
}
