export type EntityStatus = 'active' | 'suspended' | 'deleted';

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
  type: string;
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
