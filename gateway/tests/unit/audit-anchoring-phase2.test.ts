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
import { EvidenceAnchoringService } from '../../src/audit/anchoring-service.js';
import {
  buildAnchorPayload,
  verifyIndependentAnchor,
} from '../../src/audit/anchor.js';
import { buildEvidencePackage } from '../../src/audit/evidence.js';

const HMAC_KEY = 'test-audit-hmac-phase2';
const DEPLOYMENT = '22222222-2222-4222-8222-222222222222';

async function setup(opts?: { autoAnchor?: boolean; fsRoot?: string }) {
  const pair = generateEphemeralCheckpointKeyPair('phase2-cp');
  const pubs = new Map([[pair.keyId, pair.publicJwk]]);
  const verifier = createJoseCheckpointVerifier(pubs);
  const signer = createJoseCheckpointSigner(pair.privateJwk, pair.keyId);
  const store = opts?.fsRoot
    ? new FilesystemEvidenceAnchorStore(opts.fsRoot)
    : new InMemoryEvidenceAnchorStore();
  const repo = new InMemoryEvidenceAnchorRepository();
  const anchoring = new EvidenceAnchoringService(store, repo, pubs);
  const service = new IntegrityAuditService(new InMemoryAuditService(), HMAC_KEY, {
    deploymentId: DEPLOYMENT,
    sequenceAllocator: new InMemoryAuditSequenceAllocator(),
    checkpointStore: new InMemoryCheckpointStore(),
    checkpointSigner: signer,
    checkpointVerifier: verifier,
    enableCanonicalV1: true,
    checkpointEveryEvents: 0,
    anchoring,
    anchorOnCheckpoint: opts?.autoAnchor ?? false,
  });
  return { service, anchoring, store, pubs, pair };
}

describe('Audit Integrity Phase 2 — Evidence Anchoring', () => {
  it('anchors a signed checkpoint and independently verifies without HMAC/DB', async () => {
    const { service, anchoring, pubs } = await setup();
    await service.record({
      audit_id: 'aud_a1',
      timestamp: new Date().toISOString(),
      request_id: 'r1',
      correlation_id: 'c1',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      reason_codes: [],
      metadata: { __response_content: 'ok' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    expect(cp).toBeTruthy();
    const result = await anchoring.anchorCheckpoint(cp!);
    expect(result.ok).toBe(true);
    expect(['ANCHORED', 'VERIFIED']).toContain(result.status);

    const indep = await verifyIndependentAnchor({
      payload: buildAnchorPayload(cp!),
      publicJwks: pubs,
    });
    expect(indep.status).toBe('VERIFIED');
    expect(indep.signature).toBe('VALID');
  });

  it('detects anchor conflict on different content at same path', async () => {
    const { service, anchoring, store } = await setup();
    await service.record({
      audit_id: 'aud_a2',
      timestamp: new Date().toISOString(),
      request_id: 'r2',
      correlation_id: 'c2',
      metadata: { __response_content: 'x' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const first = await anchoring.anchorCheckpoint(cp!);
    expect(first.ok).toBe(true);

    const path = store.objectPath(DEPLOYMENT, cp!.sequence_end, cp!.checkpoint_id);
    const conflict = await store.putAnchor(path, {
      ...buildAnchorPayload(cp!),
      root_hash: '0'.repeat(64),
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe('ANCHOR_CONFLICT');
  });

  it('duplicate anchor of same checkpoint is safe', async () => {
    const { service, anchoring } = await setup();
    await service.record({
      audit_id: 'aud_a3',
      timestamp: new Date().toISOString(),
      request_id: 'r3',
      correlation_id: 'c3',
      metadata: { __response_content: 'y' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const a = await anchoring.anchorCheckpoint(cp!);
    const b = await anchoring.anchorCheckpoint(cp!);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('filesystem air-gap anchor write + offline verify', async () => {
    const root = mkdtempSync(join(tmpdir(), 'enigma-anchor-'));
    try {
      const { service, anchoring, store, pubs } = await setup({ fsRoot: root });
      await service.record({
        audit_id: 'aud_a4',
        timestamp: new Date().toISOString(),
        request_id: 'r4',
        correlation_id: 'c4',
        metadata: { __response_content: 'z' },
      });
      const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
      const result = await anchoring.anchorCheckpoint(cp!);
      expect(result.ok).toBe(true);
      expect(result.uri?.startsWith('file://')).toBe(true);

      const loaded = await store.getAnchor(result.uri!);
      expect(loaded).toBeTruthy();
      const indep = await verifyIndependentAnchor({
        payload: loaded!.payload,
        publicJwks: pubs,
      });
      expect(indep.status).toBe('VERIFIED');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('anchoring failure does not affect audit seal / governance record', async () => {
    const pair = generateEphemeralCheckpointKeyPair('fail-cp');
    const pubs = new Map([[pair.keyId, pair.publicJwk]]);
    const brokenStore = new InMemoryEvidenceAnchorStore();
    brokenStore.putAnchor = async () => ({
      ok: false,
      code: 'STORE_UNAVAILABLE',
      message: 'down',
    });
    const anchoring = new EvidenceAnchoringService(
      brokenStore,
      new InMemoryEvidenceAnchorRepository(),
      pubs,
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
    const sealed = await service.record({
      audit_id: 'aud_a5',
      timestamp: new Date().toISOString(),
      request_id: 'r5',
      correlation_id: 'c5',
      metadata: { __response_content: 'still ok' },
    });
    expect(sealed.event_hash).toBeTruthy();
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    expect(cp).toBeTruthy();
    const chain = await service.verifyIntegrity();
    expect(chain.ok).toBe(true);
  });

  it('evidence export includes anchors.json data', async () => {
    const { service, anchoring } = await setup();
    await service.record({
      audit_id: 'aud_a6',
      timestamp: new Date().toISOString(),
      request_id: 'r6',
      correlation_id: 'c6',
      metadata: { __response_content: 'export' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    await anchoring.anchorCheckpoint(cp!);
    const rows = await anchoring.list(DEPLOYMENT);
    const pkg = buildEvidencePackage({
      deploymentId: DEPLOYMENT,
      events: await service.list(),
      checkpoints: await service.listCheckpoints(DEPLOYMENT),
      anchors: rows
        .filter((r) => r.anchor_status === 'ANCHORED' || r.anchor_status === 'VERIFIED')
        .map((r) => ({
          checkpoint_id: r.checkpoint_id,
          anchor_status: r.anchor_status,
          anchor_type: r.anchor_type,
          anchor_uri: r.anchor_uri,
          sequence_end: r.sequence_end,
        })),
    });
    expect(pkg.anchors.length).toBeGreaterThan(0);
    expect(pkg.anchors[0]!.checkpoint_id).toBe(cp!.checkpoint_id);
  });

  it('rejects independent verify with wrong public key', async () => {
    const { service } = await setup();
    await service.record({
      audit_id: 'aud_a7',
      timestamp: new Date().toISOString(),
      request_id: 'r7',
      correlation_id: 'c7',
      metadata: { __response_content: 'badkey' },
    });
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const other = generateEphemeralCheckpointKeyPair('other');
    const indep = await verifyIndependentAnchor({
      payload: buildAnchorPayload(cp!),
      publicJwks: new Map([[other.keyId, other.publicJwk]]),
    });
    expect(indep.status).toBe('FAILED');
  });
});
