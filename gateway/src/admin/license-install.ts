/**
 * Atomic installation of a Foundry360-signed license file.
 *
 * Validates with existing signed-license verification before any write.
 * Failed validation never replaces an existing license on disk.
 */

import { open, mkdir, rename, unlink, access, constants, readFile } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import type { LicensePublicKeyEntry } from './license-keys.js';
import {
  resolvePlatformLicense,
  type EnigmaLicenseView,
  type LicenseEnv,
} from './license.js';
import {
  verifyAndEvaluateSignedLicense,
  type LicenseReasonCode,
  type PlatformLicenseResult,
} from './signed-license.js';

/** Max size for a compact JWS license document (bytes). */
export const MAX_LICENSE_UPLOAD_BYTES = 64 * 1024;

export type LicenseInstallSuccess = {
  ok: true;
  status: EnigmaLicenseView['status'];
  license: {
    license_id: string | null;
    customer_name: string | null;
    deployment_id: string;
    deployment_type: string | null;
    valid_from: string | null;
    valid_until: string | null;
    grace_days: number | null;
    grace_ends: string | null;
    key_id: string | null;
    deployment_bound: boolean;
    source: string;
  };
  view: EnigmaLicenseView;
};

export type LicenseInstallFailure = {
  ok: false;
  reason_code:
    | Exclude<LicenseReasonCode, null>
    | 'LICENSE_PATH_NOT_CONFIGURED'
    | 'LICENSE_TOO_LARGE'
    | 'LICENSE_INSTALL_FAILED';
  message: string;
  /** Current on-disk license view after failed attempt (unchanged). */
  current: EnigmaLicenseView | null;
};

function isCompactJws(token: string): boolean {
  const parts = token.trim().split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export function resolveLicenseInstallPath(
  env: LicenseEnv | NodeJS.ProcessEnv = process.env,
): string | null {
  const configured = env.ENIGMA_LICENSE_PATH?.trim();
  if (configured) return resolve(configured);
  return null;
}

function viewFromEvaluated(result: PlatformLicenseResult): EnigmaLicenseView {
  const status = result.status;
  return {
    license_id: result.license_id,
    customer_name: result.customer_name,
    license_type: 'signed',
    deployment_type: result.deployment_type,
    start_date: result.valid_from,
    expiration_date: result.valid_until,
    valid_from: result.valid_from,
    valid_until: result.valid_until,
    status,
    reason: result.renewal_message,
    reason_code: result.reason_code,
    deployment_bound: result.deployment_bound,
    days_remaining: result.days_remaining,
    grace_days_remaining: result.grace_days_remaining,
    grace_ends: result.grace_ends,
    grace_ends_date: result.grace_ends,
    key_id: result.key_id,
    source: 'file',
    mode: 'production',
    operational: result.operational,
    renewal_band:
      status === 'INVALID'
        ? 'invalid'
        : status === 'DISABLED'
          ? 'disabled'
          : status === 'GRACE'
            ? 'grace'
            : 'comfortable',
    renewal_message: result.renewal_message,
  };
}

export function toInstallResponseLicense(
  view: EnigmaLicenseView,
  installationDeploymentId: string,
  graceDays: number | null = null,
): LicenseInstallSuccess['license'] {
  return {
    license_id: view.license_id,
    customer_name: view.customer_name,
    deployment_id: installationDeploymentId,
    deployment_type: view.deployment_type,
    valid_from: view.valid_from,
    valid_until: view.valid_until,
    grace_days: graceDays,
    grace_ends: view.grace_ends,
    key_id: view.key_id,
    deployment_bound: view.deployment_bound,
    source: view.source,
  };
}

/**
 * Validate then atomically write a signed license to ENIGMA_LICENSE_PATH.
 */
export async function installSignedLicenseDocument(opts: {
  document: string;
  installationDeploymentId: string;
  licensePath: string;
  now?: Date;
  env?: LicenseEnv | NodeJS.ProcessEnv;
  keyring?: readonly LicensePublicKeyEntry[];
}): Promise<LicenseInstallSuccess | LicenseInstallFailure> {
  const raw = opts.document.trim();
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_LICENSE_UPLOAD_BYTES) {
    return {
      ok: false,
      reason_code: raw ? 'LICENSE_TOO_LARGE' : 'LICENSE_MALFORMED',
      message: raw
        ? 'License document exceeds maximum allowed size'
        : 'License document is empty',
      current: null,
    };
  }
  if (!isCompactJws(raw)) {
    return {
      ok: false,
      reason_code: 'LICENSE_MALFORMED',
      message: 'License document must be a compact JWS',
      current: null,
    };
  }

  const target = resolve(opts.licensePath);
  if (basename(target).includes('..')) {
    return {
      ok: false,
      reason_code: 'LICENSE_INSTALL_FAILED',
      message: 'Invalid license path configuration',
      current: null,
    };
  }

  const env = opts.env ?? process.env;
  let current: EnigmaLicenseView | null = null;
  try {
    current = await resolvePlatformLicense({
      env,
      installationDeploymentId: opts.installationDeploymentId,
      now: opts.now,
    });
  } catch {
    current = null;
  }

  const evaluated = await verifyAndEvaluateSignedLicense({
    token: raw,
    installationDeploymentId: opts.installationDeploymentId,
    now: opts.now,
    source: 'file',
    keyring: opts.keyring,
  });

  // Only install cryptographically valid + deployment-bound licenses.
  if (evaluated.status === 'INVALID' || !evaluated.deployment_bound) {
    const reason = evaluated.reason_code ?? ('LICENSE_MALFORMED' as const);
    return {
      ok: false,
      reason_code: reason === null ? 'LICENSE_MALFORMED' : reason,
      message: evaluated.renewal_message ?? 'License validation failed',
      current,
    };
  }

  const dir = dirname(target);
  const tmp = resolve(
    dir,
    `.${basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    await mkdir(dir, { recursive: true });
    const fh = await open(tmp, 'w', 0o644);
    try {
      await fh.writeFile(`${raw}\n`, 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, target);
  } catch (err) {
    try {
      await unlink(tmp);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      reason_code: 'LICENSE_INSTALL_FAILED',
      message:
        err instanceof Error
          ? `Failed to write license file: ${err.message}`
          : 'Failed to write license file',
      current,
    };
  }

  try {
    const onDisk = (await readFile(target, 'utf8')).trim();
    if (onDisk !== raw) {
      return {
        ok: false,
        reason_code: 'LICENSE_INSTALL_FAILED',
        message: 'License file write verification failed',
        current,
      };
    }
  } catch (err) {
    return {
      ok: false,
      reason_code: 'LICENSE_INSTALL_FAILED',
      message:
        err instanceof Error
          ? `Failed to read installed license: ${err.message}`
          : 'Failed to read installed license',
      current,
    };
  }

  // Status from the validated evaluation (same keyring used to accept the file).
  const view = viewFromEvaluated(evaluated);
  return {
    ok: true,
    status: view.status,
    license: toInstallResponseLicense(
      view,
      opts.installationDeploymentId,
      evaluated.claims?.grace_days ?? null,
    ),
    view,
  };
}

export async function licensePathIsWritable(path: string): Promise<boolean> {
  try {
    const dir = dirname(resolve(path));
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
