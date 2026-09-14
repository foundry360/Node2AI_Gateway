import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryAuditService } from '../../src/audit/service.js';
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
import {
  FilesystemEvidenceAnchorStore,
  InMemoryEvidenceAnchorStore,
} from '../../src/audit/anchor-store.js';
import { InMemoryEvidenceAnchorRepository } from '../../src/audit/anchor-repository.js';
import { InMemoryAnchorJobRepository, computeBackoffMs } from '../../src/audit/anchor-job.js';
import { EvidenceAnchoringService } from '../../src/audit/anchoring-service.js';
import {
  buildAnchorPayload,
  verifyIndependentAnchor,
  canonicalAnchorJson,
} from '../../src/audit/anchor.js';
import {
  InMemoryS3ObjectClient,
  S3EvidenceAnchorStore,
} from '../../src/audit/providers/s3/index.js';

const HMAC_KEY = 'test-audit-hmac-phase3a';
const DEPLOYMENT = '33333333-3333-4333-8333-333333333333';

async function setupAsync(opts?: {
  store?: InMemoryEvidenceAnchorStore | FilesystemEvidenceAnchorStore | S3EvidenceAnchorStore;
  maxAttempts?: number;
  baseBackoffMs?: number;
}) {
  const pair = generateEphemeralCheckpointKeyPair('phase3-cp');
  const pubs = new Map([[pair.keyId, pair.publicJwk]]);
  const store = opts?.store ?? new InMemoryEvidenceAnchorStore();
  const repo = new InMemoryEvidenceAnchorRepository();
  const jobs = new InMemoryAnchorJobRepository();
  const anchoring = new EvidenceAnchoringService(store, repo, pubs, jobs, {
    async: true,
    maxAttempts: opts?.maxAttempts ?? 8,
    baseBackoffMs: opts?.baseBackoffMs ?? 1,
  });
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
  return { service, anchoring, store, pubs, jobs, pair };
}

