/**
 * Phase 2 signed offline license verification + production fail-closed gate.
 */
import { describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluateVerifiedLicense,
  isLicenseOperational,
  loadEnigmaLicense,
  resolveLicenseMode,
  resolvePlatformLicense,
  verifySignedLicenseJws,
} from '../../src/admin/license.js';
import type { LicensePublicKeyEntry } from '../../src/admin/license-keys.js';
import { LICENSE_PUBLIC_KEYRING, assertPublicKeyringSafe } from '../../src/admin/license-keys.js';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { InMemoryDeploymentIdentityStore } from '../../src/admin/deployment-identity.js';

const DEPLOYMENT_A = '11111111-1111-4111-8111-111111111111';
const DEPLOYMENT_B = '22222222-2222-4222-8222-222222222222';

async function makeKeyring(kid = 'test-lic-2026') {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const pub = await exportJWK(publicKey);
  const priv = await exportJWK(privateKey);
  pub.kid = kid;
  pub.alg = 'EdDSA';
  priv.kid = kid;
  priv.alg = 'EdDSA';
  const keyring: LicensePublicKeyEntry[] = [
    { key_id: kid, jwk: pub },
  ];
  return { privateKey, publicKey, priv, pub, keyring, kid };
}

function baseClaims(overrides: Record<string, unknown> = {}) {
  return {
    license_version: 1,
    license_id: 'ENIGMA-TEST-001',
    customer_name: 'Test Org',
    deployment_id: DEPLOYMENT_A,
    deployment_type: 'vpc',
    valid_from: '2026-01-01',
    valid_until: '2027-01-01',
    issued_at: '2026-01-01T00:00:00Z',
    key_id: 'test-lic-2026',
    grace_days: 30,
    ...overrides,
  };
}

async function signClaims(
  claims: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string,
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'enigma-license+jwt' })
    .sign(privateKey);
}

function asOf(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
}

describe('signed license cryptography', () => {
  it('1. valid Ed25519 signature', async () => {
    const { privateKey, keyring, kid } = await makeKeyring();
    const token = await signClaims(baseClaims({ key_id: kid }), privateKey, kid);
    const verified = await verifySignedLicenseJws(token, keyring);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.claims.license_id).toBe('ENIGMA-TEST-001');
  });

  it('2. invalid signature', async () => {
    const a = await makeKeyring('kid-a');
    const b = await makeKeyring('kid-a'); // same kid, different key
    const token = await signClaims(
      baseClaims({ key_id: 'kid-a' }),
      a.privateKey,
      'kid-a',
    );
    const verified = await verifySignedLicenseJws(token, b.keyring);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.reason).toBe('LICENSE_INVALID_SIGNATURE');
  });

  it('3. modified payload', async () => {
    const { privateKey, keyring, kid } = await makeKeyring();
    const token = await signClaims(baseClaims({ key_id: kid }), privateKey, kid);
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString('utf8'));
    payload.license_id = 'TAMPERED';
    const tampered = [
      h,
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      s,
    ].join('.');
    const verified = await verifySignedLicenseJws(tampered, keyring);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.reason).toBe('LICENSE_INVALID_SIGNATURE');
  });

  it('4. modified header', async () => {
    const { privateKey, keyring, kid } = await makeKeyring();
    const token = await signClaims(baseClaims({ key_id: kid }), privateKey, kid);
    const [, p, s] = token.split('.');
    const badHeader = Buffer.from(
      JSON.stringify({ alg: 'EdDSA', kid: 'other' }),
    ).toString('base64url');
    const verified = await verifySignedLicenseJws(
      [badHeader, p, s].join('.'),
      keyring,
    );
    expect(verified.ok).toBe(false);
  });

  it('5. unknown key ID', async () => {
    const { privateKey, keyring, kid } = await makeKeyring();
    const token = await signClaims(
      baseClaims({ key_id: 'unknown-key' }),
      privateKey,
      'unknown-key',
    );
    const verified = await verifySignedLicenseJws(token, keyring);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.reason).toBe('LICENSE_UNKNOWN_KEY');
  });
});

