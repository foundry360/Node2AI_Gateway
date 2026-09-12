/**
 * Ed25519 (EdDSA / JWS) signed offline license verification.
 *
 * Platform availability only — not part of the Enterprise Policy Architecture.
 */

import { compactVerify, importJWK, type JWK } from 'jose';
import {
  LICENSE_PUBLIC_KEYRING,
  lookupLicensePublicKey,
  type LicensePublicKeyEntry,
} from './license-keys.js';
import {
  LICENSE_GRACE_PERIOD_DAYS,
  addUtcDays,
  calendarDaysBetween,
  formatDateOnlyUtc,
  parseDateOnlyUtc,
  utcToday,
  type LicenseDeploymentType,
} from './license-dates.js';

export type SignedLicenseStatus =
  | 'ACTIVE'
  | 'GRACE'
  | 'DISABLED'
  | 'INVALID';

export type LicenseReasonCode =
  | 'LICENSE_INVALID_SIGNATURE'
  | 'LICENSE_DEPLOYMENT_MISMATCH'
  | 'LICENSE_UNKNOWN_KEY'
  | 'LICENSE_UNSUPPORTED_VERSION'
  | 'LICENSE_NOT_YET_VALID'
  | 'LICENSE_MISSING'
  | 'LICENSE_DISABLED'
  | 'LICENSE_MALFORMED'
  | 'LICENSE_MISSING_CLAIM'
  | null;

export type SignedLicenseClaims = {
  license_version: number;
  license_id: string;
  customer_name: string;
  deployment_id: string;
  deployment_type: LicenseDeploymentType;
  valid_from: string;
  valid_until: string;
  issued_at: string;
  key_id: string;
  grace_days: number;
};

export type PlatformLicenseResult = {
  status: SignedLicenseStatus;
  reason_code: LicenseReasonCode;
  operational: boolean;
  license_id: string | null;
  customer_name: string | null;
  deployment_type: LicenseDeploymentType | null;
  deployment_bound: boolean;
  valid_from: string | null;
  valid_until: string | null;
  grace_ends: string | null;
  days_remaining: number;
  grace_days_remaining: number;
  key_id: string | null;
  source: 'file' | 'env_document' | 'development' | 'none';
  renewal_message: string | null;
  claims: SignedLicenseClaims | null;
};

const REQUIRED_CLAIMS = [
  'license_version',
  'license_id',
  'customer_name',
  'deployment_id',
  'deployment_type',
  'valid_from',
  'valid_until',
  'issued_at',
  'key_id',
  'grace_days',
] as const;

function invalid(
  reason_code: Exclude<LicenseReasonCode, null>,
  source: PlatformLicenseResult['source'],
  partial: Partial<PlatformLicenseResult> = {},
): PlatformLicenseResult {
  return {
    status: 'INVALID',
    reason_code,
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
    source,
    renewal_message: reasonMessage(reason_code),
    claims: null,
    ...partial,
  };
}

function reasonMessage(code: Exclude<LicenseReasonCode, null>): string {
  switch (code) {
    case 'LICENSE_MISSING':
      return 'Signed license required';
    case 'LICENSE_MALFORMED':
      return 'License document is malformed';
    case 'LICENSE_MISSING_CLAIM':
      return 'License is missing a required claim';
    case 'LICENSE_INVALID_SIGNATURE':
      return 'License signature is invalid';
    case 'LICENSE_UNKNOWN_KEY':
      return 'License signing key is unknown';
    case 'LICENSE_UNSUPPORTED_VERSION':
      return 'Unsupported license version';
    case 'LICENSE_DEPLOYMENT_MISMATCH':
      return 'License is not bound to this deployment';
    case 'LICENSE_NOT_YET_VALID':
      return 'License is not yet valid';
    case 'LICENSE_DISABLED':
      return 'License disabled — renewal required to restore service';
    default:
      return 'License is invalid';
  }
}

function parseDeploymentTypeClaim(raw: unknown): LicenseDeploymentType | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase().replace(/-/g, '_');
  if (v === 'vpc') return 'vpc';
  if (v === 'air_gapped' || v === 'airgapped' || v === 'airgap') return 'air_gapped';
  return null;
}

