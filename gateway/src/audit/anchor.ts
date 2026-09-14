import { createHash, randomUUID } from 'node:crypto';
import type { AuditCheckpoint } from './checkpoint.js';
import {
  createJoseCheckpointVerifier,
  type CheckpointVerifier,
} from './checkpoint.js';
import type { JWK } from 'jose';

export const ANCHOR_VERSION = 1;

export type AnchorStatus = 'PENDING' | 'ANCHORED' | 'VERIFIED' | 'FAILED';
export type AnchorType = 'FILESYSTEM' | 'S3_OBJECT_LOCK' | 'OFFLINE';

/** Externally anchored cryptographic statement (no secrets / PHI). */
export type EvidenceAnchorPayload = {
  anchor_version: typeof ANCHOR_VERSION;
  deployment_id: string;
  checkpoint_id: string;
  sequence_start: number;
  sequence_end: number;
  event_count: number;
  root_hash: string;
  canonical_version: number;
  key_id: string;
  checkpoint_signature: string;
  created_at: string;
};

/** Append-only history row for an anchoring attempt. */
export type EvidenceAnchorRecord = {
  anchor_record_id: string;
  anchor_id: string;
  deployment_id: string;
  checkpoint_id: string;
  sequence_start: number;
  sequence_end: number;
  event_count: number;
  root_hash: string;
  checkpoint_signature: string;
  checkpoint_key_id: string;
  canonical_version: number;
  recorded_at: string;
  anchored_at: string | null;
  anchor_type: AnchorType;
  anchor_uri: string | null;
  anchor_hash: string | null;
  anchor_status: AnchorStatus;
  failure_code: string | null;
  payload_json: EvidenceAnchorPayload;
};

export type PutAnchorResult =
  | { ok: true; uri: string; hash: string }
  | { ok: false; code: 'ANCHOR_CONFLICT' | 'STORE_UNAVAILABLE'; message: string };

export interface EvidenceAnchorStore {
  readonly provider: AnchorType;
  objectPath(deploymentId: string, sequenceEnd: number, checkpointId: string): string;
  putAnchor(path: string, payload: EvidenceAnchorPayload): Promise<PutAnchorResult>;
  getAnchor(uri: string): Promise<{ payload: EvidenceAnchorPayload; hash: string } | null>;
  exists(path: string): Promise<boolean>;
}

export function buildAnchorPayload(cp: AuditCheckpoint): EvidenceAnchorPayload {
  return {
    anchor_version: ANCHOR_VERSION,
    deployment_id: cp.deployment_id,
    checkpoint_id: cp.checkpoint_id,
    sequence_start: cp.sequence_start,
    sequence_end: cp.sequence_end,
    event_count: cp.event_count,
    root_hash: cp.root_hash,
    canonical_version: cp.canonical_version,
    key_id: cp.key_id,
    checkpoint_signature: cp.signature,
    created_at: cp.created_at,
  };
}

export function canonicalAnchorJson(payload: EvidenceAnchorPayload): string {
  return JSON.stringify({
    anchor_version: payload.anchor_version,
    deployment_id: payload.deployment_id,
    checkpoint_id: payload.checkpoint_id,
    sequence_start: payload.sequence_start,
    sequence_end: payload.sequence_end,
    event_count: payload.event_count,
    root_hash: payload.root_hash,
    canonical_version: payload.canonical_version,
    key_id: payload.key_id,
    checkpoint_signature: payload.checkpoint_signature,
    created_at: payload.created_at,
  });
}

export function hashAnchorPayload(payload: EvidenceAnchorPayload): string {
  return createHash('sha256')
    .update(canonicalAnchorJson(payload), 'utf8')
    .digest('hex');
}

export function defaultObjectPath(
  deploymentId: string,
  sequenceEnd: number,
  checkpointId: string,
): string {
  return `enigma/deployments/${deploymentId}/audit/checkpoints/${sequenceEnd}-${checkpointId}.json`;
}

export function newAnchorId(): string {
  return `aea_${randomUUID().replace(/-/g, '')}`;
}

export function newAnchorRecordId(): string {
  return `aer_${randomUUID().replace(/-/g, '')}`;
}

export type IndependentAnchorVerifyResult = {
  status: 'VERIFIED' | 'FAILED';
  deployment_id: string;
  checkpoint_id: string;
  sequence_end: number;
  signature: 'VALID' | 'INVALID' | 'UNKNOWN_KEY';
  root_hash: 'MATCH' | 'N/A';
  failure_codes: string[];
};

/**
 * Independent verifier: anchor artifact + public JWKS only.
 * No DB, HMAC secret, private key, or Enigma runtime.
 */
