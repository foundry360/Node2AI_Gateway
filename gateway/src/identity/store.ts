import type { ApiKeyRecord, Application, Organization, User } from './types.js';
import type { PgQueryable } from '../shared/pg.js';

export interface IdentityStore {
  getOrganization(organizationId: string): Promise<Organization | null>;
  getApplication(applicationId: string): Promise<Application | null>;
  getUser(userId: string): Promise<User | null>;
  findApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  listOrganizations(): Promise<Organization[]>;
  listApplications(): Promise<Application[]>;
  listUsers(): Promise<User[]>;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function mapOrg(row: Record<string, unknown>): Organization {
  return {
    organization_id: String(row.organization_id),
    name: String(row.name),
    status: row.status as Organization['status'],
    configuration: (row.configuration as Record<string, unknown>) ?? {},
  };
}

function mapApp(row: Record<string, unknown>): Application {
  return {
    application_id: String(row.application_id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    type: String(row.type),
    environment: row.environment as Application['environment'],
    status: row.status as Application['status'],
    trust_level: row.trust_level as Application['trust_level'],
    allowed_models: asStringArray(row.allowed_models),
    allowed_datasets: asStringArray(row.allowed_datasets),
    allowed_operations: asStringArray(row.allowed_operations),
  };
}

function mapUser(row: Record<string, unknown>): User {
  return {
    user_id: String(row.user_id),
    organization_id: String(row.organization_id),
    roles: asStringArray(row.roles),
    permissions: asStringArray(row.permissions),
    status: row.status as User['status'],
  };
}

function mapKey(row: Record<string, unknown>): ApiKeyRecord {
  return {
    api_key_id: String(row.api_key_id),
    organization_id: String(row.organization_id),
    application_id: String(row.application_id),
    key_prefix: String(row.key_prefix),
    key_hash: String(row.key_hash),
    status: row.status as ApiKeyRecord['status'],
  };
}

/** In-memory store for tests and local dev without DATABASE_URL. */
export class InMemoryIdentityStore implements IdentityStore {
  constructor(
    private readonly data: {
      organizations: Organization[];
      applications: Application[];
      users: User[];
      apiKeys: ApiKeyRecord[];
    },
  ) {}

  async getOrganization(organizationId: string): Promise<Organization | null> {
    return this.data.organizations.find((o) => o.organization_id === organizationId) ?? null;
  }

  async getApplication(applicationId: string): Promise<Application | null> {
    return this.data.applications.find((a) => a.application_id === applicationId) ?? null;
  }

  async getUser(userId: string): Promise<User | null> {
    return this.data.users.find((u) => u.user_id === userId) ?? null;
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.data.apiKeys.find((k) => k.key_hash === keyHash && k.status === 'active') ?? null;
  }

  async listOrganizations(): Promise<Organization[]> {
    return [...this.data.organizations];
  }

  async listApplications(): Promise<Application[]> {
    return [...this.data.applications];
  }

  async listUsers(): Promise<User[]> {
    return [...this.data.users];
  }
}

export class PostgresIdentityStore implements IdentityStore {
  constructor(private readonly db: PgQueryable) {}

  async getOrganization(organizationId: string): Promise<Organization | null> {
    const res = await this.db.query(
      `SELECT organization_id, name, status, configuration
       FROM organizations WHERE organization_id = $1`,
      [organizationId],
    );
    return res.rows[0] ? mapOrg(res.rows[0]) : null;
  }

  async getApplication(applicationId: string): Promise<Application | null> {
    const res = await this.db.query(
      `SELECT application_id, organization_id, name, type, environment, status, trust_level,
              allowed_models, allowed_datasets, allowed_operations
       FROM applications WHERE application_id = $1`,
      [applicationId],
    );
    return res.rows[0] ? mapApp(res.rows[0]) : null;
  }

  async getUser(userId: string): Promise<User | null> {
    const res = await this.db.query(
      `SELECT user_id, organization_id, roles, permissions, status
       FROM users WHERE user_id = $1`,
      [userId],
    );
    return res.rows[0] ? mapUser(res.rows[0]) : null;
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const res = await this.db.query(
      `SELECT api_key_id, organization_id, application_id, key_prefix, key_hash, status
       FROM api_keys WHERE key_hash = $1 AND status = 'active'`,
      [keyHash],
    );
    return res.rows[0] ? mapKey(res.rows[0]) : null;
  }

  async listOrganizations(): Promise<Organization[]> {
    const res = await this.db.query(
      `SELECT organization_id, name, status, configuration FROM organizations ORDER BY name`,
    );
    return res.rows.map(mapOrg);
  }

  async listApplications(): Promise<Application[]> {
    const res = await this.db.query(
      `SELECT application_id, organization_id, name, type, environment, status, trust_level,
              allowed_models, allowed_datasets, allowed_operations
       FROM applications ORDER BY name`,
    );
    return res.rows.map(mapApp);
  }

  async listUsers(): Promise<User[]> {
    const res = await this.db.query(
      `SELECT user_id, organization_id, roles, permissions, status FROM users ORDER BY user_id`,
    );
    return res.rows.map(mapUser);
  }
}
