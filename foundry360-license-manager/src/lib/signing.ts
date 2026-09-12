/**
 * Enigma-compatible license claims + Ed25519 (EdDSA) JWS signing.
 * Matches gateway/scripts/sign-enigma-license.mjs and provision-license.mjs.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SignJWT, importJWK, type JWK } from 'jose';

export const DEFAULT_KEY_ID = 'enigma-lic-2026-09';
export const LICENSE_VERSION = 1;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EnigmaDeploymentTypeClaim = 'vpc' | 'air_gapped';

export type EnigmaLicenseClaims = {
  license_version: number;
  license_id: string;
  customer_name: string;
  deployment_id: string;
  deployment_type: EnigmaDeploymentTypeClaim;
  valid_from: string;
  valid_until: string;
  issued_at: string;
  key_id: string;
  grace_days: number;
};

export function isValidDeploymentUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function assertDateOnly(label: string, value: string): string {
  const v = value.trim();
  if (!DATE_ONLY.test(v)) throw new Error(`${label} must be YYYY-MM-DD`);
  return v;
}

export function toEnigmaDeploymentType(
  t: 'VPC' | 'AIR_GAPPED' | string,
): EnigmaDeploymentTypeClaim {
  const v = String(t).toUpperCase().replace(/-/g, '_');
  if (v === 'VPC') return 'vpc';
  if (v === 'AIR_GAPPED' || v === 'AIRGAPPED' || v === 'AIRGAP') return 'air_gapped';
  throw new Error('deployment_type must be VPC or AIR_GAPPED');
}

export function buildEnigmaLicenseClaims(input: {
  customer_name: string;
  license_id: string;
  deployment_id: string;
  deployment_type: 'VPC' | 'AIR_GAPPED' | string;
  valid_from: string;
  valid_until: string;
  grace_days?: number;
  key_id?: string;
  issued_at?: string;
}): EnigmaLicenseClaims {
  const customer_name = input.customer_name.trim();
  const license_id = input.license_id.trim();
  const deployment_id = input.deployment_id.trim();
  if (!customer_name) throw new Error('customer_name is required');
  if (!license_id) throw new Error('license_id is required');
  if (!isValidDeploymentUuid(deployment_id)) {
    throw new Error('deployment_id must be a UUID from the Enigma installation');
  }
  const grace_days = Number(input.grace_days ?? 30);
  if (!Number.isInteger(grace_days) || grace_days < 0 || grace_days > 3650) {
    throw new Error('grace_days must be an integer 0–3650');
  }
  const key_id = (input.key_id ?? process.env.ENIGMA_LICENSE_KEY_ID ?? DEFAULT_KEY_ID).trim();
  const issued_at =
    input.issued_at?.trim() ||
    new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  return {
    license_version: LICENSE_VERSION,
    license_id,
    customer_name,
    deployment_id,
    deployment_type: toEnigmaDeploymentType(input.deployment_type),
    valid_from: assertDateOnly('valid_from', input.valid_from),
    valid_until: assertDateOnly('valid_until', input.valid_until),
    issued_at,
    key_id,
    grace_days,
  };
}

function resolvePrivateKeyPath(): string {
  const p =
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH?.trim() ||
    process.env.ENIGMA_LICENSE_SIGNING_JWK_PATH?.trim();
  if (!p) {
    throw new Error(
      'ENIGMA_LICENSE_PRIVATE_KEY_PATH is not configured (private signing key path)',
    );
  }
  return resolve(p);
}

/** Load private JWK from host path. Never log the key material. */
export function loadPrivateSigningJwk(): JWK {
  const path = resolvePrivateKeyPath();
  if (!existsSync(path)) {
    throw new Error('Private signing key file is not available');
  }
  let jwk: JWK;
  try {
    jwk = JSON.parse(readFileSync(path, 'utf8')) as JWK;
  } catch {
    throw new Error('Private signing key file is malformed');
  }
  const rec = jwk as unknown as Record<string, unknown>;
  if (typeof rec.d !== 'string' || !rec.d) {
    throw new Error('Signing JWK must include private field d');
  }
  return jwk;
}

export async function signEnigmaLicenseClaims(
  claims: EnigmaLicenseClaims,
): Promise<{ token: string; sha256: string }> {
  const jwk = loadPrivateSigningJwk();
  const keyId = claims.key_id;
  const jwkKid = (jwk as { kid?: string }).kid;
  if (jwkKid && jwkKid !== keyId) {
    throw new Error('Unsupported key ID for configured signing key');
  }
  const key = await importJWK(jwk, 'EdDSA');
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({
      alg: 'EdDSA',
      kid: keyId,
      typ: 'enigma-license+jwt',
    })
    .sign(key);
  const sha256 = createHash('sha256').update(token, 'utf8').digest('hex');
  return { token, sha256 };
}

export function artifactDir(): string {
  return resolve(process.env.ARTIFACT_DIR || './artifacts');
}

export function writeLicenseArtifact(
  licenseId: string,
  token: string,
): { path: string; filename: string } {
  const dir = artifactDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const safe = licenseId.replace(/[^A-Za-z0-9._-]/g, '_');
  const path = join(dir, `${safe}.license`);
  writeFileSync(path, token + '\n', { mode: 0o600 });
  return { path, filename: 'enigma.license' };
}

export function readLicenseArtifact(path: string): string {
  return readFileSync(path, 'utf8').trim();
}