export async function verifyIndependentAnchor(input: {
  payload: EvidenceAnchorPayload;
  publicJwks: Map<string, JWK> | CheckpointVerifier;
}): Promise<IndependentAnchorVerifyResult> {
  const p = input.payload;
  const failure_codes: string[] = [];
  let signature: IndependentAnchorVerifyResult['signature'] = 'INVALID';

  const verifier: CheckpointVerifier =
    typeof (input.publicJwks as CheckpointVerifier).verify === 'function'
      ? (input.publicJwks as CheckpointVerifier)
      : createJoseCheckpointVerifier(input.publicJwks as Map<string, JWK>);

  if (p.anchor_version !== ANCHOR_VERSION) {
    failure_codes.push('UNSUPPORTED_ANCHOR_VERSION');
  }

  const checkpointFields = {
    checkpoint_id: p.checkpoint_id,
    deployment_id: p.deployment_id,
    sequence_start: p.sequence_start,
    sequence_end: p.sequence_end,
    event_count: p.event_count,
    root_hash: p.root_hash,
    created_at: p.created_at,
    key_id: p.key_id,
    canonical_version: p.canonical_version,
  };

  let valid = false;
  try {
    valid = await verifier.verify(
      checkpointFields,
      p.checkpoint_signature,
      p.key_id,
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    // Distinguish unknown key when JWKS map provided
    if (
      input.publicJwks instanceof Map &&
      !input.publicJwks.has(p.key_id)
    ) {
      signature = 'UNKNOWN_KEY';
      failure_codes.push('UNKNOWN_SIGNING_KEY');
    } else {
      signature = 'INVALID';
      failure_codes.push('SIGNATURE_INVALID');
    }
  } else {
    signature = 'VALID';
  }

  return {
    status: failure_codes.length === 0 ? 'VERIFIED' : 'FAILED',
    deployment_id: p.deployment_id,
    checkpoint_id: p.checkpoint_id,
    sequence_end: p.sequence_end,
    signature,
    root_hash: 'MATCH',
    failure_codes,
  };
}

export type AnchorCompareResult = {
  status: 'VERIFIED' | 'FAILED';
  deployment_id: string;
  checkpoint_id: string;
  sequence_end: number;
  signature: 'VALID' | 'INVALID' | 'UNKNOWN_KEY';
  root_hash: 'MATCH' | 'MISMATCH';
  external_anchor: 'MATCH' | 'MISMATCH' | 'NOT_FOUND';
  failure_codes: string[];
};

/** Compare Enigma checkpoint vs external anchor. */
export async function verifyCheckpointAgainstAnchor(input: {
  checkpoint: AuditCheckpoint;
  external: EvidenceAnchorPayload | null;
  externalHash?: string | null;
  expectedHash?: string | null;
  publicJwks: Map<string, JWK> | CheckpointVerifier;
}): Promise<AnchorCompareResult> {
  const codes: string[] = [];
  const cp = input.checkpoint;

  if (!input.external) {
    return {
      status: 'FAILED',
      deployment_id: cp.deployment_id,
      checkpoint_id: cp.checkpoint_id,
      sequence_end: cp.sequence_end,
      signature: 'INVALID',
      root_hash: 'MISMATCH',
      external_anchor: 'NOT_FOUND',
      failure_codes: ['ANCHOR_NOT_FOUND'],
    };
  }

  const ext = input.external;
  if (ext.deployment_id !== cp.deployment_id) codes.push('DEPLOYMENT_MISMATCH');
  if (ext.checkpoint_id !== cp.checkpoint_id) codes.push('CHECKPOINT_MISMATCH');
  if (ext.sequence_start !== cp.sequence_start || ext.sequence_end !== cp.sequence_end) {
    codes.push('CHECKPOINT_MISMATCH');
  }
  if (ext.event_count !== cp.event_count) codes.push('CHECKPOINT_MISMATCH');
  if (ext.root_hash !== cp.root_hash) codes.push('ROOT_HASH_MISMATCH');
  if (ext.canonical_version !== cp.canonical_version) codes.push('CHECKPOINT_MISMATCH');
  if (ext.key_id !== cp.key_id) codes.push('CHECKPOINT_MISMATCH');
  if (ext.checkpoint_signature !== cp.signature) codes.push('ANCHOR_CONTENT_MISMATCH');

  if (
    input.expectedHash &&
    input.externalHash &&
    input.expectedHash !== input.externalHash
  ) {
    codes.push('ANCHOR_HASH_MISMATCH');
  }

  const indep = await verifyIndependentAnchor({
    payload: ext,
    publicJwks: input.publicJwks,
  });
  if (indep.status !== 'VERIFIED') {
    codes.push(...indep.failure_codes);
  }

  const unique = [...new Set(codes)];
  return {
    status: unique.length === 0 ? 'VERIFIED' : 'FAILED',
    deployment_id: cp.deployment_id,
    checkpoint_id: cp.checkpoint_id,
    sequence_end: cp.sequence_end,
    signature: indep.signature,
    root_hash: ext.root_hash === cp.root_hash ? 'MATCH' : 'MISMATCH',
    external_anchor: unique.includes('ANCHOR_NOT_FOUND')
      ? 'NOT_FOUND'
      : unique.some((c) =>
            c === 'ANCHOR_CONTENT_MISMATCH' ||
            c === 'ANCHOR_HASH_MISMATCH' ||
            c === 'ROOT_HASH_MISMATCH',
          )
        ? 'MISMATCH'
        : 'MATCH',
    failure_codes: unique,
  };
}
