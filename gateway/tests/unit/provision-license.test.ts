/**
 * Foundry360 provision-license.mjs wrapper tests (vendor-side only).
 * Uses ephemeral signing keys — never the production private key.
 */
import { describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair } from 'jose';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildLicenseClaims,
  provisionSignedLicense,
} from '../../scripts/provision-license.mjs';
import { LICENSE_PUBLIC_KEYRING } from '../../src/admin/license-keys.js';

const DEPLOYMENT = '7b4f9e2a-1111-4111-8111-111111111111';

async function writeEphemeralSigningKey(dir: string, kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const priv = await exportJWK(privateKey);
  const pub = await exportJWK(publicKey);
  priv.kid = kid;
  priv.alg = 'EdDSA';
  pub.kid = kid;
  pub.alg = 'EdDSA';
  const path = join(dir, `${kid}.private.jwk`);
  await writeFile(path, JSON.stringify(priv, null, 2), { mode: 0o600 });
  return { path, priv, pub };
}

describe('provision-license claims', () => {
  it('passes through License ID, Deployment ID, dates, type, grace', () => {
    const claims = buildLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-001',
      deployment_id: DEPLOYMENT,
      deployment_type: 'vpc',
      valid_from: '2026-10-01',
      valid_until: '2027-09-30',
      grace_days: 30,
      key_id: 'enigma-lic-2026-09',
      issued_at: '2026-10-01T00:00:00Z',
    });
    expect(claims.license_version).toBe(1);
    expect(claims.license_id).toBe('ENIGMA-ACME-001');
    expect(claims.deployment_id).toBe(DEPLOYMENT);
    expect(claims.customer_name).toBe('Acme Health');
    expect(claims.deployment_type).toBe('vpc');
    expect(claims.valid_from).toBe('2026-10-01');
    expect(claims.valid_until).toBe('2027-09-30');
    expect(claims.grace_days).toBe(30);
    expect(claims.key_id).toBe('enigma-lic-2026-09');
    expect(claims.issued_at).toBe('2026-10-01T00:00:00Z');
  });

  it('normalizes air-gapped deployment type', () => {
    const claims = buildLicenseClaims({
      customer_name: 'Air Org',
      license_id: 'ENIGMA-AIR-001',
      deployment_id: DEPLOYMENT,
      deployment_type: 'air-gapped',
      valid_from: '2026-01-01',
      valid_until: '2027-01-01',
    });
    expect(claims.deployment_type).toBe('air_gapped');
  });

  it('rejects invalid deployment_id', () => {
    expect(() =>
      buildLicenseClaims({
        customer_name: 'X',
        license_id: 'L',
        deployment_id: 'not-a-uuid',
        deployment_type: 'vpc',
        valid_from: '2026-01-01',
        valid_until: '2027-01-01',
      }),
    ).toThrow(/deployment_id/);
  });
});

describe('provision-license signing wrapper', () => {
  it('creates signed license via existing sign-enigma-license tool', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'enigma-prov-'));
    const kid = 'test-provision-2026';
    try {
      const { path: keyPath, priv } = await writeEphemeralSigningKey(dir, kid);
      const out = join(dir, 'enigma.license');
      const summary = provisionSignedLicense({
        customer_name: 'Acme Health',
        license_id: 'ENIGMA-ACME-001',
        deployment_id: DEPLOYMENT,
        deployment_type: 'vpc',
        valid_from: '2026-10-01',
        valid_until: '2027-09-30',
        grace_days: 30,
        key_id: kid,
        output_path: out,
        signing_jwk_path: keyPath,
      });

      expect(summary.license_id).toBe('ENIGMA-ACME-001');
      expect(summary.deployment_id).toBe(DEPLOYMENT);
      expect(summary.valid_from).toBe('2026-10-01');
      expect(summary.valid_until).toBe('2027-09-30');
      expect(summary.grace_days).toBe(30);

      const token = (await readFile(out, 'utf8')).trim();
      expect(token.split('.')).toHaveLength(3);
      expect(token).not.toContain(priv.d);
      expect(token).not.toContain('"d"');

      const payload = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
      );
      expect(payload.license_id).toBe('ENIGMA-ACME-001');
      expect(payload.deployment_id).toBe(DEPLOYMENT);
      expect(payload.deployment_type).toBe('vpc');
      expect(payload.valid_until).toBe('2027-09-30');
      expect(payload.grace_days).toBe(30);
      expect(payload.key_id).toBe(kid);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('renewal: new License ID, same Deployment ID, new expiration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'enigma-renew-'));
    const kid = 'test-renew-2026';
    try {
      const { path: keyPath } = await writeEphemeralSigningKey(dir, kid);
      const a = provisionSignedLicense({
        customer_name: 'Acme Health',
        license_id: 'ENIGMA-ACME-L1',
        deployment_id: DEPLOYMENT,
        deployment_type: 'vpc',
        valid_from: '2025-10-01',
        valid_until: '2026-09-30',
        grace_days: 30,
        key_id: kid,
        output_path: join(dir, 'l1.license'),
        signing_jwk_path: keyPath,
      });
      const b = provisionSignedLicense({
        customer_name: 'Acme Health',
        license_id: 'ENIGMA-ACME-L2',
        deployment_id: DEPLOYMENT,
        deployment_type: 'vpc',
        valid_from: '2026-10-01',
        valid_until: '2027-09-30',
        grace_days: 30,
        key_id: kid,
        output_path: join(dir, 'l2.license'),
        signing_jwk_path: keyPath,
      });
      expect(a.deployment_id).toBe(b.deployment_id);
      expect(a.license_id).not.toBe(b.license_id);
      expect(b.valid_until > a.valid_until).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses to write output as a private JWK path', () => {
    expect(() =>
      provisionSignedLicense({
        customer_name: 'X',
        license_id: 'L',
        deployment_id: DEPLOYMENT,
        deployment_type: 'vpc',
        valid_from: '2026-01-01',
        valid_until: '2027-01-01',
        output_path: '/tmp/evil.private.jwk',
        signing_jwk_path: '/tmp/missing.private.jwk',
      }),
    ).toThrow(/private JWK/);
  });
});

describe('customer package security surface', () => {
  it('shipping keyring is public-only; Dockerfile excludes signing scripts', async () => {
    for (const entry of LICENSE_PUBLIC_KEYRING) {
      expect((entry.jwk as { d?: string }).d).toBeUndefined();
    }
    const { readFile } = await import('node:fs/promises');
    const dockerfile = await readFile(
      new URL('../../Dockerfile', import.meta.url),
      'utf8',
    );
    expect(dockerfile).not.toMatch(/sign-enigma-license|provision-license|private\.jwk/);
    expect(dockerfile).toContain('COPY src ./src');
    // Runtime image ships compiled dist + db only — not vendor scripts
    expect(dockerfile).toMatch(/COPY --from=build \/app\/dist/);
  });

  it('licenses mount docs exist without private key material', async () => {
    const { readFile } = await import('node:fs/promises');
    const readme = await readFile(
      new URL('../../licenses/README.md', import.meta.url),
      'utf8',
    );
    expect(readme).toContain('enigma.license');
    expect(readme).toMatch(/Never|NEVER/i);
    expect(readme).not.toMatch(/BEGIN PRIVATE KEY|"d":/);
  });
});
