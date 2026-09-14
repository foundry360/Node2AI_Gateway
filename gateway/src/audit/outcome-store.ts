/**
 * Idempotency / atomic claim index for client Outcome receipts.
 * Cryptographic evidence remains in audit_events; this store is a projection.
 *
 * Phase 4.1: claim is scoped by (deployment_id, execution_id) and never overwritten.
 */

import type { PgQueryable } from '../shared/pg.js';
import type { ActionOutcomeRecord, ClientOutcomeStatus } from './outcome.js';

export interface ActionOutcomeStore {
  getByExecutionId(
    deploymentId: string,
    executionId: string,
  ): Promise<ActionOutcomeRecord | null>;
  getLatestByEvaluationId(
    deploymentId: string,
    evaluationId: string,
  ): Promise<ActionOutcomeRecord | null>;
  listByEvaluationId(
    deploymentId: string,
    evaluationId: string,
  ): Promise<ActionOutcomeRecord[]>;
  /**
   * Atomically claim (deployment_id, execution_id).
   * Returns created:true only for the winning claim. Never overwrites.
   */
  claimAuthoritative(
    record: ActionOutcomeRecord,
  ): Promise<{ created: boolean; record: ActionOutcomeRecord }>;
}

function claimKey(deploymentId: string, executionId: string): string {
  return `${deploymentId}\0${executionId}`;
}

export class InMemoryActionOutcomeStore implements ActionOutcomeStore {
  private readonly byClaim = new Map<string, ActionOutcomeRecord>();
  private readonly byEvaluation = new Map<string, ActionOutcomeRecord[]>();

  async getByExecutionId(
    deploymentId: string,
    executionId: string,
  ): Promise<ActionOutcomeRecord | null> {
    return this.byClaim.get(claimKey(deploymentId, executionId)) ?? null;
  }

  async getLatestByEvaluationId(
    deploymentId: string,
    evaluationId: string,
  ): Promise<ActionOutcomeRecord | null> {
    const rows = this.byEvaluation.get(claimKey(deploymentId, evaluationId)) ?? [];
    if (rows.length === 0) return null;
    return rows[rows.length - 1] ?? null;
  }

  async listByEvaluationId(
    deploymentId: string,
    evaluationId: string,
  ): Promise<ActionOutcomeRecord[]> {
    return [
      ...(this.byEvaluation.get(claimKey(deploymentId, evaluationId)) ?? []),
    ];
  }

  /**
   * Synchronous check+set (no await) so concurrent Node callers cannot double-claim
   * within a single process. Multi-process safety is provided by Postgres.
   */
  async claimAuthoritative(
    record: ActionOutcomeRecord,
  ): Promise<{ created: boolean; record: ActionOutcomeRecord }> {
    const key = claimKey(record.deployment_id, record.execution_id);
    const existing = this.byClaim.get(key);
    if (existing) {
      return { created: false, record: existing };
    }
    this.byClaim.set(key, record);
    const evalKey = claimKey(record.deployment_id, record.evaluation_id);
    const list = this.byEvaluation.get(evalKey) ?? [];
    list.push(record);
    this.byEvaluation.set(evalKey, list);
    return { created: true, record };
  }
}

function mapRow(row: Record<string, unknown>): ActionOutcomeRecord {
  return {
    deployment_id: String(row.deployment_id),
    execution_id: String(row.execution_id),
    evaluation_id: String(row.evaluation_id),
    application_id: String(row.application_id),
    outcome: String(row.outcome) as ClientOutcomeStatus,
    receipt_hash: String(row.receipt_hash),
    audit_event_id: String(row.audit_event_id),
    request_id: row.request_id != null ? String(row.request_id) : null,
    reported_at: String(row.reported_at),
    user_id: row.user_id != null ? String(row.user_id) : null,
    agent_id: row.agent_id != null ? String(row.agent_id) : null,
    tool_id: row.tool_id != null ? String(row.tool_id) : null,
    operation: row.operation != null ? String(row.operation) : null,
    purpose: row.purpose != null ? String(row.purpose) : null,
    authorization_context:
      row.authorization_context != null
        ? String(row.authorization_context)
        : null,
    action_kind: row.action_kind != null ? String(row.action_kind) : null,
    target_id: row.target_id != null ? String(row.target_id) : null,
    action_field: row.action_field != null ? String(row.action_field) : null,
    evidence_class: 'client_reported',
  };
}

export class PostgresActionOutcomeStore implements ActionOutcomeStore {
  constructor(private readonly db: PgQueryable) {}

  async getByExecutionId(
    deploymentId: string,
    executionId: string,
  ): Promise<ActionOutcomeRecord | null> {
    const res = await this.db.query(
      `SELECT * FROM action_outcomes
       WHERE deployment_id = $1 AND execution_id = $2`,
      [deploymentId, executionId],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async getLatestByEvaluationId(
    deploymentId: string,
    evaluationId: string,
  ): Promise<ActionOutcomeRecord | null> {
    const res = await this.db.query(
      `SELECT * FROM action_outcomes
       WHERE deployment_id = $1 AND evaluation_id = $2
       ORDER BY reported_at DESC
       LIMIT 1`,
      [deploymentId, evaluationId],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  async listByEvaluationId(
    deploymentId: string,
    evaluationId: string,
  ): Promise<ActionOutcomeRecord[]> {
    const res = await this.db.query(
      `SELECT * FROM action_outcomes
       WHERE deployment_id = $1 AND evaluation_id = $2
       ORDER BY reported_at ASC`,
      [deploymentId, evaluationId],
    );
    return (res.rows as Record<string, unknown>[]).map(mapRow);
  }

  async claimAuthoritative(
    record: ActionOutcomeRecord,
  ): Promise<{ created: boolean; record: ActionOutcomeRecord }> {
    const res = await this.db.query(
      `INSERT INTO action_outcomes (
         deployment_id, execution_id, evaluation_id, application_id, outcome,
         receipt_hash, audit_event_id, request_id, reported_at, user_id,
         agent_id, tool_id, operation, purpose, authorization_context,
         action_kind, target_id, action_field
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
       )
       ON CONFLICT (deployment_id, execution_id) DO NOTHING
       RETURNING *`,
      [
        record.deployment_id,
        record.execution_id,
        record.evaluation_id,
        record.application_id,
        record.outcome,
        record.receipt_hash,
        record.audit_event_id,
        record.request_id ?? null,
        record.reported_at,
        record.user_id ?? null,
        record.agent_id ?? null,
        record.tool_id ?? null,
        record.operation ?? null,
        record.purpose ?? null,
        record.authorization_context ?? null,
        record.action_kind ?? null,
        record.target_id ?? null,
        record.action_field ?? null,
      ],
    );
    const inserted = res.rows[0] as Record<string, unknown> | undefined;
    if (inserted) {
      return { created: true, record: mapRow(inserted) };
    }
    const existing = await this.getByExecutionId(
      record.deployment_id,
      record.execution_id,
    );
    if (!existing) {
      throw new Error('action_outcomes conflict without existing row');
    }
    return { created: false, record: existing };
  }
}
