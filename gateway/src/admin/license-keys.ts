/**
 * Public verification keyring for Enigma signed licenses (runtime only).
 *
 * Private signing keys MUST NEVER appear in this repository, Docker images,
 * Compose files, customer packages, admin APIs, or logs.
 *
 * Vendor operators sign offline with a private JWK loaded from an external path
 * (see gateway/scripts/sign-enigma-license.mjs and license-signing/README.md).
 *
 * Key rotation: add a new public entry, ship a Gateway build, continue accepting
 * licenses signed with still-listed key_ids until those licenses expire + grace.
 */

import type { JWK } from 'jose';

export type LicensePublicKeyEntry = {
  key_id: string;
  /** Ed25519 public JWK (OKP / Ed25519). Must not include private field `d`. */
  jwk: JWK;
};

/**
 * Production verification keyring — keyed by license claim `key_id`.
 *
 * `enigma-lic-2026-09` is the commercial production verification key.
 * The matching private key is held only in vendor signing custody (outside git).
 *
 * Retired demo key `enigma-lic-2026-01` is intentionally absent.
 */
export const LICENSE_PUBLIC_KEYRING: readonly LicensePublicKeyEntry[] = [
  {
    key_id: 'enigma-lic-2026-09',
    jwk: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'ZV7NVF8zQIDDbucDxIkIk2afI_JDXtQo8LB3yI7eIeM',
      kid: 'enigma-lic-2026-09',
      alg: 'EdDSA',
    },
  },
];

/** Assert keyring entries never include private material (defense in depth). */
export function assertPublicKeyringSafe(
  keyring: readonly LicensePublicKeyEntry[] = LICENSE_PUBLIC_KEYRING,
): void {
  for (const entry of keyring) {
    const jwk = entry.jwk as unknown as Record<string, unknown>;
    if (typeof jwk.d === 'string' && jwk.d.length > 0) {
      throw new Error(
        `License keyring entry ${entry.key_id} must not contain private field d`,
      );
    }
  }
}

export function lookupLicensePublicKey(
  keyId: string,
  keyring: readonly LicensePublicKeyEntry[] = LICENSE_PUBLIC_KEYRING,
): LicensePublicKeyEntry | null {
  const id = keyId.trim();
  return keyring.find((e) => e.key_id === id) ?? null;
}

// Fail fast if a private field is ever introduced into the shipping keyring.
assertPublicKeyringSafe();
