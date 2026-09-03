import { randomBytes } from 'node:crypto';
import type { ApiKeyRecord, Application, Organization, User } from './types.js';
import type { PgQueryable } from '../shared/pg.js';
import { hashApiKey } from '../shared/ids.js';

export interface IdentityStore {
  getOrganization(organizationId: string): Promise<Organization | null>;
  getApplication(applicationId: string): Promise<Application | null>;
  getUser(userId: string): Promise<User | null>;
  findApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  listOrganizations(): Promise<Organization[]>;
  listApplications(): Promise<Application[]>;
  listUsers(): Promise<User[]>;
  listApiKeys(applicationId?: string): Promise<ApiKeyRecord[]>;
  createApplication(app: Application): Promise<Application>;
  updateApplication(
    applicationId: string,
    patch: Partial<
      Pick<
        Application,
        | 'name'
        | 'type'
        | 'environment'
        | 'status'
        | 'trust_level'
        | 'allowed_models'
        | 'allowed_datasets'
        | 'allowed_operations'
      >
    >,
  ): Promise<Application>;
  issueApiKey(input: {
    organization_id: string;
    application_id: string;
    raw_key?: string;
  }): Promise<{ record: ApiKeyRecord; secret: string }>;
  revokeApiKey(apiKeyId: string): Promise<ApiKeyRecord>;
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

function generateApiKeySecret(): string {
  return `n2ai_${randomBytes(24).toString('hex')}`;
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

  async listApiKeys(applicationId?: string): Promise<ApiKeyRecord[]> {
    return this.data.apiKeys.filter((k) =>
      applicationId ? k.application_id === applicationId : true,
    );
  }

  async createApplication(app: Application): Promise<Application> {
    if (this.data.applications.some((a) => a.application_id === app.application_id)) {
      throw new Error(`Application already exists: ${app.application_id}`);
    }
    this.data.applications.push({ ...app });
    return app;
  }

  async updateApplication(
    applicationId: string,
    patch: Partial<
      Pick<
        Application,
        | 'name'
        | 'type'
        | 'environment'
        | 'status'
        | 'trust_level'
        | 'allowed_models'
        | 'allowed_datasets'
        | 'allowed_operations'
      >
    >,
  ): Promise<Application> {
    const app = await this.getApplication(applicationId);
    if (!app) throw new Error(`Application not found: ${applicationId}`);
    Object.assign(app, patch);
    return app;
  }

  async issueApiKey(input: {
    organization_id: string;
    application_id: string;
    raw_key?: string;
  }): Promise<{ record: ApiKeyRecord; secret: string }> {
    const secret = input.raw_key ?? generateApiKeySecret();
    const record: ApiKeyRecord = {
      api_key_id: `key_${randomBytes(6).toString('hex')}`,
      organization_id: input.organization_id,
      application_id: input.application_id,
      key_prefix: secret.slice(0, 12),
      key_hash: hashApiKey(secret),
      status: 'active',
    };
    this.data.apiKeys.push(record);
    return { record, secret };
  }

  async revokeApiKey(apiKeyId: string): Promise<ApiKeyRecord> {
    const key = this.data.apiKeys.find((k) => k.api_key_id === apiKeyId);
    if (!key) throw new Error(`API key not found: ${apiKeyId}`);
    key.status = 'revoked';
    return key;
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

  async listApiKeys(applicationId?: string): Promise<ApiKeyRecord[]> {
    if (applicationId) {
      const res = await this.db.query(
        `SELECT api_key_id, organization_id, application_id, key_prefix, key_hash, status
         FROM api_keys WHERE application_id = $1 ORDER BY created_at DESC`,
        [applicationId],
      );
      return res.rows.map(mapKey);
    }
    const res = await this.db.query(
      `SELECT api_key_id, organization_id, application_id, key_prefix, key_hash, status
       FROM api_keys ORDER BY created_at DESC`,
    );
    return res.rows.map(mapKey);
  }

  async createApplication(app: Application): Promise<Application> {
    await this.db.query(
      `INSERT INTO applications (
         application_id, organization_id, name, type, environment, status, trust_level,
         allowed_models, allowed_datasets, allowed_operations
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`,
      [
        app.application_id,
        app.organization_id,
        app.name,
        app.type,
        app.environment,
        app.status,
        app.trust_level,
        JSON.stringify(app.allowed_models),
        JSON.stringify(app.allowed_datasets),
        JSON.stringify(app.allowed_operations),
      ],
    );
    return app;
  }

  async updateApplication(
    applicationId: string,
    patch: Partial<
      Pick<
        Application,
        | 'name'
        | 'type'
        | 'environment'
        | 'status'
        | 'trust_level'
        | 'allowed_models'
        | 'allowed_datasets'
        | 'allowed_operations'
      >
    >,
  ): Promise<Application> {
    const current = await this.getApplication(applicationId);
    if (!current) throw new Error(`Application not found: ${applicationId}`);
    const next = { ...current, ...patch };
    await this.db.query(
      `UPDATE applications SET
         name = $2, type = $3, environment = $4, status = $5, trust_level = $6,
         allowed_models = $7::jsonb, allowed_datasets = $8::jsonb, allowed_operations = $9::jsonb,
         updated_at = now()
       WHERE application_id = $1`,
      [
        applicationId,
        next.name,
        next.type,
        next.environment,
        next.status,
        next.trust_level,
        JSON.stringify(next.allowed_models),
        JSON.stringify(next.allowed_datasets),
        JSON.stringify(next.allowed_operations),
      ],
    );
    return next;
  }

  async issueApiKey(input: {
    organization_id: string;
    application_id: string;
    raw_key?: string;
  }): Promise<{ record: ApiKeyRecord; secret: string }> {
    const secret = input.raw_key ?? generateApiKeySecret();
    const api_key_id = `key_${randomBytes(6).toString('hex')}`;
    const key_prefix = secret.slice(0, 12);
    const key_hash = hashApiKey(secret);
    await this.db.query(
      `INSERT INTO api_keys (api_key_id, organization_id, application_id, key_prefix, key_hash, status)
       VALUES ($1,$2,$3,$4,$5,'active')`,
      [api_key_id, input.organization_id, input.application_id, key_prefix, key_hash],
    );
    return {
      record: {
        api_key_id,
        organization_id: input.organization_id,
        application_id: input.application_id,
        key_prefix,
        key_hash,
        status: 'active',
      },
      secret,
    };
  }

  async revokeApiKey(apiKeyId: string): Promise<ApiKeyRecord> {
    const res = await this.db.query(
      `UPDATE api_keys SET status = 'revoked', revoked_at = now()
       WHERE api_key_id = $1
       RETURNING api_key_id, organization_id, application_id, key_prefix, key_hash, status`,
      [apiKeyId],
    );
    if (!res.rows[0]) throw new Error(`API key not found: ${apiKeyId}`);
    return mapKey(res.rows[0]);
  }
}
