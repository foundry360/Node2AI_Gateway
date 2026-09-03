import type { PgQueryable } from '../shared/pg.js';
import type { AuditEvent, AuditService } from './service.js';

export class PostgresAuditService implements AuditService {
  forceFailure = false;

  constructor(private readonly db: PgQueryable) {}

  async record(event: AuditEvent): Promise<AuditEvent> {
    if (this.forceFailure) {
      throw new Error('Audit write failed');
    }
    await this.db.query(
      `INSERT INTO audit_events (
         audit_id, timestamp, organization_id, application_id, user_id,
         request_id, correlation_id, operation, data_classification, policy_ids,
         policy_decision, model_selected, provider, input_transformation,
         response_transformation, response_decision, latency_ms, usage,
         reason_codes, errors, metadata,
         response_hash, prev_event_hash, event_hash, integrity_signature
       ) VALUES (
         $1, $2::timestamptz, $3, $4, $5,
         $6, $7, $8, $9, $10::jsonb,
         $11, $12, $13, $14,
         $15, $16, $17, $18::jsonb,
         $19::jsonb, $20::jsonb, $21::jsonb,
         $22, $23, $24, $25
       )`,
      [
        event.audit_id,
        event.timestamp,
        event.organization_id ?? null,
        event.application_id ?? null,
        event.user_id ?? null,
        event.request_id,
        event.correlation_id,
        event.operation ?? null,
        event.data_classification ?? null,
        JSON.stringify(event.policy_ids ?? []),
        event.policy_decision ?? null,
        event.model_selected ?? null,
        event.provider ?? null,
        event.input_transformation ?? null,
        event.response_transformation ?? null,
        event.response_decision ?? null,
        event.latency_ms ?? null,
        JSON.stringify(event.usage ?? {}),
        JSON.stringify(event.reason_codes ?? []),
        JSON.stringify(event.errors ?? null),
        JSON.stringify(event.metadata ?? {}),
        event.response_hash ?? null,
        event.prev_event_hash ?? null,
        event.event_hash ?? null,
        event.integrity_signature ?? null,
      ],
    );
    return event;
  }

  async list(): Promise<AuditEvent[]> {
    const res = await this.db.query(
      `SELECT audit_id, timestamp, organization_id, application_id, user_id,
              request_id, correlation_id, operation, data_classification, policy_ids,
              policy_decision, model_selected, provider, input_transformation,
              response_transformation, response_decision, latency_ms, usage,
              reason_codes, errors, metadata,
              response_hash, prev_event_hash, event_hash, integrity_signature
       FROM audit_events
       ORDER BY timestamp ASC, audit_id ASC`,
    );

    return res.rows.map((row) => ({
      audit_id: String(row.audit_id),
      timestamp:
        row.timestamp instanceof Date
          ? row.timestamp.toISOString()
          : String(row.timestamp),
      organization_id: row.organization_id ? String(row.organization_id) : undefined,
      application_id: row.application_id ? String(row.application_id) : undefined,
      user_id: row.user_id ? String(row.user_id) : undefined,
      request_id: String(row.request_id),
      correlation_id: String(row.correlation_id),
      operation: row.operation ? String(row.operation) : undefined,
      data_classification: row.data_classification
        ? String(row.data_classification)
        : undefined,
      policy_ids: Array.isArray(row.policy_ids)
        ? (row.policy_ids as string[])
        : undefined,
      policy_decision: row.policy_decision ? String(row.policy_decision) : undefined,
      model_selected: row.model_selected ? String(row.model_selected) : undefined,
      provider: row.provider ? String(row.provider) : undefined,
      input_transformation: row.input_transformation
        ? String(row.input_transformation)
        : undefined,
      response_transformation: row.response_transformation
        ? String(row.response_transformation)
        : undefined,
      response_decision: row.response_decision
        ? String(row.response_decision)
        : undefined,
      latency_ms:
        typeof row.latency_ms === 'number' ? row.latency_ms : undefined,
      usage: (row.usage as Record<string, number>) ?? undefined,
      reason_codes: Array.isArray(row.reason_codes)
        ? (row.reason_codes as string[])
        : undefined,
      errors: row.errors ?? undefined,
      metadata: (row.metadata as Record<string, unknown>) ?? undefined,
      response_hash: row.response_hash ? String(row.response_hash) : undefined,
      prev_event_hash: row.prev_event_hash ? String(row.prev_event_hash) : undefined,
      event_hash: row.event_hash ? String(row.event_hash) : undefined,
      integrity_signature: row.integrity_signature
        ? String(row.integrity_signature)
        : undefined,
    }));
  }
}
