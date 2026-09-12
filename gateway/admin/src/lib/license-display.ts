/** Display helpers for System → License & Subscription (admin UI only). */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Format YYYY-MM-DD as "September 1, 2026" using UTC calendar parts. */
export function formatLicenseDate(value: string | undefined | null): string {
  if (!value) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return value;
  return `${MONTHS[mo - 1]} ${d}, ${y}`;
}

export function formatLicenseDeployment(value: string | undefined | null): string {
  const v = (value ?? '').toLowerCase().replace(/-/g, '_');
  if (v === 'air_gapped' || v === 'airgapped' || v === 'airgap') return 'Air-Gapped';
  if (v === 'vpc') return 'VPC';
  return value || '-';
}

export function formatLicenseType(value: string | undefined | null): string {
  const v = (value ?? '').toLowerCase();
  if (v === 'annual') return 'Annual';
  if (!value) return '-';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDaysRemainingLabel(
  days: number,
  status: string,
  graceDaysRemaining = 0,
): string {
  const s = status.toLowerCase();
  if (s === 'disabled') return 'Disabled';
  if (s === 'grace') {
    const n = Math.max(0, graceDaysRemaining);
    return n === 1
      ? 'Grace period: 1 day remaining'
      : `Grace period: ${n} days remaining`;
  }
  if (s === 'expired' || days < 0) return 'Expired';
  const n = Math.max(0, days);
  return n === 1 ? '1 day remaining' : `${n} days remaining`;
}
