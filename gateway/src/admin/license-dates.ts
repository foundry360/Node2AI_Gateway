/**
 * Shared UTC calendar helpers for Enigma license term evaluation.
 */

/** Calendar days after expiration before AI paths are disabled (default). */
export const LICENSE_GRACE_PERIOD_DAYS = 30;

export type LicenseDeploymentType = 'vpc' | 'air_gapped';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse YYYY-MM-DD as a UTC calendar day (timezone-safe). */
export function parseDateOnlyUtc(value: string): Date | null {
  const m = DATE_ONLY.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

export function formatDateOnlyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function addUtcDays(d: Date, days: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days),
  );
}

export function utcToday(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Calendar days from `from` to `to` (UTC date-only).
 * Positive when `to` is after `from`.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

export function daysRemainingUntil(
  expirationDate: string,
  now: Date = new Date(),
): number | null {
  const exp = parseDateOnlyUtc(expirationDate);
  if (!exp) return null;
  return calendarDaysBetween(utcToday(now), exp);
}
