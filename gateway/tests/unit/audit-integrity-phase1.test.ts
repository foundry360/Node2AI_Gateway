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
  AUDIT_CANONICAL_VERSION_V1,
  GENESIS_PREV,
  canonicalEventPayload,
  canonicalEventPayloadLegacy,
  computeEventHash,
  verifyAuditChain,
} from '../../src/audit/integrity.js';
import {
  createJoseCheckpointSigner,
  createJoseCheckpointVerifier,
  generateEphemeralCheckpointKeyPair,
} from '../../src/audit/checkpoint.js';
import {
  buildEvidencePackage,
  verifyEvidencePackage,
} from '../../src/audit/evidence.js';
import { verifySequenceIntegrity } from '../../src/audit/verify.js';

const HMAC_KEY = 'test-audit-hmac-key';
const DEPLOYMENT = '11111111-1111-4111-8111-111111111111';

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
    metadata: { __response_content: 'hello world' },
    ...overrides,
  };
}

async function makeV1Service(every = 0) {
  const pair = generateEphemeralCheckpointKeyPair('test-cp-1');
  const signer = createJoseCheckpointSigner(pair.privateJwk, pair.keyId);
  const verifier = createJoseCheckpointVerifier(
    new Map([[pair.keyId, pair.publicJwk]]),
  );
  const store = new InMemoryCheckpointStore();
  const allocator = new InMemoryAuditSequenceAllocator();
  const service = new IntegrityAuditService(new InMemoryAuditService(), HMAC_KEY, {
    deploymentId: DEPLOYMENT,
    sequenceAllocator: allocator,
    checkpointStore: store,
    checkpointSigner: signer,
    checkpointVerifier: verifier,
    enableCanonicalV1: true,
    checkpointEveryEvents: every,
  });
  return { service, store, verifier, pair };
}

