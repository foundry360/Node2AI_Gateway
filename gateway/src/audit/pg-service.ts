import type { PgQueryable } from '../shared/pg.js';
import type { AuditEvent, AuditService } from './service.js';
import type { AuditCheckpoint } from './checkpoint.js';
import type { CheckpointStore } from './integrity-service.js';

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
         response_hash, prev_event_hash, event_hash, integrity_signature,
         evaluation_id, decision_hash,
         deployment_id, sequence_number, audit_canonical_version, input_hash
       ) VALUES (
         $1, $2::timestamptz, $3, $4, $5,
         $6, $7, $8, $9, $10::jsonb,
         $11, $12, $13, $14,
         $15, $16, $17, $18::jsonb,
         $19::jsonb, $20::jsonb, $21::jsonb,
         $22, $23, $24, $25,
         $26, $27,
         $28, $29, $30, $31
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
        event.evaluation_id ?? null,
        event.decision_hash ?? null,
        event.deployment_id ?? null,
        event.sequence_number ?? null,
        event.audit_canonical_version ?? null,
        event.input_hash ?? null,
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
              response_hash, prev_event_hash, event_hash, integrity_signature,
              evaluation_id, decision_hash,
              deployment_id, sequence_number, audit_canonical_version, input_hash
       FROM audit_events
       ORDER BY timestamp ASC, audit_id ASC`,
    );

    return res.rows.map((row) => mapAuditRow(row));
  }

  async getById(auditId: string): Promise<AuditEvent | null> {
    const res = await this.db.query(
      `SELECT audit_id, timestamp, organization_id, application_id, user_id,
              request_id, correlation_id, operation, data_classification, policy_ids,
              policy_decision, model_selected, provider, input_transformation,
              response_transformation, response_decision, latency_ms, usage,
              reason_codes, errors, metadata,
              response_hash, prev_event_hash, event_hash, integrity_signature,
              evaluation_id, decision_hash,
              deployment_id, sequence_number, audit_canonical_version, input_hash
       FROM audit_events
       WHERE audit_id = $1`,
      [auditId],
    );
    const row = res.rows[0];
    return row ? mapAuditRow(row) : null;
  }
}

function mapAuditRow(row: Record<string, unknown>): AuditEvent {
  return {
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
    latency_ms: typeof row.latency_ms === 'number' ? row.latency_ms : undefined,
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
    evaluation_id: row.evaluation_id ? String(row.evaluation_id) : null,
    decision_hash: row.decision_hash ? String(row.decision_hash) : null,
    deployment_id: row.deployment_id ? String(row.deployment_id) : null,
    sequence_number:
      row.sequence_number != null ? Number(row.sequence_number) : null,
    audit_canonical_version:
      row.audit_canonical_version != null
        ? Number(row.audit_canonical_version)
        : null,
    input_hash: row.input_hash ? String(row.input_hash) : null,
  };
}

export class PostgresCheckpointStore implements CheckpointStore {
  constructor(private readonly db: PgQueryable) {}

  async list(deploymentId?: string): Promise<AuditCheckpoint[]> {
    const res = deploymentId
      ? await this.db.query(
          `SELECT checkpoint_id, deployment_id, sequence_start, sequence_end,
                  event_count, root_hash, created_at, key_id, signature, canonical_version
           FROM audit_checkpoints
           WHERE deployment_id = $1
           ORDER BY created_at ASC`,
          [deploymentId],
        )
      : await this.db.query(
          `SELECT checkpoint_id, deployment_id, sequence_start, sequence_end,
                  event_count, root_hash, created_at, key_id, signature, canonical_version
           FROM audit_checkpoints
           ORDER BY created_at ASC`,
        );
    return res.rows.map((row) => ({
      checkpoint_id: String(row.checkpoint_id),
      deployment_id: String(row.deployment_id),
      sequence_start: Number(row.sequence_start),
      sequence_end: Number(row.sequence_end),
      event_count: Number(row.event_count),
      root_hash: String(row.root_hash),
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      key_id: String(row.key_id),
      signature: String(row.signature),
      canonical_version: Number(row.canonical_version),
    }));
  }

  async append(checkpoint: AuditCheckpoint): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_checkpoints (
         checkpoint_id, deployment_id, sequence_start, sequence_end,
         event_count, root_hash, created_at, key_id, signature, canonical_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10)`,
      [
        checkpoint.checkpoint_id,
        checkpoint.deployment_id,
        checkpoint.sequence_start,
        checkpoint.sequence_end,
        checkpoint.event_count,
        checkpoint.root_hash,
        checkpoint.created_at,
        checkpoint.key_id,
        checkpoint.signature,
        checkpoint.canonical_version,
      ],
    );
  }

  async withLock<T>(deploymentId: string, fn: () => Promise<T>): Promise<T> {
    // Session-level advisory lock keyed by deployment (hash text → bigint)
    const client = this.db as PgQueryable & {
      connect?: () => Promise<{
        query: PgQueryable['query'];
        release: () => void;
      }>;
    };
    if (typeof client.connect === 'function') {
      const c = await client.connect();
      try {
        await c.query(
          `SELECT pg_advisory_lock(hashtext($1::text))`,
          [deploymentId],
        );
        try {
          return await fn();
        } finally {
          await c.query(`SELECT pg_advisory_unlock(hashtext($1::text))`, [
            deploymentId,
          ]);
        }
      } finally {
        c.release();
      }
    }
    // Fallback: non-pooled queryable — best-effort without lock
    return fn();
  }
}
