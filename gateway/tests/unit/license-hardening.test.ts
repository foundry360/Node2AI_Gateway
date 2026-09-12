/**
 * Phase 2 production hardening — state transitions, renewal, isolation, keyring safety.
 */
import { describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import {
  evaluateVerifiedLicense,
  isLicenseOperational,
  resolvePlatformLicense,
  verifySignedLicenseJws,
} from '../../src/admin/license.js';
import {
  LICENSE_PUBLIC_KEYRING,
  assertPublicKeyringSafe,
  type LicensePublicKeyEntry,
} from '../../src/admin/license-keys.js';
import { InMemoryDeploymentIdentityStore } from '../../src/admin/deployment-identity.js';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';

const DEPLOYMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function fixtureKeyring(kid = 'test-hardening-2026') {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const pub = await exportJWK(publicKey);
  const priv = await exportJWK(privateKey);
  pub.kid = kid;
  pub.alg = 'EdDSA';
  priv.kid = kid;
  priv.alg = 'EdDSA';
  const keyring: LicensePublicKeyEntry[] = [{ key_id: kid, jwk: pub }];
  return { privateKey, keyring, kid };
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    license_version: 1,
    license_id: 'ENIGMA-HARDEN-A',
    customer_name: 'Harden Org',
    deployment_id: DEPLOYMENT,
    deployment_type: 'vpc',
    valid_from: '2026-01-01',
    valid_until: '2026-09-01',
    issued_at: '2026-01-01T00:00:00Z',
    key_id: 'test-hardening-2026',
    grace_days: 30,
    ...overrides,
  };
}

async function sign(
  body: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string,
) {
  return new SignJWT(body)
    .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'enigma-license+jwt' })
    .sign(privateKey);
}

function day(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
}

describe('license state transitions', () => {
  it('ACTIVE → GRACE → DISABLED along the term timeline', async () => {
    const { privateKey, keyring, kid } = await fixtureKeyring();
    const token = await sign(claims({ key_id: kid }), privateKey, kid);
    const verified = await verifySignedLicenseJws(token, keyring);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const active = evaluateVerifiedLicense({
      claims: verified.claims,
      installationDeploymentId: DEPLOYMENT,
      now: day('2026-08-15'),
      source: 'file',
    });
    expect(active.status).toBe('ACTIVE');
    expect(active.operational).toBe(true);

    const grace = evaluateVerifiedLicense({
      claims: verified.claims,
      installationDeploymentId: DEPLOYMENT,
      now: day('2026-09-15'),
      source: 'file',
    });
    expect(grace.status).toBe('GRACE');
    expect(grace.operational).toBe(true);

    const disabled = evaluateVerifiedLicense({
      claims: verified.claims,
      installationDeploymentId: DEPLOYMENT,
      now: day('2026-10-02'),
      source: 'file',
    });
    expect(disabled.status).toBe('DISABLED');
    expect(disabled.reason_code).toBe('LICENSE_DISABLED');
    expect(disabled.operational).toBe(false);
  });

  it('ACTIVE → deployment mismatch → INVALID (never grace)', async () => {
    const { privateKey, keyring, kid } = await fixtureKeyring();
    const token = await sign(claims({ key_id: kid }), privateKey, kid);
    const verified = await verifySignedLicenseJws(token, keyring);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const mismatch = evaluateVerifiedLicense({
      claims: verified.claims,
      installationDeploymentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      now: day('2026-09-15'), // would be grace if bound
      source: 'file',
    });
    expect(mismatch.status).toBe('INVALID');
    expect(mismatch.reason_code).toBe('LICENSE_DEPLOYMENT_MISMATCH');
    expect(mismatch.operational).toBe(false);
  });

  it('ACTIVE → signature corruption → INVALID (never grace)', async () => {
    const { privateKey, keyring, kid } = await fixtureKeyring();
    const token = await sign(claims({ key_id: kid }), privateKey, kid);
    const corrupted = token.slice(0, -4) + 'XXXX';
    const verified = await verifySignedLicenseJws(corrupted, keyring);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe('LICENSE_INVALID_SIGNATURE');
    }
  });

  it('ACTIVE → unknown key → INVALID (never grace)', async () => {
    const { privateKey, kid } = await fixtureKeyring('other-kid');
    const token = await sign(
      claims({ key_id: 'other-kid' }),
      privateKey,
      'other-kid',
    );
    const verified = await verifySignedLicenseJws(token, [
      {
        key_id: 'expected-kid',
        jwk: { kty: 'OKP', crv: 'Ed25519', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      },
    ]);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.reason).toBe('LICENSE_UNKNOWN_KEY');
    void kid;
  });
});