export function parseSignedLicenseClaims(
  payload: Record<string, unknown>,
): { ok: true; claims: SignedLicenseClaims } | { ok: false; reason: Exclude<LicenseReasonCode, null> } {
  for (const key of REQUIRED_CLAIMS) {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      return { ok: false, reason: 'LICENSE_MISSING_CLAIM' };
    }
  }

  const license_version = Number(payload.license_version);
  if (!Number.isInteger(license_version) || license_version !== 1) {
    return { ok: false, reason: 'LICENSE_UNSUPPORTED_VERSION' };
  }

  const deployment_type = parseDeploymentTypeClaim(payload.deployment_type);
  if (!deployment_type) {
    return { ok: false, reason: 'LICENSE_MALFORMED' };
  }

  const valid_from = String(payload.valid_from);
  const valid_until = String(payload.valid_until);
  if (!parseDateOnlyUtc(valid_from) || !parseDateOnlyUtc(valid_until)) {
    return { ok: false, reason: 'LICENSE_MALFORMED' };
  }

  const grace_days = Number(payload.grace_days);
  if (!Number.isInteger(grace_days) || grace_days < 0 || grace_days > 3650) {
    return { ok: false, reason: 'LICENSE_MALFORMED' };
  }

  return {
    ok: true,
    claims: {
      license_version,
      license_id: String(payload.license_id),
      customer_name: String(payload.customer_name),
      deployment_id: String(payload.deployment_id),
      deployment_type,
      valid_from,
      valid_until,
      issued_at: String(payload.issued_at),
      key_id: String(payload.key_id),
      grace_days,
    },
  };
}

/**
 * Verify compact JWS (EdDSA) and return claims.
 * Does not evaluate term or deployment binding.
 */
export async function verifySignedLicenseJws(
  token: string,
  keyring: readonly LicensePublicKeyEntry[] = LICENSE_PUBLIC_KEYRING,
): Promise<
  | { ok: true; claims: SignedLicenseClaims; key_id: string }
  | { ok: false; reason: Exclude<LicenseReasonCode, null> }
> {
  const trimmed = token.trim();
  if (!trimmed || trimmed.split('.').length !== 3) {
    return { ok: false, reason: 'LICENSE_MALFORMED' };
  }

  let payloadJson: Record<string, unknown>;
  let headerKid: string | undefined;
  try {
    const parts = trimmed.split('.');
    const header = JSON.parse(
      Buffer.from(parts[0]!, 'base64url').toString('utf8'),
    ) as { alg?: string; kid?: string };
    if (header.alg !== 'EdDSA') {
      return { ok: false, reason: 'LICENSE_INVALID_SIGNATURE' };
    }
    headerKid = typeof header.kid === 'string' ? header.kid : undefined;
    payloadJson = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'LICENSE_MALFORMED' };
  }

  const keyId =
    (typeof payloadJson.key_id === 'string' && payloadJson.key_id) ||
    headerKid ||
    '';
  if (!keyId) {
    return { ok: false, reason: 'LICENSE_MISSING_CLAIM' };
  }

  const entry = lookupLicensePublicKey(keyId, keyring);
  if (!entry) {
    return { ok: false, reason: 'LICENSE_UNKNOWN_KEY' };
  }

  try {
    const key = await importJWK(entry.jwk as JWK, 'EdDSA');
    const { payload } = await compactVerify(trimmed, key);
    const verified = JSON.parse(new TextDecoder().decode(payload)) as Record<
      string,
      unknown
    >;
    const parsed = parseSignedLicenseClaims(verified);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    if (parsed.claims.key_id !== entry.key_id) {
      return { ok: false, reason: 'LICENSE_UNKNOWN_KEY' };
    }
    return { ok: true, claims: parsed.claims, key_id: entry.key_id };
  } catch {
    return { ok: false, reason: 'LICENSE_INVALID_SIGNATURE' };
  }
}

/**
 * After signature verification: bind deployment + evaluate term status.
 */