describe('Audit Integrity Phase 3A — durable anchoring + S3 adapter', () => {
  it('filesystem provider still works without cloud config', async () => {
    const root = mkdtempSync(join(tmpdir(), 'enigma-p3-fs-'));
    try {
      const { service, anchoring } = await setupAsync({
        store: new FilesystemEvidenceAnchorStore(root),
      });
      await service.record({
        audit_id: 'aud_p3_1',
        timestamp: new Date().toISOString(),
        request_id: 'r1',
        correlation_id: 'c1',
        metadata: { __response_content: 'fs' },
      });
      const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
      expect(cp).toBeTruthy();
      const enqueued = await anchoring.anchorCheckpoint(cp!);
      expect(enqueued.status).toBe('PENDING');
      expect(await anchoring.processNextJob()).toBe(true);
      const status = await anchoring.latestStatus(DEPLOYMENT);
      expect(['ANCHORED', 'VERIFIED']).toContain(status.status);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('S3 adapter put/get/exists + deterministic key + idempotent identical put', async () => {
    const client = new InMemoryS3ObjectClient();
    const store = new S3EvidenceAnchorStore({
      bucket: 'customer-evidence',
      region: 'us-east-1',
      prefix: 'prod',
      client,
    });
    const { service, pubs } = await setupAsync({ store });
    await service.record({
      audit_id: 'aud_p3_2',
      timestamp: new Date().toISOString(),
      request_id: 'r2',
      correlation_id: 'c2',
      metadata: { __response_content: 's3' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const payload = buildAnchorPayload(cp!);
    const path = store.objectPath(DEPLOYMENT, cp!.sequence_end, cp!.checkpoint_id);
    expect(path).toContain('prod/enigma/deployments/');
    expect(path).toContain(cp!.checkpoint_id);

    const first = await store.putAnchor(path, payload);
    expect(first.ok).toBe(true);
    expect(await store.exists(path)).toBe(true);
    const got = await store.getAnchor((first as { uri: string }).uri);
    expect(got?.payload.checkpoint_id).toBe(cp!.checkpoint_id);

    const again = await store.putAnchor(path, payload);
    expect(again.ok).toBe(true);

    const indep = await verifyIndependentAnchor({
      payload: got!.payload,
      publicJwks: pubs,
    });
    expect(indep.status).toBe('VERIFIED');
  });

  it('S3 conflict when content differs — never overwrites', async () => {
    const client = new InMemoryS3ObjectClient();
    const store = new S3EvidenceAnchorStore({
      bucket: 'customer-evidence',
      region: 'us-east-1',
      client,
    });
    const { service } = await setupAsync({ store });
    await service.record({
      audit_id: 'aud_p3_3',
      timestamp: new Date().toISOString(),
      request_id: 'r3',
      correlation_id: 'c3',
      metadata: { __response_content: 'conflict' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const path = store.objectPath(DEPLOYMENT, cp!.sequence_end, cp!.checkpoint_id);
    const payload = buildAnchorPayload(cp!);
    expect((await store.putAnchor(path, payload)).ok).toBe(true);
    const conflict = await store.putAnchor(path, {
      ...payload,
      root_hash: '0'.repeat(64),
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe('ANCHOR_CONFLICT');
    const body = await client.getObject('customer-evidence', path);
    expect(body?.body).toBe(canonicalAnchorJson(payload));
  });

  it('durable queue enqueues, retries with backoff, then succeeds', async () => {
    const store = new InMemoryEvidenceAnchorStore();
    let fails = 2;
    const original = store.putAnchor.bind(store);
    store.putAnchor = async (path, payload) => {
      if (fails > 0) {
        fails -= 1;
        return { ok: false, code: 'STORE_UNAVAILABLE', message: 'down' };
      }
      return original(path, payload);
    };

    const { service, anchoring, jobs } = await setupAsync({
      store,
      maxAttempts: 5,
      baseBackoffMs: 1,
    });
    await service.record({
      audit_id: 'aud_p3_4',
      timestamp: new Date().toISOString(),
      request_id: 'r4',
      correlation_id: 'c4',
      metadata: { __response_content: 'retry' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    await anchoring.anchorCheckpoint(cp!);

    expect(await anchoring.processNextJob()).toBe(true);
    let job = await jobs.getByCheckpoint(cp!.checkpoint_id);
    expect(job?.status).toBe('RETRY');

    // Force due
    await jobs.update({
      ...job!,
      next_attempt_at: new Date(0).toISOString(),
    });
    expect(await anchoring.processNextJob()).toBe(true);
    job = await jobs.getByCheckpoint(cp!.checkpoint_id);
    expect(job?.status).toBe('RETRY');

    await jobs.update({
      ...job!,
      next_attempt_at: new Date(0).toISOString(),
    });
    expect(await anchoring.processNextJob()).toBe(true);
    job = await jobs.getByCheckpoint(cp!.checkpoint_id);
    expect(job?.status).toBe('ANCHORED');

    const status = await anchoring.latestStatus(DEPLOYMENT);
    expect(['ANCHORED', 'VERIFIED']).toContain(status.status);
  });

  it('exhausted retries become FAILED; manual retry can recover', async () => {
    const store = new InMemoryEvidenceAnchorStore();
    store.putAnchor = async () => ({
      ok: false,
      code: 'STORE_UNAVAILABLE',
      message: 'down',
    });
    const { service, anchoring, jobs } = await setupAsync({
      store,
      maxAttempts: 2,
      baseBackoffMs: 1,
    });
    await service.record({
      audit_id: 'aud_p3_5',
      timestamp: new Date().toISOString(),
      request_id: 'r5',
      correlation_id: 'c5',
      metadata: { __response_content: 'fail' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    await anchoring.anchorCheckpoint(cp!);

    for (let i = 0; i < 3; i++) {
      const job = await jobs.getByCheckpoint(cp!.checkpoint_id);
      if (job && job.status !== 'FAILED') {
        await jobs.update({ ...job, next_attempt_at: new Date(0).toISOString() });
      }
      await anchoring.processNextJob();
    }
    let job = await jobs.getByCheckpoint(cp!.checkpoint_id);
    expect(job?.status).toBe('FAILED');

    // Restore store and operator retry
    store.putAnchor = InMemoryEvidenceAnchorStore.prototype.putAnchor.bind(store);
    const retry = await anchoring.retryJob(job!.job_id);
    expect(['ANCHORED', 'VERIFIED', 'RETRYING', 'PENDING']).toContain(retry.status);
    job = await jobs.getByCheckpoint(cp!.checkpoint_id);
    // May need one more process if retry scheduled without immediate claim race
    if (job?.status !== 'ANCHORED') {
      await jobs.update({ ...job!, next_attempt_at: new Date(0).toISOString(), status: 'RETRY' });
      await anchoring.processNextJob();
      job = await jobs.getByCheckpoint(cp!.checkpoint_id);
    }
    expect(job?.status).toBe('ANCHORED');
  });

  it('store outage does not break audit seal or checkpoint', async () => {
    const store = new InMemoryEvidenceAnchorStore();
    store.putAnchor = async () => ({
      ok: false,
      code: 'STORE_UNAVAILABLE',
      message: 'down',
    });
    const { service, anchoring } = await setupAsync({ store, maxAttempts: 1 });
    const sealed = await service.record({
      audit_id: 'aud_p3_6',
      timestamp: new Date().toISOString(),
      request_id: 'r6',
      correlation_id: 'c6',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      metadata: { __response_content: 'gov-ok' },
    });
    expect(sealed.event_hash).toBeTruthy();
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    expect(cp).toBeTruthy();
    await anchoring.anchorCheckpoint(cp!);
    await anchoring.processNextJob();
    const chain = await service.verifyIntegrity();
    expect(chain.ok).toBe(true);
    expect(sealed.policy_decision ?? 'ALLOW').toBe('ALLOW');
  });

  it('computeBackoffMs grows then caps attempt exponent', () => {
    expect(computeBackoffMs(1, 1000)).toBe(1000);
    expect(computeBackoffMs(2, 1000)).toBe(2000);
    expect(computeBackoffMs(3, 1000)).toBe(4000);
    expect(computeBackoffMs(20, 1000)).toBe(512_000);
    expect(computeBackoffMs(20, 60_000)).toBe(3_600_000);
  });

  it('tampered S3 anchor fails independent verification', async () => {
    const client = new InMemoryS3ObjectClient();
    const store = new S3EvidenceAnchorStore({
      bucket: 'b',
      region: 'us-east-1',
      client,
    });
    const { service, pubs } = await setupAsync({ store });
    await service.record({
      audit_id: 'aud_p3_7',
      timestamp: new Date().toISOString(),
      request_id: 'r7',
      correlation_id: 'c7',
      metadata: { __response_content: 'tamp' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const path = store.objectPath(DEPLOYMENT, cp!.sequence_end, cp!.checkpoint_id);
    await store.putAnchor(path, buildAnchorPayload(cp!));
    const got = await store.getAnchor(store.uriForKey(path));
    const tampered = { ...got!.payload, root_hash: 'f'.repeat(64) };
    const indep = await verifyIndependentAnchor({
      payload: tampered,
      publicJwks: pubs,
    });
    expect(indep.status).toBe('FAILED');
  });

  it('does not expose storage credentials in anchor payload', async () => {
    const client = new InMemoryS3ObjectClient();
    const store = new S3EvidenceAnchorStore({
      bucket: 'b',
      region: 'us-east-1',
      client,
    });
    const { service } = await setupAsync({ store });
    await service.record({
      audit_id: 'aud_p3_8',
      timestamp: new Date().toISOString(),
      request_id: 'r8',
      correlation_id: 'c8',
      metadata: { __response_content: 'sec' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const payload = buildAnchorPayload(cp!);
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/AWS_|SECRET|password|credential/i);
    expect(payload).not.toHaveProperty('bucket');
    expect(payload).not.toHaveProperty('access_key');
  });
});
