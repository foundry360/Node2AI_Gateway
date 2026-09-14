import type { AuditEvent } from './service.js';
import type { AuditCheckpoint, CheckpointVerifier } from './checkpoint.js';
import {
  AUDIT_CANONICAL_VERSION_V1,
  verifyAuditChain,
} from './integrity.js';
import { randomUUID } from 'node:crypto';

export type AuditIntegrityStatus =
  | 'VERIFIED'
  | 'WARNING'
  | 'FAILED'
  | 'NOT_VERIFIED';

export type AuditIntegrityFailureCode =
  | 'CHAIN_BROKEN'
  | 'EVENT_HASH_MISMATCH'
  | 'SEQUENCE_GAP'
  | 'DUPLICATE_SEQUENCE'
  | 'CHECKPOINT_MISMATCH'
  | 'INVALID_CHECKPOINT_SIGNATURE'
  | 'UNKNOWN_SIGNING_KEY'
  | 'UNSUPPORTED_CANONICAL_VERSION'
  | 'DEPLOYMENT_MISMATCH'
  | 'signature_invalid'
  | 'prev_hash_mismatch'
  | 'missing_integrity_fields';

export type FullAuditVerifyResult = {
  status: AuditIntegrityStatus;
  deployment_id: string;
  events_verified: number;
  sequence_integrity: 'PASS' | 'FAIL' | 'N/A';
  chain_integrity: 'PASS' | 'FAIL';
  checkpoint_integrity: 'PASS' | 'FAIL' | 'N/A';
  signature_integrity: 'PASS' | 'FAIL';
  missing_events: number;
  modified_events: number;
  last_verified_sequence: number | null;
  last_checkpoint_at: string | null;
  verification_id: string;
  failure_codes: AuditIntegrityFailureCode[];
  broken_at_audit_id?: string;
  note?: string;
};

function mapChainReason(reason?: string): AuditIntegrityFailureCode {
  switch (reason) {
    case 'prev_hash_mismatch':
      return 'CHAIN_BROKEN';
    case 'event_hash_mismatch':
      return 'EVENT_HASH_MISMATCH';
    case 'signature_invalid':
      return 'signature_invalid';
    case 'UNSUPPORTED_CANONICAL_VERSION':
      return 'UNSUPPORTED_CANONICAL_VERSION';
    case 'missing_integrity_fields':
      return 'missing_integrity_fields';
    default:
      return 'CHAIN_BROKEN';
  }
}

export function verifySequenceIntegrity(
  events: AuditEvent[],
  deploymentId: string,
): {
  ok: boolean;
  codes: AuditIntegrityFailureCode[];
  lastSequence: number | null;
  missing: number;
} {
  const sequenced = events.filter(
    (e) =>
      e.deployment_id === deploymentId &&
      typeof e.sequence_number === 'number' &&
      e.audit_canonical_version === AUDIT_CANONICAL_VERSION_V1,
  );
  if (sequenced.length === 0) {
    return { ok: true, codes: [], lastSequence: null, missing: 0 };
  }
  const codes: AuditIntegrityFailureCode[] = [];
  const seen = new Set<number>();
  let missing = 0;
  const sorted = [...sequenced].sort(
    (a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0),
  );
  let expected = sorted[0]!.sequence_number!;
  let last = expected;
  for (const e of sorted) {
    if (e.deployment_id && e.deployment_id !== deploymentId) {
      codes.push('DEPLOYMENT_MISMATCH');
    }
    const n = e.sequence_number!;
    if (seen.has(n)) codes.push('DUPLICATE_SEQUENCE');
    seen.add(n);
    if (n !== expected) {
      if (n > expected) missing += n - expected;
      codes.push('SEQUENCE_GAP');
      expected = n;
    }
    expected = n + 1;
    last = n;
  }
  return {
    ok: codes.length === 0,
    codes: [...new Set(codes)],
    lastSequence: last,
    missing,
  };
}