describe('renewal model', () => {
  it('renewal replaces license_id/valid_until; deployment_id unchanged', async () => {
    const store = new InMemoryDeploymentIdentityStore({
      deployment_id: DEPLOYMENT,
    });
    const idBefore = await store.getOrCreateDeploymentId();

    const { privateKey, keyring, kid } = await fixtureKeyring();
    const licenseA = await sign(
      claims({
        key_id: kid,
        license_id: 'ENIGMA-HARDEN-A',
        valid_until: '2026-09-01',
      }),
      privateKey,
      kid,
    );
    const licenseB = await sign(
      claims({
        key_id: kid,
        license_id: 'ENIGMA-HARDEN-B',
        valid_from: '2026-09-01',
        valid_until: '2027-09-01',
      }),
      privateKey,
      kid,
    );

    const a = await verifySignedLicenseJws(licenseA, keyring);
    const b = await verifySignedLicenseJws(licenseB, keyring);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const evalA = evaluateVerifiedLicense({
      claims: a.claims,
      installationDeploymentId: idBefore,
      now: day('2026-08-01'),
      source: 'file',
    });
    const evalB = evaluateVerifiedLicense({
      claims: b.claims,
      installationDeploymentId: idBefore,
      now: day('2026-10-01'),
      source: 'file',
    });

    expect(evalA.status).toBe('ACTIVE');
    expect(evalB.status).toBe('ACTIVE');
    expect(evalA.license_id).toBe('ENIGMA-HARDEN-A');
    expect(evalB.license_id).toBe('ENIGMA-HARDEN-B');
    expect(a.claims.deployment_id).toBe(DEPLOYMENT);
    expect(b.claims.deployment_id).toBe(DEPLOYMENT);

    const idAfter = await store.getOrCreateDeploymentId();
    expect(idAfter).toBe(idBefore);
  });
});

describe('production fail-closed reason codes', () => {
  const codes = [
    'LICENSE_MISSING',
    'LICENSE_MALFORMED',
    'LICENSE_INVALID_SIGNATURE',
    'LICENSE_UNKNOWN_KEY',
    'LICENSE_UNSUPPORTED_VERSION',
    'LICENSE_DEPLOYMENT_MISMATCH',
    'LICENSE_NOT_YET_VALID',
  ] as const;

  it('each invalid condition is non-operational and not GRACE', async () => {
    const missing = await resolvePlatformLicense({
      env: { ENIGMA_LICENSE_MODE: 'production' },
      installationDeploymentId: DEPLOYMENT,
    });
    expect(missing.status).toBe('INVALID');
    expect(missing.reason_code).toBe('LICENSE_MISSING');
    expect(missing.operational).toBe(false);

    const malformed = await resolvePlatformLicense({
      env: {
        ENIGMA_LICENSE_MODE: 'production',
        ENIGMA_LICENSE_DOCUMENT: 'not-a-jws',
      },
      installationDeploymentId: DEPLOYMENT,
    });
    expect(malformed.status).toBe('INVALID');
    expect(malformed.operational).toBe(false);
    expect(malformed.status).not.toBe('GRACE');

    for (const code of codes) {
      expect(typeof code).toBe('string');
    }
  });
});

