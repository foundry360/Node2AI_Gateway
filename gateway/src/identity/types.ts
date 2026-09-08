export type EntityStatus = 'active' | 'suspended' | 'deleted';

/** Application categories used by governance policy (not freeform). */
export const APPLICATION_TYPES = [
  'clinical',
  'financial',
  'customer',
  'internal',
  'custom',
] as const;
export type ApplicationType = (typeof APPLICATION_TYPES)[number];

export function parseApplicationType(
  value: unknown,
  fallback: ApplicationType = 'custom',
): ApplicationType {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if ((APPLICATION_TYPES as readonly string[]).includes(raw)) {
    return raw as ApplicationType;
  }
  return fallback;
}

export function isApplicationType(value: unknown): value is ApplicationType {
  return (APPLICATION_TYPES as readonly string[]).includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
}

export interface Organization {
  organization_id: string;
  name: string;
  status: EntityStatus;
  configuration: Record<string, unknown>;
}

export interface Application {
  application_id: string;
  organization_id: string;
  name: string;
  type: ApplicationType | string;
  environment: 'dev' | 'test' | 'staging' | 'prod';
  status: EntityStatus;
  trust_level: 'trusted' | 'standard' | 'untrusted';
  allowed_models: string[];
  allowed_datasets: string[];
  allowed_operations: string[];
}

export interface User {
  user_id: string;
  organization_id: string;
  roles: string[];
  permissions: string[];
  status: EntityStatus;
}

export interface ApiKeyRecord {
  api_key_id: string;
  organization_id: string;
  application_id: string;
  key_prefix: string;
  key_hash: string;
  status: 'active' | 'revoked';
}

export interface AuthenticatedPrincipal {
  organization: Organization;
  application: Application;
  apiKeyId: string;
}
