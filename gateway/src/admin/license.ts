/**
 * Enigma platform license service (Phase 2).
 *
 * Signed offline licenses bound to persistent deployment_id.
 * Platform availability only — not part of EPA / PDP / policy evaluations.
 *
 * Development mode retains unsigned env/default licenses for local workflows.
 * Production mode requires a valid signed license file (or env document) and fails closed.
 */

import { readFile } from 'node:fs/promises';
import {
  LICENSE_GRACE_PERIOD_DAYS,
  addUtcDays,
  calendarDaysBetween,
  daysRemainingUntil,
  formatDateOnlyUtc,
  parseDateOnlyUtc,
  utcToday,
  type LicenseDeploymentType,
} from './license-dates.js';
import {
  verifyAndEvaluateSignedLicense,
  type LicenseReasonCode,
  type PlatformLicenseResult,
  type SignedLicenseStatus,
} from './signed-license.js';
import type { DeploymentIdentityStore } from './deployment-identity.js';

export {
  LICENSE_GRACE_PERIOD_DAYS,
  addUtcDays,
  calendarDaysBetween,
  daysRemainingUntil,
  formatDateOnlyUtc,
  parseDateOnlyUtc,
  utcToday,
  type LicenseDeploymentType,
} from './license-dates.js';

export type {
  LicenseReasonCode,
  PlatformLicenseResult,
  SignedLicenseClaims,
  SignedLicenseStatus,
} from './signed-license.js';

export type LicenseType = 'annual' | 'signed';
/** @deprecated Prefer uppercase SignedLicenseStatus from platform resolution. */
export type LicenseStatus = 'active' | 'grace' | 'disabled';

export type LicenseRenewalBand =
  | 'comfortable'
  | 'approaching'
  | 'required_soon'
  | 'expires_soon'
  | 'grace'
  | 'disabled'
  | 'invalid';

export type LicenseMode = 'development' | 'production';

export type LicenseSource =
  | 'file'
  | 'env_document'
  | 'development'
  | 'none';

/** Admin / gate view — Phase 2 fields with legacy aliases for existing UI. */
export interface EnigmaLicenseView {
  license_id: string | null;
  customer_name: string | null;
  license_type: LicenseType;
  deployment_type: LicenseDeploymentType | null;
  /** ISO calendar date YYYY-MM-DD */
  start_date: string | null;
  /** ISO calendar date YYYY-MM-DD (renewal / expiration) */
  expiration_date: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status: SignedLicenseStatus;
  /** Platform reason when not operational / invalid. */
  reason: string | null;
  reason_code: LicenseReasonCode;
  deployment_bound: boolean;
  days_remaining: number;
  grace_days_remaining: number;
  grace_ends: string | null;
  /** @deprecated alias of grace_ends */
  grace_ends_date: string | null;
  key_id: string | null;
  source: LicenseSource;
  mode: LicenseMode;
  operational: boolean;
  renewal_band: LicenseRenewalBand;
  renewal_message: string | null;
}

export type LicenseEnv = {
  ENIGMA_LICENSE_MODE?: string;
  ENIGMA_LICENSE_PATH?: string;
  ENIGMA_LICENSE_DOCUMENT?: string;
  ENIGMA_LICENSE_ID?: string;
  ENIGMA_LICENSE_CUSTOMER?: string;
  ENIGMA_LICENSE_START_DATE?: string;
  ENIGMA_LICENSE_EXPIRATION_DATE?: string;
  ENIGMA_LICENSE_DEPLOYMENT_TYPE?: string;
  GATEWAY_DEPLOYMENT_MODE?: string;
  NODE_ENV?: string;
  [key: string]: string | undefined;
};

const DEV_DEFAULTS = {
  license_id: 'ENIGMA-DEV-001',
  customer_name: 'Development Organization',
  start_date: '2026-09-01',
  expiration_date: '2027-09-01',
} as const;

/**
 * Resolve license mode.
 *
 * - Explicit `ENIGMA_LICENSE_MODE=production|development` wins.
 * - Otherwise production when `NODE_ENV=production` or Compose air-gap / connected
 *   appliance markers that set production mode via env (Compose sets ENIGMA_LICENSE_MODE).
 * - Local tests / unset default to development so workflows stay practical.
 *
 * Production never fail-opens on a missing license.
 */
