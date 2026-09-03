import type { AuditEvent, AuditService } from './service.js';
import {
  GENESIS_PREV,
  canonicalEventPayload,
  computeEventHash,
  hashResponseContent,
  signEventHash,
  verifyAuditChain,
  type IntegrityVerifyResult,
} from './integrity.js';

export type { IntegrityVerifyResult };

/**
 * Wraps an audit store to hash released responses and maintain a signed hash chain.
 * Response body plaintext is not persisted — only response_hash.
 */
export class IntegrityAuditService implements AuditService {
  private lastEventHash = GENESIS_PREV;

  constructor(
    private readonly inner: AuditService,
    private readonly signingKey: string,
  ) {}

  /** Test hook — forwarded to inner store when present. */
  get forceFailure(): boolean {
    return Boolean((this.inner as { forceFailure?: boolean }).forceFailure);
  }

  set forceFailure(value: boolean) {
    (this.inner as { forceFailure?: boolean }).forceFailure = value;
  }

  /** Call after loading historical events so the chain continues correctly. */
  async bootstrapFromStore(): Promise<void> {
    const events = await this.inner.list();
    if (events.length === 0) {
      this.lastEventHash = GENESIS_PREV;
      return;
    }
    const last = events[events.length - 1]!;
    this.lastEventHash = last.event_hash ?? GENESIS_PREV;
  }

  async record(event: AuditEvent): Promise<AuditEvent> {
    const responseContent =
      typeof event.metadata?.__response_content === 'string'
        ? event.metadata.__response_content
        : '';
    const metadata = { ...(event.metadata ?? {}) };
    delete metadata.__response_content;

    const response_hash =
      event.response_hash ?? hashResponseContent(responseContent);
    const prev_event_hash = this.lastEventHash;
    const payload = canonicalEventPayload({
      audit_id: event.audit_id,
      timestamp: event.timestamp,
      request_id: event.request_id,
      correlation_id: event.correlation_id,
      organization_id: event.organization_id,
      application_id: event.application_id,
      user_id: event.user_id,
      operation: event.operation,
      policy_decision: event.policy_decision,
      response_decision: event.response_decision,
      model_selected: event.model_selected,
      provider: event.provider,
      reason_codes: event.reason_codes,
      response_hash,
      prev_event_hash,
    });
    const event_hash = computeEventHash(payload);
    const integrity_signature = signEventHash(event_hash, this.signingKey);

    const sealed: AuditEvent = {
      ...event,
      metadata,
      response_hash,
      prev_event_hash,
      event_hash,
      integrity_signature,
    };

    await this.inner.record(sealed);
    this.lastEventHash = event_hash;
    return sealed;
  }

  async list(): Promise<AuditEvent[]> {
    return this.inner.list();
  }

  async verifyIntegrity(): Promise<IntegrityVerifyResult> {
    const events = await this.inner.list();
    return verifyAuditChain(events, this.signingKey);
  }
}

export { hashResponseContent };
