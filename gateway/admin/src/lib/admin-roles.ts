import type { AdminRole } from '@/lib/auth-session';

export const ADMIN_ROLE_OPTIONS: Array<{
  value: AdminRole;
  label: string;
  description: string;
}> = [
  {
    value: 'ADMINISTRATOR',
    label: 'Administrator',
    description:
      'Manage Enigma configuration, users, applications, policies, models, credentials, and system settings. Can also resolve eligible governance decisions.',
  },
  {
    value: 'GOVERNANCE_REVIEWER',
    label: 'Governance Reviewer',
    description:
      'Review eligible governance decisions and authorize or deny actions. Cannot modify Enigma configuration.',
  },
  {
    value: 'OPERATOR',
    label: 'Operator',
    description:
      'Monitor and investigate Enigma activity and operational events. Cannot modify governance configuration or resolve decisions.',
  },
  {
    value: 'READ_ONLY',
    label: 'Read Only',
    description: 'View Enigma information without making changes.',
  },
];

export function adminRoleLabel(role: string): string {
  const found = ADMIN_ROLE_OPTIONS.find((o) => o.value === role.toUpperCase());
  return found?.label ?? role;
}

export function adminRoleDescription(role: string): string {
  const found = ADMIN_ROLE_OPTIONS.find((o) => o.value === role.toUpperCase());
  return found?.description ?? '';
}
