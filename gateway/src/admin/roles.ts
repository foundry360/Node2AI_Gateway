/**
 * Enigma V1 console RBAC — separate from AI subject roles on User.
 * Backend enforcement is authoritative; UI gating is UX only.
 */

export const ADMIN_ROLES = [
  'ADMINISTRATOR',
  'GOVERNANCE_REVIEWER',
  'OPERATOR',
  'READ_ONLY',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminUserStatus = 'ACTIVE' | 'DISABLED';

export type AdminCapability =
  | 'read'
  | 'admin_mutate'
  | 'governance_resolve'
  | 'export';

export function parseAdminRole(value: unknown): AdminRole | null {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if ((ADMIN_ROLES as readonly string[]).includes(raw)) {
    return raw as AdminRole;
  }
  return null;
}

export function roleHasCapability(
  role: AdminRole,
  capability: AdminCapability,
): boolean {
  switch (capability) {
    case 'read':
      return true;
    case 'admin_mutate':
      return role === 'ADMINISTRATOR';
    case 'governance_resolve':
      return role === 'ADMINISTRATOR' || role === 'GOVERNANCE_REVIEWER';
    case 'export':
      return (
        role === 'ADMINISTRATOR' ||
        role === 'GOVERNANCE_REVIEWER' ||
        role === 'OPERATOR'
      );
    default:
      return false;
  }
}

export function isActiveAdminStatus(status: AdminUserStatus | string): boolean {
  return String(status).toUpperCase() === 'ACTIVE';
}