export function evaluateVerifiedLicense(opts: {
  claims: SignedLicenseClaims;
  installationDeploymentId: string;
  now?: Date;
  source: PlatformLicenseResult['source'];
}): PlatformLicenseResult {
  const { claims, installationDeploymentId, source } = opts;
  const now = opts.now ?? new Date();

  if (claims.deployment_id.trim() !== installationDeploymentId.trim()) {
    return invalid('LICENSE_DEPLOYMENT_MISMATCH', source, {
      license_id: claims.license_id,
      customer_name: claims.customer_name,
      deployment_type: claims.deployment_type,
      deployment_bound: false,
      valid_from: claims.valid_from,
      valid_until: claims.valid_until,
      key_id: claims.key_id,
      claims,
    });
  }

  const from = parseDateOnlyUtc(claims.valid_from)!;
  const until = parseDateOnlyUtc(claims.valid_until)!;
  const today = utcToday(now);
  const graceEnds = addUtcDays(until, claims.grace_days);
  const grace_ends = formatDateOnlyUtc(graceEnds);

  // valid_from inclusive
  if (calendarDaysBetween(today, from) > 0) {
    return invalid('LICENSE_NOT_YET_VALID', source, {
      license_id: claims.license_id,
      customer_name: claims.customer_name,
      deployment_type: claims.deployment_type,
      deployment_bound: true,
      valid_from: claims.valid_from,
      valid_until: claims.valid_until,
      grace_ends,
      key_id: claims.key_id,
      claims,
    });
  }

  // valid_until inclusive for contractual term
  const daysUntilEnd = calendarDaysBetween(today, until);
  if (daysUntilEnd >= 0) {
    return {
      status: 'ACTIVE',
      reason_code: null,
      operational: true,
      license_id: claims.license_id,
      customer_name: claims.customer_name,
      deployment_type: claims.deployment_type,
      deployment_bound: true,
      valid_from: claims.valid_from,
      valid_until: claims.valid_until,
      grace_ends,
      days_remaining: daysUntilEnd,
      grace_days_remaining: 0,
      key_id: claims.key_id,
      source,
      renewal_message:
        daysUntilEnd <= 6
          ? 'License expires soon'
          : daysUntilEnd <= 29
            ? 'Renewal required soon'
            : daysUntilEnd <= 90
              ? 'Renewal approaching'
              : null,
      claims,
    };
  }

  // Past valid_until → grace or disabled (only for verified+bound licenses)
  const daysPast = -daysUntilEnd;
  if (daysPast <= claims.grace_days) {
    const graceLeft = Math.max(0, calendarDaysBetween(today, graceEnds));
    return {
      status: 'GRACE',
      reason_code: null,
      operational: true,
      license_id: claims.license_id,
      customer_name: claims.customer_name,
      deployment_type: claims.deployment_type,
      deployment_bound: true,
      valid_from: claims.valid_from,
      valid_until: claims.valid_until,
      grace_ends,
      days_remaining: 0,
      grace_days_remaining: graceLeft,
      key_id: claims.key_id,
      source,
      renewal_message: 'License expired — grace period in effect',
      claims,
    };
  }

  return {
    status: 'DISABLED',
    reason_code: 'LICENSE_DISABLED',
    operational: false,
    license_id: claims.license_id,
    customer_name: claims.customer_name,
    deployment_type: claims.deployment_type,
    deployment_bound: true,
    valid_from: claims.valid_from,
    valid_until: claims.valid_until,
    grace_ends,
    days_remaining: 0,
    grace_days_remaining: 0,
    key_id: claims.key_id,
    source,
    renewal_message: reasonMessage('LICENSE_DISABLED'),
    claims,
  };
}

export async function verifyAndEvaluateSignedLicense(opts: {
  token: string;
  installationDeploymentId: string;
  now?: Date;
  source: PlatformLicenseResult['source'];
  keyring?: readonly LicensePublicKeyEntry[];
}): Promise<PlatformLicenseResult> {
  const verified = await verifySignedLicenseJws(
    opts.token,
    opts.keyring ?? LICENSE_PUBLIC_KEYRING,
  );
  if (!verified.ok) {
    return invalid(verified.reason, opts.source);
  }
  return evaluateVerifiedLicense({
    claims: verified.claims,
    installationDeploymentId: opts.installationDeploymentId,
    now: opts.now,
    source: opts.source,
  });
}

/** Default grace for unsigned development licenses (matches Phase 1 constant). */
export const DEFAULT_SIGNED_GRACE_DAYS = LICENSE_GRACE_PERIOD_DAYS;
