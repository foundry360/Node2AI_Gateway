/**
 * Admin license installation — validate-then-atomic-write.
 * Uses ephemeral signing keys (never production private key).
 */
import { describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { InMemoryDeploymentIdentityStore } from '../../src/admin/deployment-identity.js';
import type { LicensePublicKeyEntry } from '../../src/admin/license-keys.js';
import { installSignedLicenseDocument } from '../../src/admin/license-install.js';

const DEPLOYMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function multipartLicenseBody(token: string) {
  const boundary = '----EnigmaLicenseBoundary7MA4YWxk';
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="license"; filename="enigma.license"\r\n` +
    `Content-Type: application/jose\r\n\r\n` +
    `${token}\r\n` +
    `--${boundary}--\r\n`;
  return {
    payload: body,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

async function fixture(kid = 'test-install-2026') {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const pub = await exportJWK(publicKey);
  pub.kid = kid;
  pub.alg = 'EdDSA';
  const keyring: LicensePublicKeyEntry[] = [{ key_id: kid, jwk: pub }];
  return { privateKey, keyring, kid };
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    license_version: 1,
    license_id: 'ENIGMA-INSTALL-001',
    customer_name: 'Install Org',
    deployment_id: DEPLOYMENT,
    deployment_type: 'vpc',
    valid_from: '2026-01-01',
    valid_until: '2027-12-31',
    issued_at: '2026-01-01T00:00:00Z',
    key_id: 'test-install-2026',
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

async function withEnvPath<T>(
  path: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prevPath = process.env.ENIGMA_LICENSE_PATH;
  const prevMode = process.env.ENIGMA_LICENSE_MODE;
  const prevDoc = process.env.ENIGMA_LICENSE_DOCUMENT;
  process.env.ENIGMA_LICENSE_PATH = path;
  process.env.ENIGMA_LICENSE_MODE = 'production';
  delete process.env.ENIGMA_LICENSE_DOCUMENT;
  try {
    return await fn();
  } finally {
    if (prevPath === undefined) delete process.env.ENIGMA_LICENSE_PATH;
    else process.env.ENIGMA_LICENSE_PATH = prevPath;
    if (prevMode === undefined) delete process.env.ENIGMA_LICENSE_MODE;
    else process.env.ENIGMA_LICENSE_MODE = prevMode;
    if (prevDoc === undefined) delete process.env.ENIGMA_LICENSE_DOCUMENT;
    else process.env.ENIGMA_LICENSE_DOCUMENT = prevDoc;
  }
}

describe('license install (unit)', () => {
  it('installs valid signed license → ACTIVE and persists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lic-install-'));
    const path = join(dir, 'enigma.license');
    const { privateKey, keyring, kid } = await fixture();
    try {
      const token = await sign(claims({ key_id: kid }), privateKey, kid);
      const result = await installSignedLicenseDocument({
        document: token,
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        keyring,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.status).toBe('ACTIVE');
      expect(result.license.license_id).toBe('ENIGMA-INSTALL-001');
      expect(result.license.deployment_id).toBe(DEPLOYMENT);
      const onDisk = (await readFile(path, 'utf8')).trim();
      expect(onDisk).toBe(token);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('deployment mismatch does not replace existing license', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lic-mismatch-'));
    const path = join(dir, 'enigma.license');
    const { privateKey, keyring, kid } = await fixture();
    try {
      const good = await sign(claims({ key_id: kid }), privateKey, kid);
      await installSignedLicenseDocument({
        document: good,
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        keyring,
      });
      const before = await readFile(path, 'utf8');

      const bad = await sign(
        claims({ key_id: kid, deployment_id: OTHER }),
        privateKey,
        kid,
      );
      const result = await installSignedLicenseDocument({
        document: bad,
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        keyring,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason_code).toBe('LICENSE_DEPLOYMENT_MISMATCH');
      expect(await readFile(path, 'utf8')).toBe(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('invalid signature / unknown key / malformed leave file unchanged', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lic-reject-'));
    const path = join(dir, 'enigma.license');
    const { privateKey, keyring, kid } = await fixture();
    const other = await fixture('other-kid');
    try {
      const good = await sign(claims({ key_id: kid }), privateKey, kid);
      await writeFile(path, `${good}\n`, 'utf8');
      const before = await readFile(path, 'utf8');

      const badSig = await installSignedLicenseDocument({
        document: good.slice(0, -6) + 'XXXXXX',
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        keyring,
      });
      expect(badSig.ok).toBe(false);
      if (!badSig.ok) expect(badSig.reason_code).toBe('LICENSE_INVALID_SIGNATURE');

      const unknown = await installSignedLicenseDocument({
        document: await sign(
          claims({ key_id: 'other-kid' }),
          other.privateKey,
          'other-kid',
        ),
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        keyring,
      });
      expect(unknown.ok).toBe(false);
      if (!unknown.ok) expect(unknown.reason_code).toBe('LICENSE_UNKNOWN_KEY');

      const malformed = await installSignedLicenseDocument({
        document: 'not-a-jws',
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        keyring,
      });
      expect(malformed.ok).toBe(false);
      if (!malformed.ok) expect(malformed.reason_code).toBe('LICENSE_MALFORMED');

      expect(await readFile(path, 'utf8')).toBe(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('expired within grace installs as GRACE', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lic-grace-'));
    const path = join(dir, 'enigma.license');
    const { privateKey, keyring, kid } = await fixture();
    try {
      const token = await sign(
        claims({
          key_id: kid,
          valid_from: '2025-01-01',
          valid_until: '2026-08-01',
          grace_days: 30,
        }),
        privateKey,
        kid,
      );
      const result = await installSignedLicenseDocument({
        document: token,
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        now: new Date('2026-08-15T12:00:00Z'),
        keyring,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.status).toBe('GRACE');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('renewal replaces with new License ID, same Deployment ID', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lic-renew-'));
    const path = join(dir, 'enigma.license');
    const { privateKey, keyring, kid } = await fixture();
    try {
      const l1 = await sign(
        claims({ key_id: kid, license_id: 'LIC-001' }),
        privateKey,
        kid,
      );
      await installSignedLicenseDocument({
        document: l1,
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        keyring,
      });
      const l2 = await sign(
        claims({
          key_id: kid,
          license_id: 'LIC-002',
          valid_from: '2027-01-01',
          valid_until: '2028-12-31',
        }),
        privateKey,
        kid,
      );
      const renewed = await installSignedLicenseDocument({
        document: l2,
        installationDeploymentId: DEPLOYMENT,
        licensePath: path,
        now: new Date('2027-06-01T12:00:00Z'),
        keyring,
      });
      expect(renewed.ok).toBe(true);
      if (!renewed.ok) return;
      expect(renewed.license.license_id).toBe('LIC-002');
      expect(renewed.license.deployment_id).toBe(DEPLOYMENT);
      expect(renewed.license.valid_until).toBe('2028-12-31');
      expect(renewed.status).toBe('ACTIVE');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('license install HTTP', () => {
  it('end-to-end: retrieve deployment_id → sign → install → ACTIVE; mismatch rejected; renewal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lic-http-'));
    const path = join(dir, 'enigma.license');
    const { privateKey, keyring, kid } = await fixture();
    const store = new InMemoryDeploymentIdentityStore({
      deployment_id: DEPLOYMENT,
    });

    await withEnvPath(path, async () => {
      const gw = createPhase1Gateway({
        config: { adminApiKey: 'test_admin' },
        deploymentIdentity: store,
        licenseInstallKeyring: keyring,
      });
      const server = await gw.buildServer();
      try {
        const system = await server.inject({
          method: 'GET',
          url: '/v1/admin/system',
          headers: { authorization: 'Bearer test_admin' },
        });
        expect(system.statusCode).toBe(200);
        const deploymentId = system.json().deployment.deployment_id as string;
        expect(deploymentId).toBe(DEPLOYMENT);

        const token = await sign(
          claims({ key_id: kid, deployment_id: deploymentId }),
          privateKey,
          kid,
        );

        const unauth = await server.inject({
          method: 'POST',
          url: '/v1/admin/license/install',
          headers: { 'content-type': 'application/json' },
          payload: { license_document: token },
        });
        expect(unauth.statusCode).toBe(401);

        const installed = await server.inject({
          method: 'POST',
          url: '/v1/admin/license/install',
          headers: {
            authorization: 'Bearer test_admin',
            'content-type': 'application/json',
          },
          payload: { license_document: token },
        });
        expect(installed.statusCode).toBe(200);
        expect(installed.json().status).toBe('ACTIVE');
        expect(installed.json().license.license_id).toBe('ENIGMA-INSTALL-001');
        expect(installed.json().license.deployment_id).toBe(deploymentId);
        expect(installed.json().license).not.toHaveProperty('jws');
        expect(JSON.stringify(installed.json())).not.toContain(token);

        const after = await server.inject({
          method: 'GET',
          url: '/v1/admin/system',
          headers: { authorization: 'Bearer test_admin' },
        });
        expect(after.json().license.status).toBe('ACTIVE');
        expect(after.json().deployment.deployment_id).toBe(deploymentId);

        // AI allowed under production with installed license
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
        expect(ai.statusCode).not.toBe(403);

        // Negative: wrong deployment binding
        const wrong = await sign(
          claims({ key_id: kid, deployment_id: OTHER }),
          privateKey,
          kid,
        );
        const beforeDisk = await readFile(path, 'utf8');
        const mismatch = await server.inject({
          method: 'POST',
          url: '/v1/admin/license/install',
          headers: {
            authorization: 'Bearer test_admin',
            'content-type': 'application/json',
          },
          payload: { license_document: wrong },
        });
        expect(mismatch.statusCode).toBe(400);
        expect(mismatch.json().reason_code).toBe('LICENSE_DEPLOYMENT_MISMATCH');
        expect(await readFile(path, 'utf8')).toBe(beforeDisk);

        // Renewal
        const renewedToken = await sign(
          claims({
            key_id: kid,
            deployment_id: deploymentId,
            license_id: 'ENIGMA-INSTALL-002',
            valid_until: '2028-12-31',
          }),
          privateKey,
          kid,
        );
        const renew = await server.inject({
          method: 'POST',
          url: '/v1/admin/license/install',
          headers: {
            authorization: 'Bearer test_admin',
            'content-type': 'application/json',
          },
          payload: { license_document: renewedToken },
        });
        expect(renew.statusCode).toBe(200);
        expect(renew.json().license.license_id).toBe('ENIGMA-INSTALL-002');
        expect(renew.json().license.deployment_id).toBe(deploymentId);
        expect(renew.json().license.valid_until).toBe('2028-12-31');
        expect(renew.json().status).toBe('ACTIVE');

        // Multipart upload path
        const mpBody = multipartLicenseBody(renewedToken);
        const mp = await server.inject({
          method: 'POST',
          url: '/v1/admin/license/install',
          headers: {
            authorization: 'Bearer test_admin',
            ...mpBody.headers,
          },
          payload: mpBody.payload,
        });
        expect(mp.statusCode).toBe(200);
        expect(mp.json().status).toBe('ACTIVE');
      } finally {
        await server.close();
      }
    });

    await rm(dir, { recursive: true, force: true });
  });

  it('air-gapped: install has no network dependency (offline verify)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lic-air-'));
    const path = join(dir, 'enigma.license');
    const { privateKey, keyring, kid } = await fixture();
    const token = await sign(claims({ key_id: kid }), privateKey, kid);
    // Pure local verify+write — no fetch/DNS
    const result = await installSignedLicenseDocument({
      document: token,
      installationDeploymentId: DEPLOYMENT,
      licensePath: path,
      keyring,
    });
    expect(result.ok).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});