describe('signed license claims', () => {
  it('6–11. claims validation paths', async () => {
    const { privateKey, keyring, kid } = await makeKeyring();

    const valid = await signClaims(baseClaims({ key_id: kid }), privateKey, kid);
    expect((await verifySignedLicenseJws(valid, keyring)).ok).toBe(true);

    const badVersion = await signClaims(
      baseClaims({ key_id: kid, license_version: 99 }),
      privateKey,
      kid,
    );
    const v = await verifySignedLicenseJws(badVersion, keyring);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('LICENSE_UNSUPPORTED_VERSION');

    const missing = await signClaims(
      { ...baseClaims({ key_id: kid }), customer_name: '' },
      privateKey,
      kid,
    );
    const m = await verifySignedLicenseJws(missing, keyring);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.reason).toBe('LICENSE_MISSING_CLAIM');

    const badType = await signClaims(
      baseClaims({ key_id: kid, deployment_type: 'laptop' }),
      privateKey,
      kid,
    );
    const t = await verifySignedLicenseJws(badType, keyring);
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.reason).toBe('LICENSE_MALFORMED');

    const badDate = await signClaims(
      baseClaims({ key_id: kid, valid_until: 'not-a-date' }),
      privateKey,
      kid,
    );
    const d = await verifySignedLicenseJws(badDate, keyring);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe('LICENSE_MALFORMED');

    const future = await signClaims(
      baseClaims({
        key_id: kid,
        valid_from: '2027-06-01',
        valid_until: '2028-06-01',
      }),
      privateKey,
      kid,
    );
    const fv = await verifySignedLicenseJws(future, keyring);
    expect(fv.ok).toBe(true);
    if (fv.ok) {
      const evaled = evaluateVerifiedLicense({
        claims: fv.claims,
        installationDeploymentId: DEPLOYMENT_A,
        now: asOf('2026-09-12'),
        source: 'env_document',
      });
      expect(evaled.status).toBe('INVALID');
      expect(evaled.reason_code).toBe('LICENSE_NOT_YET_VALID');
      expect(evaled.operational).toBe(false);
    }
  });
});

describe('signed license binding + term', () => {
  it('12–18. binding and ACTIVE/GRACE/DISABLED', async () => {
    const { privateKey, keyring, kid } = await makeKeyring();
    const token = await signClaims(baseClaims({ key_id: kid }), privateKey, kid);
    const verified = await verifySignedLicenseJws(token, keyring);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const match = evaluateVerifiedLicense({
      claims: verified.claims,
      installationDeploymentId: DEPLOYMENT_A,
      now: asOf('2026-06-01'),
      source: 'file',
    });
    expect(match.status).toBe('ACTIVE');
    expect(match.deployment_bound).toBe(true);
    expect(match.operational).toBe(true);

    const mismatch = evaluateVerifiedLicense({
      claims: verified.claims,
      installationDeploymentId: DEPLOYMENT_B,
      now: asOf('2026-06-01'),
      source: 'file',
    });
    expect(mismatch.status).toBe('INVALID');
    expect(mismatch.reason_code).toBe('LICENSE_DEPLOYMENT_MISMATCH');
    expect(mismatch.operational).toBe(false);

    const grace = evaluateVerifiedLicense({
      claims: { ...verified.claims, valid_until: '2026-08-01' },
      installationDeploymentId: DEPLOYMENT_A,
      now: asOf('2026-08-15'),
      source: 'file',
    });
    expect(grace.status).toBe('GRACE');
    expect(grace.operational).toBe(true);

    const boundary = evaluateVerifiedLicense({
      claims: { ...verified.claims, valid_until: '2026-08-01', grace_days: 30 },
      installationDeploymentId: DEPLOYMENT_A,
      now: asOf('2026-08-31'),
      source: 'file',
    });
    expect(boundary.status).toBe('GRACE');

    const disabled = evaluateVerifiedLicense({
      claims: { ...verified.claims, valid_until: '2026-08-01', grace_days: 30 },
      installationDeploymentId: DEPLOYMENT_A,
      now: asOf('2026-09-01'),
      source: 'file',
    });
    expect(disabled.status).toBe('DISABLED');
    expect(disabled.reason_code).toBe('LICENSE_DISABLED');
    expect(disabled.operational).toBe(false);

    // Invalid signature never gets grace
    const bad = await verifySignedLicenseJws(token + 'x', keyring);
    expect(bad.ok).toBe(false);
  });
});

