import type { AuditCheckpoint, CheckpointVerifier } from './checkpoint.js';
import type { JWK } from 'jose';
import {
  buildAnchorPayload,
  hashAnchorPayload,
  newAnchorId,
  newAnchorRecordId,
  verifyCheckpointAgainstAnchor,
  verifyIndependentAnchor,
  type EvidenceAnchorPayload,
  type EvidenceAnchorRecord,
  type AnchorType,
} from './anchor.js';
import type { EvidenceAnchorStore } from './anchor.js';
import type { EvidenceAnchorRepository } from './anchor-repository.js';
import {
  computeBackoffMs,
  newAnchorJobId,
  type AnchorJob,
  type AnchorJobRepository,
} from './anchor-job.js';

export type AnchorServiceResult = {
  ok: boolean;
  anchor_id: string;
  status: EvidenceAnchorRecord['anchor_status'] | 'RETRYING';
  failure_code?: string;
  uri?: string;
  record?: EvidenceAnchorRecord;
  job_id?: string;
  compare?: Awaited<ReturnType<typeof verifyCheckpointAgainstAnchor>>;
};

export type ExternalEvidenceStatus =
  | 'NOT_CONFIGURED'
  | 'PENDING'
  | 'RETRYING'
  | 'ANCHORED'
  | 'VERIFIED'
  | 'FAILED';

function baseRecord(
  cp: AuditCheckpoint,
  payload: EvidenceAnchorPayload,
  anchorId: string,
  status: EvidenceAnchorRecord['anchor_status'],
  type: AnchorType,
  extras: Partial<EvidenceAnchorRecord> = {},
): EvidenceAnchorRecord {
  const now = new Date().toISOString();
  return {
    anchor_record_id: newAnchorRecordId(),
    anchor_id: anchorId,
    deployment_id: cp.deployment_id,
    checkpoint_id: cp.checkpoint_id,
    sequence_start: cp.sequence_start,
    sequence_end: cp.sequence_end,
    event_count: cp.event_count,
    root_hash: cp.root_hash,
    checkpoint_signature: cp.signature,
    checkpoint_key_id: cp.key_id,
    canonical_version: cp.canonical_version,
    recorded_at: now,
    anchored_at: null,
    anchor_type: type,
    anchor_uri: null,
    anchor_hash: null,
    anchor_status: status,
    failure_code: null,
    payload_json: payload,
    ...extras,
  };
}

export type EvidenceAnchoringServiceOptions = {
  /** When true and jobs repo is set, enqueue instead of synchronous put. Default true. */
  async?: boolean;
  maxAttempts?: number;
  baseBackoffMs?: number;
};

/**
 * Anchors signed checkpoints to an external store.
 * Never throws into the AI path — failures become FAILED/RETRY records.
 */
export class EvidenceAnchoringService {
  private readonly asyncMode: boolean;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;

  constructor(
    private readonly store: EvidenceAnchorStore | null,
    private readonly repo: EvidenceAnchorRepository,
    private readonly publicJwks: Map<string, JWK> | CheckpointVerifier | null,
    private readonly jobs: AnchorJobRepository | null = null,
    opts: EvidenceAnchoringServiceOptions = {},
  ) {
    this.asyncMode = Boolean(this.jobs) && opts.async !== false;
    this.maxAttempts = opts.maxAttempts ?? 8;
    this.baseBackoffMs = opts.baseBackoffMs ?? 5_000;
  }

  get configured(): boolean {
    return Boolean(this.store);
  }

  get provider(): AnchorType | 'NONE' {
    return this.store?.provider ?? 'NONE';
  }

  get usesDurableQueue(): boolean {
    return this.asyncMode;
  }

  async list(deploymentId?: string): Promise<EvidenceAnchorRecord[]> {
    return this.repo.list(deploymentId);
  }

  async listJobs(deploymentId?: string): Promise<AnchorJob[]> {
    return this.jobs ? this.jobs.list(deploymentId) : [];
  }