describe('Audit Integrity Phase 1', () => {
  it('preserves legacy canonical hash semantics', () => {
    const input = {
      audit_id: 'a1',
      timestamp: '2026-01-01T00:00:00.000Z',
      request_id: 'r1',
      correlation_id: 'c1',
      response_hash: 'abc',
      prev_event_hash: GENESIS_PREV,
    };
    expect(canonicalEventPayload(input)).toBe(canonicalEventPayloadLegacy(input));
  });

  it('seals v1 events with sequence + deployment and verifies chain', async () => {
    const { service } = await makeV1Service();
    const a = await service.record(baseEvent());
    const b = await service.record(baseEvent());
    expect(a.audit_canonical_version).toBe(AUDIT_CANONICAL_VERSION_V1);
    expect(a.deployment_id).toBe(DEPLOYMENT);
    expect(a.sequence_number).toBe(1);
    expect(b.sequence_number).toBe(2);
    expect(b.prev_event_hash).toBe(a.event_hash);
    expect(a.prev_event_hash).toBe(GENESIS_PREV);

    const chain = await service.verifyIntegrity();
    expect(chain.ok).toBe(true);
    expect(chain.checked).toBe(2);

    const full = await service.verifyFull(DEPLOYMENT);
    expect(full.status).toBe('VERIFIED');
    expect(full.sequence_integrity).toBe('PASS');
    expect(full.chain_integrity).toBe('PASS');
  });

  it('detects event hash tampering', async () => {
    const { service } = await makeV1Service();
    await service.record(baseEvent());
    const events = await service.list();
    events[0]!.reason_codes = ['TAMPERED'];
    const result = verifyAuditChain(events, HMAC_KEY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('event_hash_mismatch');
  });

  it('detects previous hash tampering', async () => {
    const { service } = await makeV1Service();
    await service.record(baseEvent());
    await service.record(baseEvent());
    const events = await service.list();
    events[1]!.prev_event_hash = GENESIS_PREV;
    const result = verifyAuditChain(events, HMAC_KEY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('prev_hash_mismatch');
  });

  it('detects sequence gaps and duplicates', () => {
    const events: AuditEvent[] = [
      {
        ...baseEvent(),
        deployment_id: DEPLOYMENT,
        sequence_number: 1,
        audit_canonical_version: 1,
        response_hash: 'x',
        prev_event_hash: GENESIS_PREV,
        event_hash: 'h1',
        integrity_signature: 's',
      },
      {
        ...baseEvent(),
        deployment_id: DEPLOYMENT,
        sequence_number: 3,
        audit_canonical_version: 1,
        response_hash: 'x',
        prev_event_hash: 'h1',
        event_hash: 'h3',
        integrity_signature: 's',
      },
    ];
    const gap = verifySequenceIntegrity(events, DEPLOYMENT);
    expect(gap.ok).toBe(false);
    expect(gap.codes).toContain('SEQUENCE_GAP');

    events[1]!.sequence_number = 1;
    const dup = verifySequenceIntegrity(events, DEPLOYMENT);
    expect(dup.ok).toBe(false);
    expect(dup.codes).toContain('DUPLICATE_SEQUENCE');
  });

  it('allocates concurrent sequences without duplicates', async () => {
    const allocator = new InMemoryAuditSequenceAllocator();
    const nums = await Promise.all(
      Array.from({ length: 50 }, () => allocator.nextSequence(DEPLOYMENT)),
    );
    expect(new Set(nums).size).toBe(50);
    expect(Math.max(...nums)).toBe(50);
  });

  it('creates and verifies signed checkpoints', async () => {
    const { service, store } = await makeV1Service(0);
    await service.record(baseEvent());
    await service.record(baseEvent());
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    expect(cp).toBeTruthy();
    expect(cp!.root_hash).toBe((await service.list()).at(-1)!.event_hash);
    const listed = await store.list(DEPLOYMENT);
    expect(listed).toHaveLength(1);

    const full = await service.verifyFull(DEPLOYMENT);
    expect(full.status).toBe('VERIFIED');
    expect(full.checkpoint_integrity).toBe('PASS');
  });

  it('fails checkpoint verification on root mismatch', async () => {
    const { service } = await makeV1Service(0);
    await service.record(baseEvent());
    const cp = await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    expect(cp).toBeTruthy();
    const events = await service.list();
    // Mutate checkpoint store tip mismatch by altering event hash in verify input
    events[0]!.event_hash = '0'.repeat(64);
    const full = await service.verifyFull(DEPLOYMENT);
    // chain fails first
    expect(full.status).toBe('FAILED');
  });

  it('auto-checkpoints after threshold', async () => {
    const { service, store } = await makeV1Service(2);
    await service.record(baseEvent());
    expect(await store.list(DEPLOYMENT)).toHaveLength(0);
    await service.record(baseEvent());
    expect(await store.list(DEPLOYMENT)).toHaveLength(1);
  });

  it('exports evidence package that independently verifies', async () => {
    const { service, verifier } = await makeV1Service(0);
    await service.record(baseEvent());
    await service.record(baseEvent());
    await service.createCheckpoint({ deploymentId: DEPLOYMENT });
    const pkg = buildEvidencePackage({
      deploymentId: DEPLOYMENT,
      events: await service.list(),
      checkpoints: await service.listCheckpoints(DEPLOYMENT),
    });
    expect(pkg.manifest.event_count).toBe(2);
    expect(pkg.manifest.root_hash).toBeTruthy();
    expect(pkg.exportEvents[0]).not.toHaveProperty('metadata');

    const result = await verifyEvidencePackage({
      pkg,
      hmacSigningKey: HMAC_KEY,
      checkpointVerifier: verifier,
    });
    expect(result.status).toBe('VERIFIED');

    pkg.events[0]!.event_hash = 'deadbeef';
    const bad = await verifyEvidencePackage({
      pkg,
      hmacSigningKey: HMAC_KEY,
      checkpointVerifier: verifier,
    });
    expect(bad.status).toBe('FAILED');
  });

  it('recomputes v1 event hash from canonical fields', async () => {
    const { service } = await makeV1Service();
    const sealed = await service.record(baseEvent());
    const payload = canonicalEventPayload({
      audit_id: sealed.audit_id,
      timestamp: sealed.timestamp,
      request_id: sealed.request_id,
      correlation_id: sealed.correlation_id,
      organization_id: sealed.organization_id,
      application_id: sealed.application_id,
      user_id: sealed.user_id,
      operation: sealed.operation,
      policy_decision: sealed.policy_decision,
      response_decision: sealed.response_decision,
      model_selected: sealed.model_selected,
      provider: sealed.provider,
      reason_codes: sealed.reason_codes,
      evaluation_id: sealed.evaluation_id,
      decision_hash: sealed.decision_hash,
      response_hash: sealed.response_hash!,
      prev_event_hash: sealed.prev_event_hash!,
      deployment_id: sealed.deployment_id,
      sequence_number: sealed.sequence_number,
      audit_canonical_version: sealed.audit_canonical_version,
      input_hash: sealed.input_hash,
    });
    expect(computeEventHash(payload)).toBe(sealed.event_hash);
  });
});