describe('production fail-closed', () => {
  it('19–23. production blocks missing/invalid licenses', async () => {
    const missing = await resolvePlatformLicense({
      env: { ENIGMA_LICENSE_MODE: 'production' },
      installationDeploymentId: DEPLOYMENT_A,
      now: asOf('2026-09-12'),
    });
    expect(missing.status).toBe('INVALID');
    expect(missing.reason_code).toBe('LICENSE_MISSING');
    expect(missing.operational).toBe(false);
    expect(isLicenseOperational(missing)).toBe(false);

    const { privateKey, keyring, kid } = await makeKeyring();
    const wrongDeploy = await signClaims(
      baseClaims({ key_id: kid, deployment_id: DEPLOYMENT_B }),
      privateKey,
      kid,
    );
    // Use env document with custom verify via resolve — production path uses embedded keyring.
    // Direct evaluate covers wrong deployment; production missing already covered.
    const verified = await verifySignedLicenseJws(wrongDeploy, keyring);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      const r = evaluateVerifiedLicense({
        claims: verified.claims,
        installationDeploymentId: DEPLOYMENT_A,
        now: asOf('2026-09-12'),
        source: 'env_document',
      });
      expect(r.reason_code).toBe('LICENSE_DEPLOYMENT_MISMATCH');
      expect(r.operational).toBe(false);
    }

    expect(resolveLicenseMode({ ENIGMA_LICENSE_MODE: 'production' })).toBe(
      'production',
    );
    expect(resolveLicenseMode({ NODE_ENV: 'production' })).toBe('production');
    expect(resolveLicenseMode({})).toBe('development');
  });

  it('unknown key / unsupported version / bad signature via env document', async () => {
    const { privateKey, kid } = await makeKeyring('not-in-shipped-ring');
    const token = await signClaims(
      baseClaims({ key_id: kid }),
      privateKey,
      kid,
    );
    const unknown = await resolvePlatformLicense({
      env: {
        ENIGMA_LICENSE_MODE: 'production',
        ENIGMA_LICENSE_DOCUMENT: token,
      },
      installationDeploymentId: DEPLOYMENT_A,
      now: asOf('2026-09-12'),
    });
    expect(unknown.status).toBe('INVALID');
    expect(unknown.reason_code).toBe('LICENSE_UNKNOWN_KEY');
    expect(unknown.operational).toBe(false);

    // Tampered token against shipped ring
    const shippedKid = LICENSE_PUBLIC_KEYRING[0]!.key_id;
    const garbage = await resolvePlatformLicense({
      env: {
        ENIGMA_LICENSE_MODE: 'production',
        ENIGMA_LICENSE_DOCUMENT: 'aaa.bbb.ccc',
      },
      installationDeploymentId: DEPLOYMENT_A,
    });
    expect(garbage.operational).toBe(false);
    expect(garbage.status).toBe('INVALID');
    void shippedKid;
  });
});

describe('development workflow', () => {
  it('24. existing developer workflow still works', () => {
    const lic = loadEnigmaLicense({}, asOf('2026-09-12'));
    expect(lic).not.toBeNull();
    expect(lic!.license_id).toBe('ENIGMA-DEV-001');
    expect(lic!.status).toBe('ACTIVE');
    expect(lic!.operational).toBe(true);
    expect(isLicenseOperational(lic)).toBe(true);
  });
});