  async latestStatus(deploymentId: string): Promise<{
    status: ExternalEvidenceStatus;
    last?: EvidenceAnchorRecord | null;
    job?: AnchorJob | null;
  }> {
    if (!this.store) return { status: 'NOT_CONFIGURED', last: null, job: null };
    const rows = await this.repo.list(deploymentId);
    const last = rows.length ? rows[rows.length - 1]! : null;
    const jobs = this.jobs ? await this.jobs.list(deploymentId) : [];
    const openJob = [...jobs]
      .reverse()
      .find((j) => j.status !== 'ANCHORED') ?? null;
    const success = [...rows]
      .reverse()
      .find(
        (r) => r.anchor_status === 'ANCHORED' || r.anchor_status === 'VERIFIED',
      );

    if (success) {
      return {
        status: success.anchor_status as 'ANCHORED' | 'VERIFIED',
        last: success,
        job: jobs.find((j) => j.checkpoint_id === success.checkpoint_id) ?? null,
      };
    }

    if (openJob) {
      if (openJob.status === 'RETRY' || openJob.status === 'IN_PROGRESS') {
        return { status: 'RETRYING', last, job: openJob };
      }
      if (openJob.status === 'FAILED') {
        return { status: 'FAILED', last, job: openJob };
      }
      return { status: 'PENDING', last, job: openJob };
    }

    if (last?.anchor_status === 'FAILED') {
      return { status: 'FAILED', last, job: null };
    }
    if (last?.anchor_status === 'PENDING') {
      return { status: 'PENDING', last, job: null };
    }
    return { status: 'PENDING', last: null, job: null };
  }

  /**
   * Enqueue or synchronously anchor a checkpoint.
   * Safe to call after governance; must not affect PDP.
   */
  async anchorCheckpoint(cp: AuditCheckpoint): Promise<AnchorServiceResult> {
    const payload = buildAnchorPayload(cp);
    const type = this.store?.provider ?? 'OFFLINE';

    const prior = await this.repo.latestByCheckpoint(cp.checkpoint_id);
    if (prior?.anchor_status === 'ANCHORED' || prior?.anchor_status === 'VERIFIED') {
      return {
        ok: true,
        anchor_id: prior.anchor_id,
        status: prior.anchor_status,
        uri: prior.anchor_uri ?? undefined,
        record: prior,
      };
    }

    if (this.jobs) {
      const existingJob = await this.jobs.getByCheckpoint(cp.checkpoint_id);
      if (existingJob?.status === 'ANCHORED') {
        return {
          ok: true,
          anchor_id: existingJob.anchor_id,
          status: 'ANCHORED',
          job_id: existingJob.job_id,
        };
      }
      if (
        existingJob &&
        (existingJob.status === 'PENDING' ||
          existingJob.status === 'RETRY' ||
          existingJob.status === 'IN_PROGRESS')
      ) {
        return {
          ok: true,
          anchor_id: existingJob.anchor_id,
          status: existingJob.status === 'PENDING' ? 'PENDING' : 'RETRYING',
          job_id: existingJob.job_id,
        };
      }
    }

    const anchorId = prior?.anchor_id ?? newAnchorId();
    const pending = baseRecord(cp, payload, anchorId, 'PENDING', type);
    await this.repo.append(pending);

    if (!this.store) {
      const failed = baseRecord(cp, payload, anchorId, 'FAILED', 'OFFLINE', {
        failure_code: 'NOT_CONFIGURED',
      });
      await this.repo.append(failed);
      return {
        ok: false,
        anchor_id: anchorId,
        status: 'FAILED',
        failure_code: 'NOT_CONFIGURED',
        record: failed,
      };
    }

    if (this.asyncMode && this.jobs) {
      const now = new Date().toISOString();
      const job: AnchorJob = {
        job_id: newAnchorJobId(),
        anchor_id: anchorId,
        deployment_id: cp.deployment_id,
        checkpoint_id: cp.checkpoint_id,
        status: 'PENDING',
        attempt_count: 0,
        max_attempts: this.maxAttempts,
        next_attempt_at: now,
        last_attempt_at: null,
        last_error: null,
        created_at: now,
        completed_at: null,
        payload_json: payload,
      };
      await this.jobs.enqueue(job);
      return {
        ok: true,
        anchor_id: anchorId,
        status: 'PENDING',
        job_id: job.job_id,
        record: pending,
      };
    }

    return this.executePut(cp, anchorId, payload);
  }

  /** Process one durable job. Returns false if none due. */
  async processNextJob(): Promise<boolean> {
    if (!this.jobs || !this.store) return false;
    const job = await this.jobs.claimNext();
    if (!job) return false;
    await this.executeJob(job);
    return true;
  }