export function resolveLicenseMode(
  env: LicenseEnv | NodeJS.ProcessEnv = process.env,
): LicenseMode {
  const explicit = (env.ENIGMA_LICENSE_MODE ?? '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'prod') return 'production';
  if (explicit === 'development' || explicit === 'dev') return 'development';
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
    return 'production';
  }
  return 'development';
}

export function licenseStatusFromDaysPastExpiration(
  daysPastExpiration: number,
  graceDays: number = LICENSE_GRACE_PERIOD_DAYS,
): LicenseStatus {
  if (daysPastExpiration <= 0) return 'active';
  if (daysPastExpiration <= graceDays) return 'grace';
  return 'disabled';
}

export function renewalBandFromLicense(opts: {
  daysUntilExpiration: number;
  status: LicenseStatus | SignedLicenseStatus;
}): LicenseRenewalBand {
  const status = String(opts.status).toLowerCase();
  if (status === 'disabled') return 'disabled';
  if (status === 'invalid') return 'invalid';
  if (status === 'grace') return 'grace';
  const days = opts.daysUntilExpiration;
  if (days <= 6) return 'expires_soon';
  if (days <= 29) return 'required_soon';
  if (days <= 90) return 'approaching';
  return 'comfortable';
}

export function renewalMessageForBand(band: LicenseRenewalBand): string | null {
  switch (band) {
    case 'approaching':
      return 'Renewal approaching';
    case 'required_soon':
      return 'Renewal required soon';
    case 'expires_soon':
      return 'License expires soon';
    case 'grace':
      return 'License expired — 30-day grace period in effect';
    case 'disabled':
      return 'License disabled — renewal required to restore service';
    case 'invalid':
      return 'License is invalid';
    default:
      return null;
  }
}

export function formatDaysRemainingLabel(
  days: number,
  status: LicenseStatus | SignedLicenseStatus | string,
  graceDaysRemaining = 0,
): string {
  const s = String(status).toLowerCase();
  if (s === 'disabled') return 'Disabled';
  if (s === 'invalid') return 'Invalid';
  if (s === 'grace') {
    const n = Math.max(0, graceDaysRemaining);
    return n === 1
      ? 'Grace period: 1 day remaining'
      : `Grace period: ${n} days remaining`;
  }
  if (days < 0) return 'Expired';
  const n = Math.max(0, days);
  return n === 1 ? '1 day remaining' : `${n} days remaining`;
}

/**
 * True when governed AI paths may run.
 * Missing/null license is never operational (fail closed at the gate).
 * Development resolve always returns a view; production missing returns INVALID.
 */
export function isLicenseOperational(
  license: EnigmaLicenseView | PlatformLicenseResult | null | undefined,
): boolean {
  if (!license) return false;
  return license.operational === true;
}

