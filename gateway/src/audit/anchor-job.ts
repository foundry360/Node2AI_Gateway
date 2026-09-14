import { randomUUID } from 'node:crypto';
import type { PgQueryable } from '../shared/pg.js';
import type { EvidenceAnchorPayload } from './anchor.js';

export type AnchorJobStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'ANCHORED'
  | 'RETRY'
  | 'FAILED';

export type AnchorJob = {
  job_id: string;
  anchor_id: string;
  deployment_id: string;
  checkpoint_id: string;
  status: AnchorJobStatus;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
  payload_json: EvidenceAnchorPayload;
};

export function newAnchorJobId(): string {
  return `aaj_${randomUUID().replace(/-/g, '')}`;
}

export function computeBackoffMs(attemptCount: number, baseMs = 5_000): number {
  const capped = Math.min(attemptCount, 10);
  return Math.min(baseMs * 2 ** Math.max(0, capped - 1), 3_600_000);
}

export interface AnchorJobRepository {
  enqueue(job: AnchorJob): Promise<void>;
  /** Claim one due job (PENDING/RETRY). Returns null if none. */
  claimNext(now?: Date): Promise<AnchorJob | null>;
  update(job: AnchorJob): Promise<void>;
  getByCheckpoint(checkpointId: string): Promise<AnchorJob | null>;
  getById(jobId: string): Promise<AnchorJob | null>;
  list(deploymentId?: string): Promise<AnchorJob[]>;
  /** Reset a FAILED/RETRY job for immediate operator retry. */
  scheduleRetry(jobId: string, now?: Date): Promise<AnchorJob | null>;
}

function mapJob(row: Record<string, unknown>): AnchorJob {
  return {
    job_id: String(row.job_id),
    anchor_id: String(row.anchor_id),
    deployment_id: String(row.deployment_id),
    checkpoint_id: String(row.checkpoint_id),
    status: String(row.status) as AnchorJobStatus,
    attempt_count: Number(row.attempt_count),
    max_attempts: Number(row.max_attempts),
    next_attempt_at:
      row.next_attempt_at instanceof Date
        ? row.next_attempt_at.toISOString()
        : String(row.next_attempt_at),
    last_attempt_at: row.last_attempt_at
      ? row.last_attempt_at instanceof Date
        ? row.last_attempt_at.toISOString()
        : String(row.last_attempt_at)
      : null,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    completed_at: row.completed_at
      ? row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : String(row.completed_at)
      : null,
    last_error: row.last_error ? String(row.last_error) : null,
    payload_json: row.payload_json as EvidenceAnchorPayload,
  };
}

export class InMemoryAnchorJobRepository implements AnchorJobRepository {
  private readonly jobs = new Map<string, AnchorJob>();

  async enqueue(job: AnchorJob): Promise<void> {
    const existing = [...this.jobs.values()].find(
      (j) => j.checkpoint_id === job.checkpoint_id,
    );
    if (existing) {
      if (existing.status === 'ANCHORED') return;
      // Idempotent re-enqueue of unfinished work
      return;
    }
    this.jobs.set(job.job_id, { ...job });
  }

  async claimNext(now = new Date()): Promise<AnchorJob | null> {
    const due = [...this.jobs.values()]
      .filter(
        (j) =>
          (j.status === 'PENDING' || j.status === 'RETRY') &&
          new Date(j.next_attempt_at).getTime() <= now.getTime(),
      )
      .sort(
        (a, b) =>
          new Date(a.next_attempt_at).getTime() -
          new Date(b.next_attempt_at).getTime(),
      );
    const job = due[0];
    if (!job) return null;
    const claimed: AnchorJob = {
      ...job,
      status: 'IN_PROGRESS',
      last_attempt_at: now.toISOString(),
      attempt_count: job.attempt_count + 1,
    };
    this.jobs.set(claimed.job_id, claimed);
    return claimed;
  }

  async update(job: AnchorJob): Promise<void> {
    this.jobs.set(job.job_id, { ...job });
  }

  async getByCheckpoint(checkpointId: string): Promise<AnchorJob | null> {
    return (
      [...this.jobs.values()].find((j) => j.checkpoint_id === checkpointId) ??
      null
    );
  }

  async getById(jobId: string): Promise<AnchorJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async list(deploymentId?: string): Promise<AnchorJob[]> {
    const all = [...this.jobs.values()];
    return deploymentId
      ? all.filter((j) => j.deployment_id === deploymentId)
      : all;
  }