  async retryJob(jobId: string): Promise<AnchorServiceResult> {
    if (!this.jobs) {
      return {
        ok: false,
        anchor_id: '',
        status: 'FAILED',
        failure_code: 'NOT_CONFIGURED',
      };
    }
    const scheduled = await this.jobs.scheduleRetry(jobId);
    if (!scheduled) {
      return {
        ok: false,
        anchor_id: '',
        status: 'FAILED',
        failure_code: 'JOB_NOT_FOUND',
      };
    }
    // Process immediately for operator UX when possible
    await this.processNextJob();
    const latest = await this.jobs.getById(jobId);
    return {
      ok: latest?.status === 'ANCHORED',
      anchor_id: scheduled.anchor_id,
      status:
        latest?.status === 'ANCHORED'
          ? 'ANCHORED'
          : latest?.status === 'FAILED'
            ? 'FAILED'
            : 'RETRYING',
      job_id: jobId,
      failure_code: latest?.last_error ?? undefined,
    };
  }

  async retryCheckpoint(checkpointId: string): Promise<AnchorServiceResult> {
    if (!this.jobs) {
      return {
        ok: false,
        anchor_id: '',
        status: 'FAILED',
        failure_code: 'NOT_CONFIGURED',
      };
    }
    const job = await this.jobs.getByCheckpoint(checkpointId);
    if (!job) {
      return {
        ok: false,
        anchor_id: '',
        status: 'FAILED',
        failure_code: 'JOB_NOT_FOUND',
      };
    }
    return this.retryJob(job.job_id);
  }

  private async executeJob(job: AnchorJob): Promise<void> {
    if (!this.store || !this.jobs) return;
    const payload = job.payload_json;
    const cp: AuditCheckpoint = {
      checkpoint_id: payload.checkpoint_id,
      deployment_id: payload.deployment_id,
      sequence_start: payload.sequence_start,
      sequence_end: payload.sequence_end,
      event_count: payload.event_count,
      root_hash: payload.root_hash,
      created_at: payload.created_at,
      key_id: payload.key_id,
      signature: payload.checkpoint_signature,
      canonical_version: payload.canonical_version,
    };

    const prior = await this.repo.latestByCheckpoint(cp.checkpoint_id);
    if (prior?.anchor_status === 'ANCHORED' || prior?.anchor_status === 'VERIFIED') {
      const now = new Date().toISOString();
      await this.jobs.update({
        ...job,
        status: 'ANCHORED',
        last_error: null,
        completed_at: now,
        next_attempt_at: now,
      });
      return;
    }

    const path = this.store.objectPath(
      cp.deployment_id,
      cp.sequence_end,
      cp.checkpoint_id,
    );
    const put = await this.store.putAnchor(path, payload);
    const now = new Date();

    if (put.ok) {
      const result = await this.recordSuccessfulPut(
        cp,
        job.anchor_id,
        payload,
        put.uri,
        put.hash,
      );
      await this.jobs.update({
        ...job,
        status: 'ANCHORED',
        last_error: null,
        completed_at: now.toISOString(),
        next_attempt_at: now.toISOString(),
      });
      void result;
      return;
    }

    const code = put.code;
    if (code === 'ANCHOR_CONFLICT' || job.attempt_count >= job.max_attempts) {
      const failed = baseRecord(
        cp,
        payload,
        job.anchor_id,
        'FAILED',
        this.store.provider,
        { failure_code: code },
      );
      await this.repo.append(failed);
      await this.jobs.update({
        ...job,
        status: 'FAILED',
        last_error: code,
        completed_at: now.toISOString(),
        next_attempt_at: now.toISOString(),
      });
      return;
    }

    const delay = computeBackoffMs(job.attempt_count, this.baseBackoffMs);
    await this.jobs.update({
      ...job,
      status: 'RETRY',
      last_error: code,
      next_attempt_at: new Date(now.getTime() + delay).toISOString(),
      completed_at: null,
    });
  }