function parseDeploymentType(
  raw: string | undefined,
  fallbackMode: 'connected' | 'airgap',
): LicenseDeploymentType {
  const v = (raw ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (v === 'air_gapped' || v === 'airgapped' || v === 'airgap') {
    return 'air_gapped';
  }
  if (v === 'vpc') return 'vpc';
  return fallbackMode === 'airgap' ? 'air_gapped' : 'vpc';
}

function toAdminView(
  result: PlatformLicenseResult,
  mode: LicenseMode,
): EnigmaLicenseView {
  const status = result.status;
  const lower = status.toLowerCase() as LicenseStatus | 'invalid';
  const renewal_band =
    status === 'INVALID'
      ? 'invalid'
      : renewalBandFromLicense({
          daysUntilExpiration: result.days_remaining,
          status: lower === 'invalid' ? 'disabled' : (lower as LicenseStatus),
        });

  return {
    license_id: result.license_id,
    customer_name: result.customer_name,
    license_type: result.source === 'development' ? 'annual' : 'signed',
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
    source: result.source,
    mode,
    operational: result.operational,
    renewal_band,
    renewal_message: result.renewal_message,
  };
}

function developmentLicenseView(
  env: LicenseEnv | NodeJS.ProcessEnv,
  now: Date,
  mode: LicenseMode,
): EnigmaLicenseView {
  const deploymentMode =
    env.GATEWAY_DEPLOYMENT_MODE === 'airgap' ? 'airgap' : 'connected';

  const license_id =
    env.ENIGMA_LICENSE_ID?.trim() || DEV_DEFAULTS.license_id;
  const customer_name =
    env.ENIGMA_LICENSE_CUSTOMER?.trim() || DEV_DEFAULTS.customer_name;
  const start_date =
    env.ENIGMA_LICENSE_START_DATE?.trim() || DEV_DEFAULTS.start_date;
  const expiration_date =
    env.ENIGMA_LICENSE_EXPIRATION_DATE?.trim() || DEV_DEFAULTS.expiration_date;
  const deployment_type = parseDeploymentType(
    env.ENIGMA_LICENSE_DEPLOYMENT_TYPE,
    deploymentMode,
  );

  const exp = parseDateOnlyUtc(expiration_date);
  if (!parseDateOnlyUtc(start_date) || !exp) {
    return toAdminView(
      {
        status: 'INVALID',
        reason_code: 'LICENSE_MALFORMED',
        operational: false,
        license_id: null,
        customer_name: null,
        deployment_type: null,
        deployment_bound: false,
        valid_from: null,
        valid_until: null,
        grace_ends: null,
        days_remaining: 0,
        grace_days_remaining: 0,
        key_id: null,
        source: 'development',
        renewal_message: 'License dates are malformed',
        claims: null,
      },
      mode,
    );
  }

  const daysUntil = daysRemainingUntil(expiration_date, now);
  if (daysUntil === null) {
    return toAdminView(
      {
        status: 'INVALID',
        reason_code: 'LICENSE_MALFORMED',
        operational: false,
        license_id: null,
        customer_name: null,
        deployment_type: null,
        deployment_bound: false,
        valid_from: null,
        valid_until: null,
        grace_ends: null,
        days_remaining: 0,
        grace_days_remaining: 0,
        key_id: null,
        source: 'development',
        renewal_message: 'License dates are malformed',
        claims: null,
      },
      mode,
    );
  }

  const daysPastExpiration = Math.max(0, -daysUntil);
  const legacyStatus = licenseStatusFromDaysPastExpiration(daysPastExpiration);
  const status = legacyStatus.toUpperCase() as SignedLicenseStatus;
  const graceEnds = addUtcDays(exp, LICENSE_GRACE_PERIOD_DAYS);
  const grace_ends = formatDateOnlyUtc(graceEnds);
  const grace_days_remaining =
    legacyStatus === 'grace'
      ? Math.max(0, calendarDaysBetween(utcToday(now), graceEnds))
      : 0;
  const renewal_band = renewalBandFromLicense({
    daysUntilExpiration: daysUntil,
    status: legacyStatus,
  });
  const renewal_message = renewalMessageForBand(renewal_band);

  return {
    license_id,
    customer_name,
    license_type: 'annual',
    deployment_type,
    start_date,
    expiration_date,
    valid_from: start_date,
    valid_until: expiration_date,
    status,
    reason: renewal_message,
    reason_code: legacyStatus === 'disabled' ? 'LICENSE_DISABLED' : null,
    deployment_bound: false,
    days_remaining: Math.max(0, daysUntil),
    grace_days_remaining,
    grace_ends,
    grace_ends_date: grace_ends,
    key_id: null,
    source: 'development',
    mode,
    operational: legacyStatus !== 'disabled',
    renewal_band,
    renewal_message,
  };
}

async function loadSignedDocument(
  env: LicenseEnv | NodeJS.ProcessEnv,
): Promise<{ token: string; source: 'file' | 'env_document' } | null> {
  const path = env.ENIGMA_LICENSE_PATH?.trim();
  if (path) {
    try {
      const token = await readFile(path, 'utf8');
      if (token.trim()) return { token: token.trim(), source: 'file' };
    } catch {
      // Missing/unreadable file → treat as missing when no env document.
    }
  }
  const doc = env.ENIGMA_LICENSE_DOCUMENT?.trim();
  if (doc) return { token: doc, source: 'env_document' };
  return null;
}

/**
 * Resolve platform license for AI gate and System Administration.
 */
export async function resolvePlatformLicense(opts: {
  env?: LicenseEnv | NodeJS.ProcessEnv;
  installationDeploymentId: string;
  now?: Date;
  /** Test-only verification keyring override. */
  keyring?: readonly import('./license-keys.js').LicensePublicKeyEntry[];
}): Promise<EnigmaLicenseView> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const mode = resolveLicenseMode(env);

  const signed = await loadSignedDocument(env);
  if (signed) {
    const result = await verifyAndEvaluateSignedLicense({
      token: signed.token,
      installationDeploymentId: opts.installationDeploymentId,
      now,
      source: signed.source,
      keyring: opts.keyring,
    });
    return toAdminView(result, mode);
  }

  if (mode === 'production') {
    return toAdminView(
      {
        status: 'INVALID',
        reason_code: 'LICENSE_MISSING',
        operational: false,
        license_id: null,
        customer_name: null,
        deployment_type: null,
        deployment_bound: false,
        valid_from: null,
        valid_until: null,
        grace_ends: null,
        days_remaining: 0,
        grace_days_remaining: 0,
        key_id: null,
        source: 'none',
        renewal_message: 'Signed license required',
        claims: null,
      },
      mode,
    );
  }

  return developmentLicenseView(env, now, mode);
}

