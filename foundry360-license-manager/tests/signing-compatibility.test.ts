import { describe, expect, it } from 'vitest';
import {
  buildEnigmaLicenseClaims,
  isValidDeploymentUuid,
  toEnigmaDeploymentType,
  signEnigmaLicenseClaims,
  writeLicenseArtifact,
  readLicenseArtifact,
} from '../src/lib/signing';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJWK, generateKeyPair } from 'jose';
import { verifyAndEvaluateSignedLicense } from '../../gateway/src/admin/signed-license';
import type { LicensePublicKeyEntry } from '../../gateway/src/admin/license-keys';

const DEPLOYMENT_ID = '7f3c8c2e-1234-4abc-9def-0123456789ab';

async function makeTestKey(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const priv = await exportJWK(privateKey);
  const pub = await exportJWK(publicKey);
  priv.kid = kid;
  priv.alg = 'EdDSA';
  pub.kid = kid;
  pub.alg = 'EdDSA';
  const dir = mkdtempSync(join(tmpdir(), 'f360-lm-'));
  const path = join(dir, `${kid}.private.jwk`);
  writeFileSync(path, JSON.stringify(priv));
  const keyring: LicensePublicKeyEntry[] = [{ key_id: kid, jwk: pub }];
  return { path, dir, keyring, kid };
}

describe('signing helpers', () => {
  it('validates UUID deployment ids', () => {
    expect(isValidDeploymentUuid(DEPLOYMENT_ID)).toBe(true);
    expect(isValidDeploymentUuid('not-a-uuid')).toBe(false);
  });

  it('maps deployment types to Enigma claims', () => {
    expect(toEnigmaDeploymentType('VPC')).toBe('vpc');
    expect(toEnigmaDeploymentType('AIR_GAPPED')).toBe('air_gapped');
  });

  it('builds Enigma-compatible claims', () => {
    const claims = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2026-09-15',
      valid_until: '2027-09-14',
      grace_days: 30,
      key_id: 'enigma-lic-test',
    });
    expect(claims.license_version).toBe(1);
    expect(claims.deployment_type).toBe('vpc');
    expect(claims.deployment_id).toBe(DEPLOYMENT_ID);
  });
});

describe('Enigma verifier compatibility', () => {
  it('signs a license that Enigma verifies as ACTIVE', async () => {
    const { path, dir, keyring, kid } = await makeTestKey('enigma-lic-test');
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH = path;
    process.env.ARTIFACT_DIR = join(dir, 'artifacts');

    const claims = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2026-01-01',
      valid_until: '2027-12-31',
      grace_days: 30,
      key_id: kid,
    });

    const { token, sha256 } = await signEnigmaLicenseClaims(claims);
    expect(sha256).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));

    const art = writeLicenseArtifact(claims.license_id, token);
    expect(art.filename).toBe('enigma.license');
    expect(readLicenseArtifact(art.path)).toBe(token);

    const result = await verifyAndEvaluateSignedLicense({
      token,
      installationDeploymentId: DEPLOYMENT_ID,
      source: 'file',
      keyring,
      now: new Date('2026-06-15T12:00:00Z'),
    });
    expect(result.status).toBe('ACTIVE');
    expect(result.claims?.deployment_id).toBe(DEPLOYMENT_ID);
    expect(result.license_id).toBe('ENIGMA-ACME-2026-001');

    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects deployment mismatch', async () => {
    const { path, dir, keyring, kid } = await makeTestKey('enigma-lic-test');
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH = path;

    const claims = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2026-01-01',
      valid_until: '2027-12-31',
      grace_days: 30,
      key_id: kid,
    });
    const { token } = await signEnigmaLicenseClaims(claims);
    const result = await verifyAndEvaluateSignedLicense({
      token,
      installationDeploymentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      source: 'file',
      keyring,
      now: new Date('2026-06-15T12:00:00Z'),
    });
    expect(result.status).toBe('INVALID');
    expect(result.reason_code).toBe('LICENSE_DEPLOYMENT_MISMATCH');
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects invalid signature', async () => {
    const a = await makeTestKey('enigma-lic-a');
    const b = await makeTestKey('enigma-lic-b');
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH = a.path;

    const claims = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2026-01-01',
      valid_until: '2027-12-31',
      grace_days: 30,
      key_id: a.kid,
    });
    const { token } = await signEnigmaLicenseClaims(claims);
    const result = await verifyAndEvaluateSignedLicense({
      token,
      installationDeploymentId: DEPLOYMENT_ID,
      source: 'file',
      keyring: b.keyring,
      now: new Date('2026-06-15T12:00:00Z'),
    });
    expect(result.status).toBe('INVALID');
    rmSync(a.dir, { recursive: true, force: true });
    rmSync(b.dir, { recursive: true, force: true });
  });

  it('follows Enigma grace behavior after expiry', async () => {
    const { path, dir, keyring, kid } = await makeTestKey('enigma-lic-test');
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH = path;

    const claims = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'AIR_GAPPED',
      valid_from: '2025-01-01',
      valid_until: '2026-01-31',
      grace_days: 30,
      key_id: kid,
    });
    const { token } = await signEnigmaLicenseClaims(claims);

    const grace = await verifyAndEvaluateSignedLicense({
      token,
      installationDeploymentId: DEPLOYMENT_ID,
      source: 'file',
      keyring,
      now: new Date('2026-02-15T12:00:00Z'),
    });
    expect(grace.status).toBe('GRACE');

    const disabled = await verifyAndEvaluateSignedLicense({
      token,
      installationDeploymentId: DEPLOYMENT_ID,
      source: 'file',
      keyring,
      now: new Date('2026-03-15T12:00:00Z'),
    });
    expect(disabled.status).toBe('DISABLED');

    rmSync(dir, { recursive: true, force: true });
  });

  it('renewal uses new License ID with same Deployment ID', async () => {
    const { path, dir, keyring, kid } = await makeTestKey('enigma-lic-test');
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH = path;

    const original = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2026-01-01',
      valid_until: '2026-12-31',
      grace_days: 30,
      key_id: kid,
    });
    const renewal = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2027-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2027-01-01',
      valid_until: '2027-12-31',
      grace_days: 30,
      key_id: kid,
    });

    expect(renewal.license_id).not.toBe(original.license_id);
    expect(renewal.deployment_id).toBe(original.deployment_id);

    const { token } = await signEnigmaLicenseClaims(renewal);
    const result = await verifyAndEvaluateSignedLicense({
      token,
      installationDeploymentId: DEPLOYMENT_ID,
      source: 'file',
      keyring,
      now: new Date('2027-06-01T12:00:00Z'),
    });
    expect(result.status).toBe('ACTIVE');
    expect(result.license_id).toBe('ENIGMA-ACME-2027-001');

    rmSync(dir, { recursive: true, force: true });
  });

  it('fails when private key is unavailable', async () => {
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH = '/tmp/does-not-exist-private.jwk';
    const claims = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2026-01-01',
      valid_until: '2027-12-31',
      grace_days: 30,
      key_id: 'enigma-lic-test',
    });
    await expect(signEnigmaLicenseClaims(claims)).rejects.toThrow(
      /not available|not configured/,
    );
  });

  it('fails on malformed private key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'f360-bad-'));
    const path = join(dir, 'bad.jwk');
    writeFileSync(path, '{not-json');
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH = path;
    const claims = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2026-01-01',
      valid_until: '2027-12-31',
      grace_days: 30,
      key_id: 'enigma-lic-test',
    });
    await expect(signEnigmaLicenseClaims(claims)).rejects.toThrow(/malformed/);
    rmSync(dir, { recursive: true, force: true });
  });
});
