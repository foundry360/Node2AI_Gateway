import type { AuditEvent, AuditService } from './service.js';
import {
  AUDIT_CANONICAL_VERSION_V1,
  GENESIS_PREV,
  canonicalEventPayload,
  computeEventHash,
  hashInputContent,
  hashResponseContent,
  signEventHash,
  verifyAuditChain,
  type IntegrityVerifyResult,
} from './integrity.js';
import type { AuditSequenceAllocator } from './sequence.js';
import type { AuditCheckpoint, CheckpointSigner, CheckpointVerifier } from './checkpoint.js';
import { buildSignedCheckpoint } from './checkpoint.js';
import {
  verifyFullAuditIntegrity,
  type FullAuditVerifyResult,
} from './verify.js';
import type { EvidenceAnchoringService } from './anchoring-service.js';
import { auditLifecycleMetrics } from './lifecycle-metrics.js';

export type { IntegrityVerifyResult, FullAuditVerifyResult };

export type CheckpointStore = {
  list(deploymentId?: string): Promise<AuditCheckpoint[]>;
  append(checkpoint: AuditCheckpoint): Promise<void>;
  /** Optional concurrency lock for checkpoint creation. */
  withLock?<T>(deploymentId: string, fn: () => Promise<T>): Promise<T>;
};

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly rows: AuditCheckpoint[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  async list(deploymentId?: string): Promise<AuditCheckpoint[]> {
    return deploymentId
      ? this.rows.filter((r) => r.deployment_id === deploymentId)
      : [...this.rows];
  }

  async append(checkpoint: AuditCheckpoint): Promise<void> {
    const conflict = this.rows.some(
      (r) =>
        r.deployment_id === checkpoint.deployment_id &&
        (r.sequence_end === checkpoint.sequence_end ||
          r.sequence_start === checkpoint.sequence_start),
    );
    if (conflict) {
      throw new Error('duplicate checkpoint boundary');
    }
    this.rows.push(checkpoint);
  }

  async withLock<T>(_deploymentId: string, fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export type CreateCheckpointResult = {
  checkpoint: AuditCheckpoint | null;
  created: boolean;
  reason?:
    | 'CREATED'
    | 'EMPTY'
    | 'NOT_CONFIGURED'
    | 'CONFLICT'
    | 'ERROR';
  anchor_status?: string;
  anchor_pending?: boolean;
};

export type IntegrityAuditOptions = {
  deploymentId?: string | (() => Promise<string>);
  sequenceAllocator?: AuditSequenceAllocator;
  /** When true (default if deploymentId + allocator present), seal as canonical v1. */
  enableCanonicalV1?: boolean;
  checkpointStore?: CheckpointStore;
  checkpointSigner?: CheckpointSigner | null;
  checkpointVerifier?: CheckpointVerifier | null;
  /**
   * Event threshold: create checkpoint after N new events since last checkpoint.
   * 0 disables event-threshold auto checkpointing. Default 500.
   */
  checkpointEveryEvents?: number;
  /** Time threshold in seconds (0 disables). Default 900. */
  checkpointIntervalSeconds?: number;
  /** Master switch for automatic checkpointing (manual still works). */
  checkpointingEnabled?: boolean;
  /** Max checkpoints created per scheduled catch-up tick. Default 5. */
  maxCheckpointsPerTick?: number;
  /**
   * When true (default), also create on the record() path when event threshold
   * is met. Worker still handles time-based + catch-up.
   */
  checkpointSyncOnRecord?: boolean;
  /** Phase 2: optional external anchoring (never affects PDP). */
  anchoring?: EvidenceAnchoringService | null;
  /** When true, auto-anchor after successful checkpoint. */
  anchorOnCheckpoint?: boolean;
};

/**
 * Wraps an audit store to hash released responses and maintain a signed hash chain.
 * Response body plaintext is not persisted — only response_hash.
 */
export class IntegrityAuditService implements AuditService {
  private lastEventHash = GENESIS_PREV;
  private v1EventsSinceCheckpoint = 0;

  constructor(
    private readonly inner: AuditService,
    private readonly signingKey: string,
    private readonly options: IntegrityAuditOptions = {},
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
    await this.refreshEventsSinceCheckpoint();
  }

  private async refreshEventsSinceCheckpoint(): Promise<void> {
    const deploymentId = await this.resolveDeploymentId();
    if (!deploymentId || !this.options.checkpointStore) {
      this.v1EventsSinceCheckpoint = 0;
      return;
    }
    const events = (await this.inner.list()).filter(
      (e) =>
        e.deployment_id === deploymentId &&
        e.audit_canonical_version === AUDIT_CANONICAL_VERSION_V1 &&
        typeof e.sequence_number === 'number',
    );
    const cps = await this.options.checkpointStore.list(deploymentId);
    const lastEnd = cps.reduce(
      (max, c) => Math.max(max, c.sequence_end),
      0,
    );
    this.v1EventsSinceCheckpoint = events.filter(
      (e) => (e.sequence_number ?? 0) > lastEnd,
    ).length;
  }

  private async resolveDeploymentId(): Promise<string | undefined> {
    const d = this.options.deploymentId;
    if (!d) return undefined;
    return typeof d === 'function' ? d() : d;
  }

  /** Public resolver for workers / metrics (same as private). */
  async resolveDeploymentIdPublic(): Promise<string | undefined> {
    return this.resolveDeploymentId();
  }

  private eventThreshold(): number {
    return this.options.checkpointEveryEvents ?? 500;
  }

  private intervalSeconds(): number {
    return this.options.checkpointIntervalSeconds ?? 900;
  }

  private autoEnabled(): boolean {
    return this.options.checkpointingEnabled !== false;
  }

  async record(event: AuditEvent): Promise<AuditEvent> {
    const responseContent =
      typeof event.metadata?.__response_content === 'string'
        ? event.metadata.__response_content
        : '';
    const inputContent =
      typeof event.metadata?.__input_content === 'string'
        ? event.metadata.__input_content
        : undefined;
    const metadata = { ...(event.metadata ?? {}) };
    delete metadata.__response_content;
    delete metadata.__input_content;

    const response_hash =
      event.response_hash ?? hashResponseContent(responseContent);
    const input_hash =
      event.input_hash ??
      (inputContent !== undefined ? hashInputContent(inputContent) : event.input_hash);
    const prev_event_hash = this.lastEventHash;

    const deploymentId = await this.resolveDeploymentId();
    const useV1 =
      this.options.enableCanonicalV1 !== false &&
      Boolean(deploymentId && this.options.sequenceAllocator);

    let sequence_number: number | null = event.sequence_number ?? null;
    let deployment_id: string | null = event.deployment_id ?? null;
    let audit_canonical_version: number | null =
      event.audit_canonical_version ?? null;

    if (useV1 && deploymentId && this.options.sequenceAllocator) {
      deployment_id = deploymentId;
      sequence_number = await this.options.sequenceAllocator.nextSequence(deploymentId);
      audit_canonical_version = AUDIT_CANONICAL_VERSION_V1;
    }

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
      evaluation_id: event.evaluation_id,
      decision_hash: event.decision_hash,
      response_hash,
      prev_event_hash,
      deployment_id,
      sequence_number,
      audit_canonical_version,
      input_hash: input_hash ?? null,
    });
    const event_hash = computeEventHash(payload);
    const integrity_signature = signEventHash(event_hash, this.signingKey);

    const sealed: AuditEvent = {
      ...event,
      metadata,
      evaluation_id: event.evaluation_id ?? null,
      decision_hash: event.decision_hash ?? null,
      response_hash,
      prev_event_hash,
      event_hash,
      integrity_signature,
      deployment_id,
      sequence_number,
      audit_canonical_version,
      input_hash: input_hash ?? null,
    };

    await this.inner.record(sealed);
    this.lastEventHash = event_hash;

    if (useV1 && audit_canonical_version === AUDIT_CANONICAL_VERSION_V1) {
      this.v1EventsSinceCheckpoint += 1;
      const every = this.eventThreshold();
      const sync =
        this.options.checkpointSyncOnRecord !== false && this.autoEnabled();
      if (
        sync &&
        every > 0 &&
        this.v1EventsSinceCheckpoint >= every &&
        this.options.checkpointSigner &&
        this.options.checkpointStore &&
        deployment_id
      ) {
        // Never throw into AI path
        try {
          await this.createCheckpoint({
            deploymentId: deployment_id,
            maxEvents: every,
          });
        } catch {
          auditLifecycleMetrics.recordCheckpointFailed();
        }
        await this.refreshEventsSinceCheckpoint();
      }
    }

    return sealed;
  }

  async list(): Promise<AuditEvent[]> {
    return this.inner.list();
  }

  async getById(auditId: string): Promise<AuditEvent | null> {
    const inner = this.inner as AuditService & {
      getById?: (id: string) => Promise<AuditEvent | null>;
    };
    if (typeof inner.getById === 'function') {
      return inner.getById(auditId);
    }
    const all = await this.inner.list();
    return all.find((e) => e.audit_id === auditId) ?? null;
  }

  async verifyIntegrity(): Promise<IntegrityVerifyResult> {
    const events = await this.inner.list();
    return verifyAuditChain(events, this.signingKey);
  }

  async verifyFull(deploymentId?: string): Promise<FullAuditVerifyResult> {
    const dep =
      deploymentId ??
      (await this.resolveDeploymentId()) ??
      'unknown-deployment';
    const events = await this.inner.list();
    const checkpoints = this.options.checkpointStore
      ? await this.options.checkpointStore.list(dep)
      : [];
    return verifyFullAuditIntegrity({
      deploymentId: dep,
      events,
      checkpoints,
      hmacSigningKey: this.signingKey,
      checkpointVerifier: this.options.checkpointVerifier ?? null,
    });
  }

  async listCheckpoints(deploymentId?: string): Promise<AuditCheckpoint[]> {
    if (!this.options.checkpointStore) return [];
    const dep = deploymentId ?? (await this.resolveDeploymentId());
    return this.options.checkpointStore.list(dep);
  }

  /**
   * Worker entry: create due checkpoints (event and/or time threshold),
   * with catch-up limited to maxCheckpointsPerTick.
   */
  async runScheduledCheckpoints(): Promise<number> {
    if (!this.autoEnabled()) return 0;
    const deploymentId = await this.resolveDeploymentId();
    if (!deploymentId) return 0;
    if (!this.options.checkpointSigner || !this.options.checkpointStore) return 0;

    const maxPerTick = this.options.maxCheckpointsPerTick ?? 5;
    let created = 0;
    for (let i = 0; i < maxPerTick; i++) {
      const due = await this.isCheckpointDue(deploymentId);
      if (!due) break;
      const result = await this.createCheckpointDetailed({
        deploymentId,
        maxEvents: this.eventThreshold() > 0 ? this.eventThreshold() : undefined,
      });
      if (!result.created) break;
      created += 1;
    }
    return created;
  }

  async isCheckpointDue(deploymentId?: string): Promise<boolean> {
    if (!this.autoEnabled()) return false;
    const dep = deploymentId ?? (await this.resolveDeploymentId());
    if (!dep || !this.options.checkpointStore) return false;

    const range = await this.uncheckpointedRange(dep);
    if (!range || range.events.length === 0) return false;

    const every = this.eventThreshold();
    if (every > 0 && range.events.length >= every) return true;

    const interval = this.intervalSeconds();
    if (interval <= 0) return false;

    const cps = await this.options.checkpointStore.list(dep);
    const lastCp = [...cps].sort((a, b) => b.sequence_end - a.sequence_end)[0];
    const anchorTime = lastCp
      ? new Date(lastCp.created_at).getTime()
      : new Date(range.events[0]!.timestamp).getTime();
    return Date.now() - anchorTime >= interval * 1000;
  }

  private async uncheckpointedRange(deploymentId: string): Promise<{
    events: AuditEvent[];
    sequenceStart: number;
    sequenceEnd: number;
  } | null> {
    const events = (await this.inner.list())
      .filter(
        (e) =>
          e.deployment_id === deploymentId &&
          typeof e.sequence_number === 'number' &&
          e.event_hash,
      )
      .sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
    if (events.length === 0) return null;

    const cps = this.options.checkpointStore
      ? await this.options.checkpointStore.list(deploymentId)
      : [];
    const lastEnd = cps.reduce((max, c) => Math.max(max, c.sequence_end), 0);
    const next = events.filter((e) => (e.sequence_number ?? 0) > lastEnd);
    if (next.length === 0) return null;
    return {
      events: next,
      sequenceStart: next[0]!.sequence_number!,
      sequenceEnd: next[next.length - 1]!.sequence_number!,
    };
  }

  async createCheckpoint(opts?: {
    deploymentId?: string;
    /** Cap events included (catch-up chunks). */
    maxEvents?: number;
  }): Promise<AuditCheckpoint | null> {
    const result = await this.createCheckpointDetailed(opts);
    return result.checkpoint;
  }

  async createCheckpointDetailed(opts?: {
    deploymentId?: string;
    maxEvents?: number;
  }): Promise<CreateCheckpointResult> {
    const signer = this.options.checkpointSigner;
    const store = this.options.checkpointStore;
    if (!signer || !store) {
      return { checkpoint: null, created: false, reason: 'NOT_CONFIGURED' };
    }

    const deploymentId =
      opts?.deploymentId ?? (await this.resolveDeploymentId());
    if (!deploymentId) {
      return { checkpoint: null, created: false, reason: 'NOT_CONFIGURED' };
    }

    const run = async (): Promise<CreateCheckpointResult> => {
      const range = await this.uncheckpointedRange(deploymentId);
      if (!range || range.events.length === 0) {
        auditLifecycleMetrics.recordCheckpointSkippedEmpty();
        return { checkpoint: null, created: false, reason: 'EMPTY' };
      }

      const slice =
        opts?.maxEvents && opts.maxEvents > 0
          ? range.events.slice(0, opts.maxEvents)
          : range.events;
      const first = slice[0]!;
      const last = slice[slice.length - 1]!;

      try {
        const checkpoint = await buildSignedCheckpoint({
          deploymentId,
          sequenceStart: first.sequence_number!,
          sequenceEnd: last.sequence_number!,
          eventCount: slice.length,
          rootHash: last.event_hash!,
          signer,
        });
        await store.append(checkpoint);
        auditLifecycleMetrics.recordCheckpointCreated();
        this.v1EventsSinceCheckpoint = Math.max(
          0,
          range.events.length - slice.length,
        );

        let anchor_status = 'NOT_CONFIGURED';
        let anchor_pending = false;
        if (
          this.options.anchorOnCheckpoint !== false &&
          this.options.anchoring
        ) {
          try {
            const ar = await this.options.anchoring.anchorCheckpoint(checkpoint);
            anchor_status = String(ar.status);
            anchor_pending =
              ar.status === 'PENDING' || ar.status === 'RETRYING';
            if (ar.status === 'ANCHORED' || ar.status === 'VERIFIED') {
              auditLifecycleMetrics.recordAnchorAnchored();
            }
          } catch {
            anchor_status = 'FAILED';
            anchor_pending = false;
          }
        }

        return {
          checkpoint,
          created: true,
          reason: 'CREATED',
          anchor_status,
          anchor_pending,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/duplicate|unique|conflict/i.test(msg)) {
          return { checkpoint: null, created: false, reason: 'CONFLICT' };
        }
        auditLifecycleMetrics.recordCheckpointFailed();
        return { checkpoint: null, created: false, reason: 'ERROR' };
      }
    };

    if (store.withLock) {
      return store.withLock(deploymentId, run);
    }
    return run();
  }

  async verifyCheckpointSignature(cp: AuditCheckpoint): Promise<boolean> {
    const verifier = this.options.checkpointVerifier;
    if (!verifier) return false;
    return verifier.verify(
      {
        checkpoint_id: cp.checkpoint_id,
        deployment_id: cp.deployment_id,
        sequence_start: cp.sequence_start,
        sequence_end: cp.sequence_end,
        event_count: cp.event_count,
        root_hash: cp.root_hash,
        created_at: cp.created_at,
        key_id: cp.key_id,
        canonical_version: cp.canonical_version,
      },
      cp.signature,
      cp.key_id,
    );
  }

  getAnchoring(): EvidenceAnchoringService | null {
    return this.options.anchoring ?? null;
  }

  /**
   * Lifecycle summary for Audit UI / ops.
   */
  async getLifecycleStatus(deploymentId?: string): Promise<{
    last_checkpoint: AuditCheckpoint | null;
    uncheckpointed_events: number;
    oldest_unanchored_checkpoint: AuditCheckpoint | null;
    pending_anchors: number;
    retrying_anchors: number;
    failed_anchors: number;
    metrics: ReturnType<typeof auditLifecycleMetrics.snapshot>;
  }> {
    const dep = deploymentId ?? (await this.resolveDeploymentId());
    const cps = dep ? await this.listCheckpoints(dep) : [];
    const last = [...cps].sort((a, b) => b.sequence_end - a.sequence_end)[0] ?? null;
    const range = dep ? await this.uncheckpointedRange(dep) : null;
    const anchoring = this.options.anchoring;
    let pending = 0;
    let retrying = 0;
    let failed = 0;
    let oldestUnanchored: AuditCheckpoint | null = null;
    if (anchoring && dep) {
      const jobs = await anchoring.listJobs(dep);
      pending = jobs.filter((j) => j.status === 'PENDING').length;
      retrying = jobs.filter(
        (j) => j.status === 'RETRY' || j.status === 'IN_PROGRESS',
      ).length;
      failed = jobs.filter((j) => j.status === 'FAILED').length;
      const anchored = new Set(
        (await anchoring.list(dep))
          .filter(
            (a) =>
              a.anchor_status === 'ANCHORED' || a.anchor_status === 'VERIFIED',
          )
          .map((a) => a.checkpoint_id),
      );
      for (const cp of [...cps].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )) {
        if (!anchored.has(cp.checkpoint_id)) {
          oldestUnanchored = cp;
          break;
        }
      }
    } else if (cps.length > 0 && !anchoring) {
      oldestUnanchored = null;
    }

    return {
      last_checkpoint: last,
      uncheckpointed_events: range?.events.length ?? 0,
      oldest_unanchored_checkpoint: oldestUnanchored,
      pending_anchors: pending,
      retrying_anchors: retrying,
      failed_anchors: failed,
      metrics: auditLifecycleMetrics.snapshot(),
    };
  }
}

export { hashResponseContent };