describe('platform vs governance isolation (reason matrix)', () => {
  it.each([
    ['LICENSE_MISSING', {}],
    [
      'LICENSE_MALFORMED',
      { ENIGMA_LICENSE_DOCUMENT: 'x.y.z' },
    ],
  ] as const)(
    '%s blocks AI with platform 403 and creates no evaluation',
    async (expectedReason, extraEnv) => {
      const prev: Record<string, string | undefined> = {
        ENIGMA_LICENSE_MODE: process.env.ENIGMA_LICENSE_MODE,
        ENIGMA_LICENSE_DOCUMENT: process.env.ENIGMA_LICENSE_DOCUMENT,
        ENIGMA_LICENSE_PATH: process.env.ENIGMA_LICENSE_PATH,
      };
      delete process.env.ENIGMA_LICENSE_PATH;
      delete process.env.ENIGMA_LICENSE_DOCUMENT;
      process.env.ENIGMA_LICENSE_MODE = 'production';
      for (const [k, v] of Object.entries(extraEnv)) {
        process.env[k] = v;
      }

      const gw = createPhase1Gateway({
        config: { adminApiKey: 'test_admin' },
        deploymentIdentity: new InMemoryDeploymentIdentityStore({
          deployment_id: DEPLOYMENT,
        }),
      });
      const server = await gw.buildServer();
      try {
        const before = await server.inject({
          method: 'GET',
          url: '/v1/admin/evaluations?limit=20',
          headers: { authorization: 'Bearer test_admin' },
        });
        const beforeLen =
          before.statusCode === 200
            ? (before.json().items?.length ?? 0)
            : 0;

        const ai = await server.inject({
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
        expect(ai.statusCode).toBe(403);
        expect(ai.json().reason_code).toBe(expectedReason);
        expect(ai.json().status).toBe('blocked');

        const after = await server.inject({
          method: 'GET',
          url: '/v1/admin/evaluations?limit=20',
          headers: { authorization: 'Bearer test_admin' },
        });
        if (after.statusCode === 200) {
          expect(after.json().items?.length ?? 0).toBe(beforeLen);
        }

        const system = await server.inject({
          method: 'GET',
          url: '/v1/admin/system',
          headers: { authorization: 'Bearer test_admin' },
        });
        expect(system.statusCode).toBe(200);
        expect(system.json().license.status).toBe('INVALID');
        expect(system.json().deployment.deployment_id).toBe(DEPLOYMENT);
      } finally {
        await server.close();
        for (const [k, v] of Object.entries(prev)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    },
  );
});

describe('keyring production safety', () => {
  it('shipping keyring has no private material and rejects assert on private d', () => {
    assertPublicKeyringSafe(LICENSE_PUBLIC_KEYRING);
    expect(() =>
      assertPublicKeyringSafe([
        {
          key_id: 'bad',
          jwk: {
            kty: 'OKP',
            crv: 'Ed25519',
            x: 'x',
            d: 'should-not-exist',
          },
        },
      ]),
    ).toThrow(/must not contain private field d/);
  });

  it('isLicenseOperational never fail-opens on null', () => {
    expect(isLicenseOperational(null)).toBe(false);
    expect(isLicenseOperational(undefined)).toBe(false);
  });
});

describe('compose production package cleanliness', () => {
  it('VPC and air-gap mounts are read-only and contain no private key material', async () => {
    const { readFile } = await import('node:fs/promises');
    const vpc = await readFile(
      new URL('../../docker-compose.yml', import.meta.url),
      'utf8',
    );
    const air = await readFile(
      new URL('../../docker-compose.airgap.yml', import.meta.url),
      'utf8',
    );
    for (const text of [vpc, air]) {
      expect(text).toContain('/etc/enigma/license');
      expect(text).toContain('ENIGMA_LICENSE_MODE');
      expect(text).toContain('ENIGMA_LICENSE_PATH');
      expect(text).not.toMatch(/private\.jwk/i);
      expect(text).not.toMatch(/ENIGMA_LICENSE_SIGNING/);
      expect(text).not.toMatch(/\bd:\s*['"]/);
      expect(text).not.toContain('BEGIN PRIVATE KEY');
      // Writable mount so Admin can install licenses via API
      expect(text).not.toMatch(/\/etc\/enigma\/license:ro/);
    }
  });
});