  private async recordSuccessfulPut(
    cp: AuditCheckpoint,
    anchorId: string,
    payload: EvidenceAnchorPayload,
    uri: string,
    hash: string,
  ): Promise<AnchorServiceResult> {
    const type = this.store!.provider;
    const anchoredAt = new Date().toISOString();
    try {
      const anchored = baseRecord(cp, payload, anchorId, 'ANCHORED', type, {
        anchored_at: anchoredAt,
        anchor_uri: uri,
        anchor_hash: hash,
      });
      await this.repo.append(anchored);

      let compare;
      if (this.publicJwks) {
        const external = await this.store!.getAnchor(uri);
        compare = await verifyCheckpointAgainstAnchor({
          checkpoint: cp,
          external: external?.payload ?? null,
          externalHash: external?.hash,
          expectedHash: hashAnchorPayload(payload),
          publicJwks: this.publicJwks,
        });
        if (compare.status === 'VERIFIED') {
          const verified = baseRecord(cp, payload, anchorId, 'VERIFIED', type, {
            anchored_at: anchoredAt,
            anchor_uri: uri,
            anchor_hash: hash,
          });
          await this.repo.append(verified);
          return {
            ok: true,
            anchor_id: anchorId,
            status: 'VERIFIED',
            uri,
            record: verified,
            compare,
          };
        }
      }

      return {
        ok: true,
        anchor_id: anchorId,
        status: 'ANCHORED',
        uri,
        record: anchored,
        compare,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate|unique/i.test(msg)) {
        const existing = await this.repo.latestByCheckpoint(cp.checkpoint_id);
        return {
          ok: true,
          anchor_id: existing?.anchor_id ?? anchorId,
          status: existing?.anchor_status ?? 'ANCHORED',
          uri: existing?.anchor_uri ?? uri,
          record: existing ?? undefined,
        };
      }
      throw err;
    }
  }

  private async executePut(
    cp: AuditCheckpoint,
    anchorId: string,
    payload: EvidenceAnchorPayload,
  ): Promise<AnchorServiceResult> {
    const type = this.store?.provider ?? 'OFFLINE';
    if (!this.store) {
      const failed = baseRecord(cp, payload, anchorId, 'FAILED', 'OFFLINE', {
        failure_code: 'NOT_CONFIGURED',
      });
      await this.repo.append(failed);
      return {
        ok: false,
        anchor_id: anchorId,
        status: 'FAILED',
        failure_code: 'NOT_CONFIGURED',
        record: failed,
      };
    }

    const path = this.store.objectPath(
      cp.deployment_id,
      cp.sequence_end,
      cp.checkpoint_id,
    );

    const put = await this.store.putAnchor(path, payload);
    if (!put.ok) {
      const failed = baseRecord(cp, payload, anchorId, 'FAILED', type, {
        failure_code: put.code,
      });
      await this.repo.append(failed);
      return {
        ok: false,
        anchor_id: anchorId,
        status: 'FAILED',
        failure_code: put.code,
        record: failed,
      };
    }

    try {
      return await this.recordSuccessfulPut(
        cp,
        anchorId,
        payload,
        put.uri,
        put.hash,
      );
    } catch {
      const failed = baseRecord(cp, payload, anchorId, 'FAILED', type, {
        failure_code: 'STORE_UNAVAILABLE',
        anchor_uri: put.uri,
        anchor_hash: put.hash,
      });
      await this.repo.append(failed);
      return {
        ok: false,
        anchor_id: anchorId,
        status: 'FAILED',
        failure_code: 'STORE_UNAVAILABLE',
        record: failed,
      };
    }
  }

  async verifyAnchor(
    cp: AuditCheckpoint,
  ): Promise<Awaited<ReturnType<typeof verifyCheckpointAgainstAnchor>>> {
    if (!this.store || !this.publicJwks) {
      return {
        status: 'FAILED',
        deployment_id: cp.deployment_id,
        checkpoint_id: cp.checkpoint_id,
        sequence_end: cp.sequence_end,
        signature: 'INVALID',
        root_hash: 'MISMATCH',
        external_anchor: 'NOT_FOUND',
        failure_codes: ['NOT_CONFIGURED'],
      };
    }
    const prior = await this.repo.latestByCheckpoint(cp.checkpoint_id);
    let loaded = prior?.anchor_uri
      ? await this.store.getAnchor(prior.anchor_uri)
      : null;
    if (!loaded) {
      const path = this.store.objectPath(
        cp.deployment_id,
        cp.sequence_end,
        cp.checkpoint_id,
      );
      if (await this.store.exists(path)) {
        loaded = await this.store.getAnchor(path);
      }
    }

    return verifyCheckpointAgainstAnchor({
      checkpoint: cp,
      external: loaded?.payload ?? null,
      externalHash: loaded?.hash,
      expectedHash: hashAnchorPayload(buildAnchorPayload(cp)),
      publicJwks: this.publicJwks,
    });
  }
}

export { verifyIndependentAnchor };
