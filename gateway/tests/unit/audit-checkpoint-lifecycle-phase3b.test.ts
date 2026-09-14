import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  InMemoryAuditService,
  type AuditEvent,
} from '../../src/audit/service.js';
import {
  IntegrityAuditService,
  InMemoryCheckpointStore,
} from '../../src/audit/integrity-service.js';
import { InMemoryAuditSequenceAllocator } from '../../src/audit/sequence.js';
import {
  createJoseCheckpointSigner,
  createJoseCheckpointVerifier,
  generateEphemeralCheckpointKeyPair,
} from '../../src/audit/checkpoint.js';
import { InMemoryEvidenceAnchorStore } from '../../src/audit/anchor-store.js';
import { InMemoryEvidenceAnchorRepository } from '../../src/audit/anchor-repository.js';
import { InMemoryAnchorJobRepository } from '../../src/audit/anchor-job.js';
import { EvidenceAnchoringService } from '../../src/audit/anchoring-service.js';
import { EvidenceLifecycleWorker } from '../../src/audit/anchor-worker.js';
import { verifyIndependentAnchor, buildAnchorPayload } from '../../src/audit/anchor.js';

const HMAC_KEY = 'test-audit-hmac-phase3b';
const DEPLOYMENT = '44444444-4444-4444-8444-444444444444';

function baseEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  const id = `aud_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  return {
    audit_id: id,
    timestamp: new Date().toISOString(),
    request_id: `req_${id}`,
    correlation_id: `cor_${id}`,
    organization_id: 'org_demo',
    application_id: 'app_demo',
    operation: 'chat.completion',
    policy_decision: 'ALLOW',
    response_decision: 'RELEASE',
    model_selected: 'local-general-v1',
    provider: 'local-runtime',
    reason_codes: ['BASELINE_ALLOW'],
    metadata: { __response_content: 'hello' },
    ...overrides,
  };
}

async function makeService(opts: {
  every?: number;
  intervalSeconds?: number;
  checkpointingEnabled?: boolean;
  withAnchoring?: boolean;
  asyncAnchor?: boolean;
}) {
  const pair = generateEphemeralCheckpointKeyPair('p3b-cp');
  const pubs = new Map([[pair.keyId, pair.publicJwk]]);
  const store = new InMemoryCheckpointStore();
  let anchoring: EvidenceAnchoringService | null = null;
  if (opts.withAnchoring) {
    anchoring = new EvidenceAnchoringService(
      new InMemoryEvidenceAnchorStore(),
      new InMemoryEvidenceAnchorRepository(),
      pubs,
      opts.asyncAnchor === false ? null : new InMemoryAnchorJobRepository(),
      { async: opts.asyncAnchor !== false, maxAttempts: 3, baseBackoffMs: 1 },
    );
  }
  const service = new IntegrityAuditService(new InMemoryAuditService(), HMAC_KEY, {
    deploymentId: DEPLOYMENT,
    sequenceAllocator: new InMemoryAuditSequenceAllocator(),
    checkpointStore: store,
    checkpointSigner: createJoseCheckpointSigner(pair.privateJwk, pair.keyId),
    checkpointVerifier: createJoseCheckpointVerifier(pubs),
    enableCanonicalV1: true,
    checkpointEveryEvents: opts.every ?? 0,
    checkpointIntervalSeconds: opts.intervalSeconds ?? 0,
    checkpointingEnabled: opts.checkpointingEnabled !== false,
    maxCheckpointsPerTick: 5,
    anchoring,
    anchorOnCheckpoint: Boolean(anchoring),
  });
  return { service, store, anchoring, pubs, pair };
}

describe('Audit Integrity Phase 3B — checkpoint lifecycle', () => {
  it('event threshold triggers contiguous checkpoint', async () => {
    const { service, store } = await makeService({ every: 2 });
    await service.record(baseEvent());
    expect(await store.list(DEPLOYMENT)).toHaveLength(0);
    await service.record(baseEvent());
    const cps = await store.list(DEPLOYMENT);
    expect(cps).toHaveLength(1);
    expect(cps[0]!.sequence_start).toBe(1);
    expect(cps[0]!.sequence_end).toBe(2);
    expect(cps[0]!.event_count).toBe(2);

    await service.record(baseEvent());
    await service.record(baseEvent());
    const cps2 = await store.list(DEPLOYMENT);
    expect(cps2).toHaveLength(2);
    expect(cps2[1]!.sequence_start).toBe(3);
    expect(cps2[1]!.sequence_end).toBe(4);
  });

  it('neither threshold means no scheduled checkpoint', async () => {
    const { service } = await makeService({ every: 10, intervalSeconds: 3600 });
    await service.record(baseEvent());
    expect(await service.isCheckpointDue(DEPLOYMENT)).toBe(false);
    expect(await service.runScheduledCheckpoints()).toBe(0);
  });

  it('time threshold triggers when elapsed and new events exist', async () => {
    const { service, store } = await makeService({
      every: 0,
      intervalSeconds: 60,
    });
    await service.record(baseEvent());
    const first = await service.createCheckpointDetailed({
      deploymentId: DEPLOYMENT,
    });
    expect(first.created).toBe(true);
    const listed = await store.list(DEPLOYMENT);
    listed[0]!.created_at = new Date(Date.now() - 120_000).toISOString();
    await service.record(baseEvent());
    expect(await service.isCheckpointDue(DEPLOYMENT)).toBe(true);
    const n = await service.runScheduledCheckpoints();
    expect(n).toBe(1);
  });

  it('prevents empty checkpoints', async () => {
    const { service } = await makeService({ every: 0 });
    await service.record(baseEvent());
    const a = await service.createCheckpointDetailed({ deploymentId: DEPLOYMENT });
    expect(a.created).toBe(true);
    const b = await service.createCheckpointDetailed({ deploymentId: DEPLOYMENT });
    expect(b.created).toBe(false);
    expect(b.reason).toBe('EMPTY');
  });

  it('concurrent creates do not duplicate the same boundary', async () => {
    const { service } = await makeService({ every: 0 });
    await service.record(baseEvent());
    await service.record(baseEvent());
    const results = await Promise.all([
      service.createCheckpointDetailed({ deploymentId: DEPLOYMENT }),
      service.createCheckpointDetailed({ deploymentId: DEPLOYMENT }),
    ]);
    const created = results.filter((r) => r.created);
    expect(created).toHaveLength(1);
    const cps = await service.listCheckpoints(DEPLOYMENT);
    expect(cps).toHaveLength(1);
    expect(cps[0]!.sequence_end).toBe(2);
  });

  it('manual checkpoint enqueues anchor without waiting for store completion', async () => {
    const { service, anchoring } = await makeService({
      every: 0,
      withAnchoring: true,
      asyncAnchor: true,
    });
    await service.record(baseEvent());
    const result = await service.createCheckpointDetailed({
      deploymentId: DEPLOYMENT,
    });
    expect(result.created).toBe(true);
    expect(result.anchor_pending).toBe(true);
    expect(result.anchor_status).toBe('PENDING');
    expect(await anchoring!.processNextJob()).toBe(true);
    const status = await anchoring!.latestStatus(DEPLOYMENT);
    expect(['ANCHORED', 'VERIFIED']).toContain(status.status);
  });

  it('catch-up creates chunked checkpoints up to max per tick', async () => {
    const { service } = await makeService({
      every: 2,
      intervalSeconds: 0,
      checkpointingEnabled: true,
    });
    // Disable sync-on-record by using every:0 first then schedule
    const pair = generateEphemeralCheckpointKeyPair('catch');
    const pubs = new Map([[pair.keyId, pair.publicJwk]]);
    const store = new InMemoryCheckpointStore();
    const catchService = new IntegrityAuditService(
      new InMemoryAuditService(),
      HMAC_KEY,
      {
        deploymentId: DEPLOYMENT,
        sequenceAllocator: new InMemoryAuditSequenceAllocator(),
        checkpointStore: store,
        checkpointSigner: createJoseCheckpointSigner(pair.privateJwk, pair.keyId),
        checkpointVerifier: createJoseCheckpointVerifier(pubs),
        enableCanonicalV1: true,
        checkpointEveryEvents: 2,
        checkpointIntervalSeconds: 0,
        checkpointSyncOnRecord: false,
        maxCheckpointsPerTick: 2,
      },
    );
    for (let i = 0; i < 7; i++) await catchService.record(baseEvent());
    expect(await store.list(DEPLOYMENT)).toHaveLength(0);
    const n = await catchService.runScheduledCheckpoints();
    expect(n).toBe(2);
    const cps = await store.list(DEPLOYMENT);
    expect(cps[0]!.sequence_end).toBe(2);
    expect(cps[1]!.sequence_end).toBe(4);
    const n2 = await catchService.runScheduledCheckpoints();
    expect(n2).toBe(1);
    expect((await store.list(DEPLOYMENT)).at(-1)!.sequence_end).toBe(6);
    // one event remains uncheckpointed (below event threshold)
    const life = await catchService.getLifecycleStatus(DEPLOYMENT);
    expect(life.uncheckpointed_events).toBe(1);
    void service;
  });

  it('lifecycle worker runs checkpoints then anchors', async () => {
    const { service, anchoring } = await makeService({
      every: 2,
      withAnchoring: true,
      asyncAnchor: true,
      checkpointingEnabled: true,
    });
    // Use sync-off path via scheduled worker
    const pair = generateEphemeralCheckpointKeyPair('worker');
    const pubs = new Map([[pair.keyId, pair.publicJwk]]);
    const store = new InMemoryCheckpointStore();
    const jobs = new InMemoryAnchorJobRepository();
    const anchoring2 = new EvidenceAnchoringService(
      new InMemoryEvidenceAnchorStore(),
      new InMemoryEvidenceAnchorRepository(),
      pubs,
      jobs,
      { async: true, maxAttempts: 3, baseBackoffMs: 1 },
    );
    const svc = new IntegrityAuditService(new InMemoryAuditService(), HMAC_KEY, {
      deploymentId: DEPLOYMENT,
      sequenceAllocator: new InMemoryAuditSequenceAllocator(),
      checkpointStore: store,
      checkpointSigner: createJoseCheckpointSigner(pair.privateJwk, pair.keyId),
      checkpointVerifier: createJoseCheckpointVerifier(pubs),
      enableCanonicalV1: true,
      checkpointEveryEvents: 2,
      checkpointSyncOnRecord: false,
      anchoring: anchoring2,
      anchorOnCheckpoint: true,
    });
    await svc.record(baseEvent());
    await svc.record(baseEvent());
    const worker = new EvidenceLifecycleWorker(svc, anchoring2, 60_000);
    const tick = await worker.tick();
    expect(tick.checkpoints).toBeGreaterThanOrEqual(1);
    expect(tick.anchors).toBeGreaterThanOrEqual(1);
    void service;
    void anchoring;
  });

  it('store failure does not alter sealed governance audit', async () => {
    const broken = new InMemoryEvidenceAnchorStore();
    broken.putAnchor = async () => ({
      ok: false,
      code: 'STORE_UNAVAILABLE',
      message: 'down',
    });
    const pair = generateEphemeralCheckpointKeyPair('iso');
    const pubs = new Map([[pair.keyId, pair.publicJwk]]);
    const anchoring = new EvidenceAnchoringService(
      broken,
      new InMemoryEvidenceAnchorRepository(),
      pubs,
      new InMemoryAnchorJobRepository(),
      { async: true, maxAttempts: 1, baseBackoffMs: 1 },
    );
    const service = new IntegrityAuditService(new InMemoryAuditService(), HMAC_KEY, {
      deploymentId: DEPLOYMENT,
      sequenceAllocator: new InMemoryAuditSequenceAllocator(),
      checkpointStore: new InMemoryCheckpointStore(),
      checkpointSigner: createJoseCheckpointSigner(pair.privateJwk, pair.keyId),
      checkpointVerifier: createJoseCheckpointVerifier(pubs),
      enableCanonicalV1: true,
      checkpointEveryEvents: 0,
      anchoring,
      anchorOnCheckpoint: true,
    });
    const sealed = await service.record(baseEvent({ policy_decision: 'ALLOW' }));
    const cp = await service.createCheckpointDetailed({ deploymentId: DEPLOYMENT });
    expect(cp.created).toBe(true);
    await anchoring.processNextJob();
    expect(sealed.policy_decision).toBe('ALLOW');
    expect((await service.verifyIntegrity()).ok).toBe(true);
  });

  it('independent verify still works offline', async () => {
    const { service, pubs } = await makeService({ every: 0 });
    await service.record(baseEvent());
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const indep = await verifyIndependentAnchor({
      payload: buildAnchorPayload(cp!),
      publicJwks: pubs,
    });
    expect(indep.status).toBe('VERIFIED');
  });
});