  async scheduleRetry(jobId: string, now = new Date()): Promise<AnchorJob | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (job.status === 'ANCHORED') return job;
    const next: AnchorJob = {
      ...job,
      status: 'RETRY',
      next_attempt_at: now.toISOString(),
      last_error: job.last_error,
      completed_at: null,
    };
    this.jobs.set(jobId, next);
    return next;
  }
}

export class PostgresAnchorJobRepository implements AnchorJobRepository {
  constructor(private readonly db: PgQueryable) {}

  async enqueue(job: AnchorJob): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_anchor_jobs (
         job_id, anchor_id, deployment_id, checkpoint_id, status,
         attempt_count, max_attempts, next_attempt_at, last_attempt_at,
         last_error, created_at, completed_at, payload_json
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,
         $10,$11::timestamptz,$12::timestamptz,$13::jsonb
       )
       ON CONFLICT (checkpoint_id) DO NOTHING`,
      [
        job.job_id,
        job.anchor_id,
        job.deployment_id,
        job.checkpoint_id,
        job.status,
        job.attempt_count,
        job.max_attempts,
        job.next_attempt_at,
        job.last_attempt_at,
        job.last_error,
        job.created_at,
        job.completed_at,
        JSON.stringify(job.payload_json),
      ],
    );
  }

  async claimNext(now = new Date()): Promise<AnchorJob | null> {
    const res = await this.db.query(
      `WITH cte AS (
         SELECT job_id FROM audit_anchor_jobs
         WHERE status IN ('PENDING', 'RETRY')
           AND next_attempt_at <= $1::timestamptz
         ORDER BY next_attempt_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE audit_anchor_jobs j
       SET status = 'IN_PROGRESS',
           attempt_count = j.attempt_count + 1,
           last_attempt_at = $1::timestamptz
       FROM cte
       WHERE j.job_id = cte.job_id
       RETURNING j.*`,
      [now.toISOString()],
    );
    return res.rows[0] ? mapJob(res.rows[0] as Record<string, unknown>) : null;
  }

  async update(job: AnchorJob): Promise<void> {
    await this.db.query(
      `UPDATE audit_anchor_jobs SET
         status = $2,
         attempt_count = $3,
         max_attempts = $4,
         next_attempt_at = $5::timestamptz,
         last_attempt_at = $6::timestamptz,
         last_error = $7,
         completed_at = $8::timestamptz,
         payload_json = $9::jsonb
       WHERE job_id = $1`,
      [
        job.job_id,
        job.status,
        job.attempt_count,
        job.max_attempts,
        job.next_attempt_at,
        job.last_attempt_at,
        job.last_error,
        job.completed_at,
        JSON.stringify(job.payload_json),
      ],
    );
  }

  async getByCheckpoint(checkpointId: string): Promise<AnchorJob | null> {
    const res = await this.db.query(
      `SELECT * FROM audit_anchor_jobs WHERE checkpoint_id = $1`,
      [checkpointId],
    );
    return res.rows[0] ? mapJob(res.rows[0] as Record<string, unknown>) : null;
  }

  async getById(jobId: string): Promise<AnchorJob | null> {
    const res = await this.db.query(
      `SELECT * FROM audit_anchor_jobs WHERE job_id = $1`,
      [jobId],
    );
    return res.rows[0] ? mapJob(res.rows[0] as Record<string, unknown>) : null;
  }

  async list(deploymentId?: string): Promise<AnchorJob[]> {
    const res = deploymentId
      ? await this.db.query(
          `SELECT * FROM audit_anchor_jobs WHERE deployment_id = $1 ORDER BY created_at ASC`,
          [deploymentId],
        )
      : await this.db.query(
          `SELECT * FROM audit_anchor_jobs ORDER BY created_at ASC`,
        );
    return res.rows.map((r) => mapJob(r as Record<string, unknown>));
  }

  async scheduleRetry(jobId: string, now = new Date()): Promise<AnchorJob | null> {
    const res = await this.db.query(
      `UPDATE audit_anchor_jobs SET
         status = CASE WHEN status = 'ANCHORED' THEN status ELSE 'RETRY' END,
         next_attempt_at = $2::timestamptz,
         completed_at = CASE WHEN status = 'ANCHORED' THEN completed_at ELSE NULL END
       WHERE job_id = $1
       RETURNING *`,
      [jobId, now.toISOString()],
    );
    return res.rows[0] ? mapJob(res.rows[0] as Record<string, unknown>) : null;
  }
}
