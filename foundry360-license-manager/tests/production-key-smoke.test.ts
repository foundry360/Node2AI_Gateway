/**
 * Optional smoke: signs with the vendor production private key (if present)
 * and verifies against Enigma's shipping public keyring.
 *
 * Skips when ~/.enigma-license-signing/enigma-lic-2026-09.private.jwk is absent.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildEnigmaLicenseClaims, signEnigmaLicenseClaims } from '../src/lib/signing';
import { verifyAndEvaluateSignedLicense } from '../../gateway/src/admin/signed-license';
import { LICENSE_PUBLIC_KEYRING } from '../../gateway/src/admin/license-keys';

const KEY = join(
  homedir(),
  '.enigma-license-signing',
  'enigma-lic-2026-09.private.jwk',
);

const DEPLOYMENT_ID = '7f3c8c2e-1234-4abc-9def-0123456789ab';

describe('production keyring smoke', () => {
  it('signs with vendor private key and Enigma keyring accepts ACTIVE', async () => {
    if (!existsSync(KEY)) {
      console.warn('Skipping production key smoke — private key not on host');
      return;
    }
    process.env.ENIGMA_LICENSE_PRIVATE_KEY_PATH = KEY;
    const claims = buildEnigmaLicenseClaims({
      customer_name: 'Acme Health',
      license_id: 'ENIGMA-ACME-SMOKE-2026-001',
      deployment_id: DEPLOYMENT_ID,
      deployment_type: 'VPC',
      valid_from: '2026-01-01',
      valid_until: '2027-12-31',
      grace_days: 30,
      key_id: 'enigma-lic-2026-09',
    });
    const { token } = await signEnigmaLicenseClaims(claims);
    const result = await verifyAndEvaluateSignedLicense({
      token,
      installationDeploymentId: DEPLOYMENT_ID,
      source: 'file',
      keyring: LICENSE_PUBLIC_KEYRING,
      now: new Date('2026-06-15T12:00:00Z'),
    });
    expect(result.status).toBe('ACTIVE');
  });
});