/**
 * Convenience for HTTP handlers with deployment identity store.
 */
export async function resolvePlatformLicenseFromStore(opts: {
  env?: LicenseEnv | NodeJS.ProcessEnv;
  deploymentIdentity?: DeploymentIdentityStore | null;
  now?: Date;
  /** Test-only verification keyring override. */
  keyring?: readonly import('./license-keys.js').LicensePublicKeyEntry[];
}): Promise<EnigmaLicenseView> {
  let deploymentId = '00000000-0000-4000-8000-000000000000';
  if (opts.deploymentIdentity) {
    deploymentId = await opts.deploymentIdentity.getOrCreateDeploymentId();
  } else if (resolveLicenseMode(opts.env ?? process.env) === 'production') {
    // Cannot establish binding without identity store.
    return toAdminView(
      {
        status: 'INVALID',
        reason_code: 'LICENSE_DEPLOYMENT_MISMATCH',
        operational: false,
        license_id: null,
        customer_name: null,
        deployment_type: null,
        deployment_bound: false,
        valid_from: null,
        valid_until: null,
        grace_ends: null,
        days_remaining: 0,
        grace_days_remaining: 0,
        key_id: null,
        source: 'none',
        renewal_message: 'Unable to establish deployment binding',
        claims: null,
      },
      'production',
    );
  }
  return resolvePlatformLicense({
    env: opts.env,
    installationDeploymentId: deploymentId,
    now: opts.now,
    keyring: opts.keyring,
  });
}

/**
 * Sync development/env loader kept for unit tests of unsigned renewal math.
 * Prefer `resolvePlatformLicense` for production paths.
 *
 * In development (default), returns unsigned env/default license view.
 * When dates are invalid, returns null (caller should treat carefully).
 */
export function loadEnigmaLicense(
  env: LicenseEnv | NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): EnigmaLicenseView | null {
  const mode = resolveLicenseMode(env);
  if (mode === 'production') {
    // Sync API cannot verify signed licenses — return missing fail-closed shape.
    return toAdminView(
      {
        status: 'INVALID',
        reason_code: 'LICENSE_MISSING',
        operational: false,
        license_id: null,
        customer_name: null,
        deployment_type: null,
        deployment_bound: false,
        valid_from: null,
        valid_until: null,
        grace_ends: null,
        days_remaining: 0,
        grace_days_remaining: 0,
        key_id: null,
        source: 'none',
        renewal_message: 'Signed license required',
        claims: null,
      },
      mode,
    );
  }

  const view = developmentLicenseView(env, now, mode);
  if (
    view.status === 'INVALID' &&
    view.reason_code === 'LICENSE_MALFORMED' &&
    !env.ENIGMA_LICENSE_START_DATE &&
    !env.ENIGMA_LICENSE_EXPIRATION_DATE
  ) {
    return view;
  }
  if (view.status === 'INVALID' && view.reason_code === 'LICENSE_MALFORMED') {
    // Preserve prior test contract: invalid explicit dates → null
    if (
      env.ENIGMA_LICENSE_START_DATE?.trim() ||
      env.ENIGMA_LICENSE_EXPIRATION_DATE?.trim()
    ) {
      return null;
    }
  }
  return view;
}

/** Body for AI path 403 responses. */
export function licenseBlockedBody(license: EnigmaLicenseView | null) {
  const reason =
    license?.reason_code && license.reason_code !== 'LICENSE_DISABLED'
      ? license.reason_code
      : 'LICENSE_DISABLED';
  const message =
    license?.renewal_message ||
    (reason === 'LICENSE_DISABLED'
      ? 'Enigma license grace period has ended. Renew the license to restore AI service.'
      : 'Enigma license is invalid or missing. Install a valid signed license to restore AI service.');
  return {
    status: 'blocked',
    reason_code: reason,
    message,
  };
}

/** Pure evaluate helper re-export for tests. */
export { evaluateVerifiedLicense, verifySignedLicenseJws } from './signed-license.js';
