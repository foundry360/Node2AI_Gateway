import { createHash, createHmac } from 'node:crypto';
import type { AuditEvent } from './service.js';

const GENESIS_PREV = 'GENESIS';

/** SHA-256 hex of the exact response bytes released (or empty if blocked). */
export function hashResponseContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Canonical payload used for the event hash (excludes signature). */
export function canonicalEventPayload(event: {
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
  response_hash: string;
  prev_event_hash: string;
}): string {
  return JSON.stringify({
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
  });
}

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
      // First sealed event after legacy rows may start a new chain.
      prev = e.prev_event_hash;
    } else if (e.prev_event_hash !== prev) {
      return {
        ok: false,
        checked: i - start,
        broken_at_audit_id: e.audit_id,
        reason: 'prev_hash_mismatch',
      };
    }
    const payload = canonicalEventPayload({
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
      response_hash: e.response_hash,
      prev_event_hash: e.prev_event_hash,
    });
    const expectedHash = computeEventHash(payload);
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

export { GENESIS_PREV };