export async function verifyCheckpoints(input: {
  deploymentId: string;
  events: AuditEvent[];
  checkpoints: AuditCheckpoint[];
  verifier: CheckpointVerifier | null;
}): Promise<{
  ok: boolean;
  codes: AuditIntegrityFailureCode[];
  lastCheckpointAt: string | null;
}> {
  const { deploymentId, events, checkpoints, verifier } = input;
  if (checkpoints.length === 0) {
    return { ok: true, codes: [], lastCheckpointAt: null };
  }
  const codes: AuditIntegrityFailureCode[] = [];
  const bySeq = new Map<number, AuditEvent>();
  for (const e of events) {
    if (typeof e.sequence_number === 'number') {
      bySeq.set(e.sequence_number, e);
    }
  }
  const ordered = [...checkpoints].sort(
    (a, b) => a.sequence_end - b.sequence_end,
  );
  let lastAt: string | null = null;
  for (const cp of ordered) {
    lastAt = cp.created_at;
    if (cp.deployment_id !== deploymentId) {
      codes.push('DEPLOYMENT_MISMATCH');
      continue;
    }
    const tip = bySeq.get(cp.sequence_end);
    if (!tip?.event_hash || tip.event_hash !== cp.root_hash) {
      codes.push('CHECKPOINT_MISMATCH');
    }
    if (!verifier) {
      codes.push('UNKNOWN_SIGNING_KEY');
      continue;
    }
    const valid = await verifier.verify(
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
    if (!valid) {
      // Distinguish unknown key vs bad sig when possible
      codes.push('INVALID_CHECKPOINT_SIGNATURE');
    }
  }
  return { ok: codes.length === 0, codes: [...new Set(codes)], lastCheckpointAt: lastAt };
}

export async function verifyFullAuditIntegrity(input: {
  deploymentId: string;
  events: AuditEvent[];
  checkpoints: AuditCheckpoint[];
  hmacSigningKey: string;
  checkpointVerifier: CheckpointVerifier | null;
}): Promise<FullAuditVerifyResult> {
  const verification_id = `avr_${randomUUID().replace(/-/g, '')}`;
  const failure_codes: AuditIntegrityFailureCode[] = [];

  const chain = verifyAuditChain(input.events, input.hmacSigningKey);
  const chain_integrity = chain.ok ? 'PASS' : 'FAIL';
  let sigPass: 'PASS' | 'FAIL' = 'PASS';
  if (!chain.ok && chain.reason === 'signature_invalid') sigPass = 'FAIL';
  if (!chain.ok) failure_codes.push(mapChainReason(chain.reason));

  const seq = verifySequenceIntegrity(input.events, input.deploymentId);
  if (!seq.ok) failure_codes.push(...seq.codes);
  const sequence_integrity =
    input.events.some((e) => typeof e.sequence_number === 'number')
      ? seq.ok
        ? 'PASS'
        : 'FAIL'
      : 'N/A';

  const cp = await verifyCheckpoints({
    deploymentId: input.deploymentId,
    events: input.events,
    checkpoints: input.checkpoints,
    verifier: input.checkpointVerifier,
  });
  if (!cp.ok) failure_codes.push(...cp.codes);
  const checkpoint_integrity =
    input.checkpoints.length === 0 ? 'N/A' : cp.ok ? 'PASS' : 'FAIL';

  const uniqueCodes = [...new Set(failure_codes)];
  const ok = uniqueCodes.length === 0 && chain.ok;
  const status: AuditIntegrityStatus = ok
    ? 'VERIFIED'
    : uniqueCodes.length
      ? 'FAILED'
      : 'NOT_VERIFIED';

  return {
    status,
    deployment_id: input.deploymentId,
    events_verified: chain.checked,
    sequence_integrity,
    chain_integrity,
    checkpoint_integrity,
    signature_integrity: sigPass,
    missing_events: seq.missing,
    modified_events: chain.ok ? 0 : 1,
    last_verified_sequence: seq.lastSequence,
    last_checkpoint_at: cp.lastCheckpointAt,
    verification_id,
    failure_codes: uniqueCodes,
    broken_at_audit_id: chain.broken_at_audit_id,
    note: 'Cryptographic verification is not legal/regulatory certification.',
  };
}