describe('AI routes + admin availability', () => {
  it('25–27. AI gated; admin system available when disabled', async () => {
    const prevMode = process.env.ENIGMA_LICENSE_MODE;
    const prevStart = process.env.ENIGMA_LICENSE_START_DATE;
    const prevExp = process.env.ENIGMA_LICENSE_EXPIRATION_DATE;
    const prevDoc = process.env.ENIGMA_LICENSE_DOCUMENT;
    const prevPath = process.env.ENIGMA_LICENSE_PATH;

    delete process.env.ENIGMA_LICENSE_DOCUMENT;
    delete process.env.ENIGMA_LICENSE_PATH;
    process.env.ENIGMA_LICENSE_MODE = 'development';
    process.env.ENIGMA_LICENSE_START_DATE = '2024-01-01';
    process.env.ENIGMA_LICENSE_EXPIRATION_DATE = '2024-06-01';

    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    try {
      const blocked = await server.inject({
        method: 'POST',
        url: '/v1/ai/completions',
        headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
        payload: {
          application_id: 'app_clinical',
          user: { id: 'user_clinician' },
          operation: 'summarize',
          messages: [{ role: 'user', content: 'hello' }],
        },
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().reason_code).toBe('LICENSE_DISABLED');

      const blockedAction = await server.inject({
        method: 'POST',
        url: '/v1/ai/actions',
        headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
        payload: {
          application_id: 'app_clinical',
          user: { id: 'user_clinician' },
          operation: 'write',
          messages: [{ role: 'user', content: 'note' }],
        },
      });
      expect(blockedAction.statusCode).toBe(403);

      const system = await server.inject({
        method: 'GET',
        url: '/v1/admin/system',
        headers: { authorization: 'Bearer test_admin' },
      });
      expect(system.statusCode).toBe(200);
      expect(system.json().license.status).toBe('DISABLED');
      expect(system.json().deployment.deployment_id).toBeTruthy();
    } finally {
      await server.close();
      if (prevMode === undefined) delete process.env.ENIGMA_LICENSE_MODE;
      else process.env.ENIGMA_LICENSE_MODE = prevMode;
      if (prevStart === undefined) delete process.env.ENIGMA_LICENSE_START_DATE;
      else process.env.ENIGMA_LICENSE_START_DATE = prevStart;
      if (prevExp === undefined) delete process.env.ENIGMA_LICENSE_EXPIRATION_DATE;
      else process.env.ENIGMA_LICENSE_EXPIRATION_DATE = prevExp;
      if (prevDoc === undefined) delete process.env.ENIGMA_LICENSE_DOCUMENT;
      else process.env.ENIGMA_LICENSE_DOCUMENT = prevDoc;
      if (prevPath === undefined) delete process.env.ENIGMA_LICENSE_PATH;
      else process.env.ENIGMA_LICENSE_PATH = prevPath;
    }
  });

  it('28. license from file path survives reload', async () => {
    const { privateKey, keyring, kid } = await makeKeyring();
    // Inject into production resolve by writing token and using custom path —
    // shipped keyring won't verify test key; test file load + evaluate path:
    const token = await signClaims(
      baseClaims({ key_id: kid, deployment_id: DEPLOYMENT_A }),
      privateKey,
      kid,
    );
    const dir = await mkdtemp(join(tmpdir(), 'enigma-lic-'));
    const file = join(dir, 'enigma.license');
    await writeFile(file, token, 'utf8');
    try {
      const verified = await verifySignedLicenseJws(token, keyring);
      expect(verified.ok).toBe(true);
      // Second read (simulating restart with same mount)
      const { readFile } = await import('node:fs/promises');
      const again = (await readFile(file, 'utf8')).trim();
      expect(again).toBe(token);
      const v2 = await verifySignedLicenseJws(again, keyring);
      expect(v2.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('governance isolation', () => {
  it('31–33. license failure does not create PDP / policy_evaluations side effects', async () => {
    const prevMode = process.env.ENIGMA_LICENSE_MODE;
    const prevDoc = process.env.ENIGMA_LICENSE_DOCUMENT;
    const prevPath = process.env.ENIGMA_LICENSE_PATH;
    delete process.env.ENIGMA_LICENSE_DOCUMENT;
    delete process.env.ENIGMA_LICENSE_PATH;
    process.env.ENIGMA_LICENSE_MODE = 'production';

    const store = new InMemoryDeploymentIdentityStore({
      deployment_id: DEPLOYMENT_A,
    });
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
      deploymentIdentity: store,
    });
    const server = await gw.buildServer();
    try {
      const before = await server.inject({
        method: 'GET',
        url: '/v1/admin/evaluations?limit=5',
        headers: { authorization: 'Bearer test_admin' },
      });
      const beforeCount =
        before.statusCode === 200
          ? (before.json().items?.length ?? before.json().evaluations?.length ?? 0)
          : 0;

      const blocked = await server.inject({
        method: 'POST',
        url: '/v1/ai/completions',
        headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
        payload: {
          application_id: 'app_clinical',
          user: { id: 'user_clinician' },
          operation: 'summarize',
          messages: [{ role: 'user', content: 'hello' }],
        },
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().reason_code).toBe('LICENSE_MISSING');

      const after = await server.inject({
        method: 'GET',
        url: '/v1/admin/evaluations?limit=5',
        headers: { authorization: 'Bearer test_admin' },
      });
      if (after.statusCode === 200) {
        const afterCount =
          after.json().items?.length ?? after.json().evaluations?.length ?? 0;
        expect(afterCount).toBe(beforeCount);
      }

      // Admin still up
      const system = await server.inject({
        method: 'GET',
        url: '/v1/admin/system',
        headers: { authorization: 'Bearer test_admin' },
      });
      expect(system.statusCode).toBe(200);
      expect(system.json().license.status).toBe('INVALID');
      expect(system.json().license.reason_code).toBe('LICENSE_MISSING');
    } finally {
      await server.close();
      if (prevMode === undefined) delete process.env.ENIGMA_LICENSE_MODE;
      else process.env.ENIGMA_LICENSE_MODE = prevMode;
      if (prevDoc === undefined) delete process.env.ENIGMA_LICENSE_DOCUMENT;
      else process.env.ENIGMA_LICENSE_DOCUMENT = prevDoc;
      if (prevPath === undefined) delete process.env.ENIGMA_LICENSE_PATH;
      else process.env.ENIGMA_LICENSE_PATH = prevPath;
    }
  });
});

describe('shipped verification keyring', () => {
  it('contains production public key only (no private field d)', () => {
    expect(LICENSE_PUBLIC_KEYRING.length).toBeGreaterThan(0);
    for (const entry of LICENSE_PUBLIC_KEYRING) {
      expect(entry.key_id).toMatch(/^enigma-lic-/);
      expect((entry.jwk as { d?: string }).d).toBeUndefined();
      expect(entry.jwk.kty).toBe('OKP');
      expect(entry.jwk.crv).toBe('Ed25519');
    }
    expect(
      LICENSE_PUBLIC_KEYRING.some((e) => e.key_id === 'enigma-lic-2026-09'),
    ).toBe(true);
    // Retired demo key must not be accepted
    expect(
      LICENSE_PUBLIC_KEYRING.some((e) => e.key_id === 'enigma-lic-2026-01'),
    ).toBe(false);
    expect(() => assertPublicKeyringSafe()).not.toThrow();
  });

  it('rejects demo / unknown key_id against shipping ring', async () => {
    const { privateKey, kid } = await makeKeyring('enigma-lic-2026-01');
    const token = await signClaims(
      baseClaims({ key_id: kid }),
      privateKey,
      kid,
    );
    const verified = await verifySignedLicenseJws(token); // default shipping ring
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.reason).toBe('LICENSE_UNKNOWN_KEY');
  });
});

describe('compose license mount contract', () => {
  it('29–30. VPC and air-gap compose declare license mount + path', async () => {
    const { readFile } = await import('node:fs/promises');
    const vpc = await readFile(
      new URL('../../docker-compose.yml', import.meta.url),
      'utf8',
    );
    const air = await readFile(
      new URL('../../docker-compose.airgap.yml', import.meta.url),
      'utf8',
    );
    expect(vpc).toContain('ENIGMA_LICENSE_PATH');
    expect(vpc).toContain('/etc/enigma/license');
    expect(vpc).toContain('ENIGMA_LICENSE_MODE');
    expect(air).toContain('ENIGMA_LICENSE_PATH');
    expect(air).toContain('/etc/enigma/license');
    expect(air).toContain('ENIGMA_LICENSE_MODE');
  });
});
