import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { SignJWT, compactVerify, importJWK, type JWK } from 'jose';

export type AuditCheckpoint = {
  checkpoint_id: string;
  deployment_id: string;
  sequence_start: number;
  sequence_end: number;
  event_count: number;
  root_hash: string;
  created_at: string;
  key_id: string;
  signature: string;
  canonical_version: number;
};

export type CheckpointSigner = {
  keyId: string;
  sign(payload: Record<string, unknown>): Promise<string>;
};

export type CheckpointVerifier = {
  verify(
    payload: Record<string, unknown>,
    signature: string,
    keyId: string,
  ): Promise<boolean>;
};

/** Canonical JSON for checkpoint signing (fixed key order). */
export function canonicalCheckpointPayload(cp: {
  checkpoint_id: string;
  deployment_id: string;
  sequence_start: number;
  sequence_end: number;
  event_count: number;
  root_hash: string;
  created_at: string;
  key_id: string;
  canonical_version: number;
}): string {
  return JSON.stringify({
    canonical_version: cp.canonical_version,
    checkpoint_id: cp.checkpoint_id,
    deployment_id: cp.deployment_id,
    sequence_start: cp.sequence_start,
    sequence_end: cp.sequence_end,
    event_count: cp.event_count,
    root_hash: cp.root_hash,
    created_at: cp.created_at,
    key_id: cp.key_id,
  });
}

export function checkpointContentHash(canonicalJson: string): string {
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

async function jwkFromPrivatePemOrJwk(raw: string): Promise<JWK> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as JWK;
  }
  // Expect JWK JSON file contents only for Phase 1 (Ed25519 JWK).
  throw new Error('Audit checkpoint private key must be an Ed25519 JWK JSON document');
}

export async function loadCheckpointPrivateJwk(
  pathOrJson: string | undefined,
): Promise<{ jwk: JWK; keyId: string } | null> {
  if (!pathOrJson?.trim()) return null;
  const raw = existsSync(pathOrJson)
    ? readFileSync(pathOrJson, 'utf8')
    : pathOrJson;
  const jwk = await jwkFromPrivatePemOrJwk(raw);
  if (jwk.crv !== 'Ed25519' && jwk.kty !== 'OKP') {
    throw new Error('Audit checkpoint key must be Ed25519 (OKP)');
  }
  const keyId = String(jwk.kid ?? 'enigma-audit-checkpoint-1');
  return { jwk: { ...jwk, kid: keyId }, keyId };
}

export async function loadCheckpointPublicJwks(
  pathOrJson: string | undefined,
): Promise<Map<string, JWK>> {
  const map = new Map<string, JWK>();
  if (!pathOrJson?.trim()) return map;
  const raw = existsSync(pathOrJson)
    ? readFileSync(pathOrJson, 'utf8')
    : pathOrJson;
  const parsed = JSON.parse(raw) as JWK | { keys: JWK[] };
  const keys = 'keys' in parsed ? parsed.keys : [parsed];
  for (const k of keys) {
    const kid = String(k.kid ?? 'enigma-audit-checkpoint-1');
    map.set(kid, { ...k, kid });
  }
  return map;
}

/** Generate ephemeral Ed25519 pair for tests (never use in production). */
export function generateEphemeralCheckpointKeyPair(keyId = 'test-audit-cp-1'): {
  privateJwk: JWK;
  publicJwk: JWK;
  keyId: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  // Node exports as KeyObject — use jose-compatible JWK via export
  const priv = privateKey.export({ format: 'jwk' }) as JWK;
  const pub = publicKey.export({ format: 'jwk' }) as JWK;
  priv.kid = keyId;
  pub.kid = keyId;
  priv.alg = 'EdDSA';
  pub.alg = 'EdDSA';
  return { privateJwk: priv, publicJwk: pub, keyId };
}

export function createJoseCheckpointSigner(privateJwk: JWK, keyId: string): CheckpointSigner {
  return {
    keyId,
    async sign(payload: Record<string, unknown>): Promise<string> {
      const key = await importJWK(privateJwk, 'EdDSA');
      return new SignJWT(payload as Record<string, unknown>)
        .setProtectedHeader({ alg: 'EdDSA', kid: keyId, typ: 'enigma-audit-checkpoint' })
        .sign(key);
    },
  };
}

export function createJoseCheckpointVerifier(
  publicByKid: Map<string, JWK>,
): CheckpointVerifier {
  return {
    async verify(payload, signature, keyId): Promise<boolean> {
      const jwk = publicByKid.get(keyId);
      if (!jwk) return false;
      try {
        const key = await importJWK(jwk, 'EdDSA');
        const { payload: verified } = await compactVerify(signature, key);
        const text = new TextDecoder().decode(verified);
        const parsed = JSON.parse(text) as Record<string, unknown>;
        // Compare content hash of expected payload vs embedded claims
        const expected = checkpointContentHash(
          canonicalCheckpointPayload(payload as Parameters<typeof canonicalCheckpointPayload>[0]),
        );
        const got = String(parsed.content_hash ?? '');
        return expected === got && String(parsed.key_id) === keyId;
      } catch {
        return false;
      }
    },
  };
}

export async function buildSignedCheckpoint(input: {
  deploymentId: string;
  sequenceStart: number;
  sequenceEnd: number;
  eventCount: number;
  rootHash: string;
  signer: CheckpointSigner;
  canonicalVersion?: number;
}): Promise<AuditCheckpoint> {
  const created_at = new Date().toISOString();
  const checkpoint_id = `acp_${randomUUID().replace(/-/g, '')}`;
  const canonical_version = input.canonicalVersion ?? 1;
  const unsigned = {
    checkpoint_id,
    deployment_id: input.deploymentId,
    sequence_start: input.sequenceStart,
    sequence_end: input.sequenceEnd,
    event_count: input.eventCount,
    root_hash: input.rootHash,
    created_at,
    key_id: input.signer.keyId,
    canonical_version,
  };
  const content_hash = checkpointContentHash(canonicalCheckpointPayload(unsigned));
  const signature = await input.signer.sign({
    content_hash,
    key_id: input.signer.keyId,
    checkpoint_id,
    deployment_id: input.deploymentId,
    sequence_start: input.sequenceStart,
    sequence_end: input.sequenceEnd,
    root_hash: input.rootHash,
  });
  return { ...unsigned, signature };
}

export async function exportPublicJwkFromPrivate(privateJwk: JWK): Promise<JWK> {
  const { d: _omit, ...pub } = privateJwk;
  return { ...pub, kid: privateJwk.kid, alg: 'EdDSA' };
}
