import { decryptUtf8, encryptUtf8 } from '../shared/crypto.js';
import type { PgQueryable } from '../shared/pg.js';

/** Customer-supplied model credentials (BYOK). Enigma does not vend provider keys. */
export type ProviderCredentialKind = 'openai_compatible' | 'custom';

export interface ApplicationProviderCredentialPublic {
  application_id: string;
  organization_id: string;
  provider_kind: ProviderCredentialKind;
  endpoint_url: string;
  api_key_last4: string;
  /** Present on Admin GET when revealing for the console; never logged. */
  api_key?: string;
  /** Gateway model_id → upstream model name */
  model_map: Record<string, string>;
  status: 'active' | 'disabled';
  updated_at: string;
}

export interface ResolvedProviderCredential {
  application_id: string;
  organization_id: string;
  provider_kind: ProviderCredentialKind;
  endpoint_url: string;
  api_key: string;
  model_map: Record<string, string>;
}

export interface UpsertProviderCredentialInput {
  application_id: string;
  organization_id: string;
  provider_kind: ProviderCredentialKind;
  endpoint_url: string;
  api_key: string;
  model_map?: Record<string, string>;
  status?: 'active' | 'disabled';
}

export interface ProviderCredentialStore {
  getPublic(applicationId: string): Promise<ApplicationProviderCredentialPublic | null>;
  /** Decrypts API key for Gateway egress (active credentials only). */
  resolveSecret(applicationId: string): Promise<ResolvedProviderCredential | null>;
  /** Decrypts API key for Admin console display (any status). */
  revealSecret(applicationId: string): Promise<ResolvedProviderCredential | null>;
  upsert(input: UpsertProviderCredentialInput): Promise<ApplicationProviderCredentialPublic>;
  delete(applicationId: string): Promise<void>;
}

function last4(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

function asModelMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

function toPublic(row: {
  application_id: string;
  organization_id: string;
  provider_kind: ProviderCredentialKind;
  endpoint_url: string;
  api_key_last4: string;
  model_map: Record<string, string>;
  status: 'active' | 'disabled';
  updated_at: string;
}): ApplicationProviderCredentialPublic {
  return {
    application_id: row.application_id,
    organization_id: row.organization_id,
    provider_kind: row.provider_kind,
    endpoint_url: row.endpoint_url,
    api_key_last4: row.api_key_last4,
    model_map: row.model_map,
    status: row.status,
    updated_at: row.updated_at,
  };
}

/** In-memory BYOK store for tests and non-Postgres boots. */
export class InMemoryProviderCredentialStore implements ProviderCredentialStore {
  private readonly rows = new Map<
    string,
    {
      public: ApplicationProviderCredentialPublic;
      api_key_ciphertext: string;
    }
  >();

  constructor(private readonly encryptionKey: string = 'test-provider-credential-key') {}

  async getPublic(applicationId: string): Promise<ApplicationProviderCredentialPublic | null> {
    return this.rows.get(applicationId)?.public ?? null;
  }

  async resolveSecret(applicationId: string): Promise<ResolvedProviderCredential | null> {
    const row = this.rows.get(applicationId);
    if (!row || row.public.status !== 'active') return null;
    return this.decryptRow(row);
  }

  async revealSecret(applicationId: string): Promise<ResolvedProviderCredential | null> {
    const row = this.rows.get(applicationId);
    if (!row) return null;
    return this.decryptRow(row);
  }

  private decryptRow(row: {
    public: ApplicationProviderCredentialPublic;
    api_key_ciphertext: string;
  }): ResolvedProviderCredential {
    return {
      application_id: row.public.application_id,
      organization_id: row.public.organization_id,
      provider_kind: row.public.provider_kind,
      endpoint_url: row.public.endpoint_url,
      api_key: decryptUtf8(row.api_key_ciphertext, this.encryptionKey),
      model_map: row.public.model_map,
    };
  }

  async upsert(input: UpsertProviderCredentialInput): Promise<ApplicationProviderCredentialPublic> {
    const apiKey = input.api_key.trim();
    if (!apiKey) throw new Error('api_key is required');
    const endpoint = input.endpoint_url.trim().replace(/\/$/, '');
    if (!endpoint) throw new Error('endpoint_url is required');
    const updated_at = new Date().toISOString();
    const pub = toPublic({
      application_id: input.application_id,
      organization_id: input.organization_id,
      provider_kind: input.provider_kind,
      endpoint_url: endpoint,
      api_key_last4: last4(apiKey),
      model_map: input.model_map ?? {},
      status: input.status ?? 'active',
      updated_at,
    });
    this.rows.set(input.application_id, {
      public: pub,
      api_key_ciphertext: encryptUtf8(apiKey, this.encryptionKey),
    });
    return pub;
  }

  async delete(applicationId: string): Promise<void> {
    this.rows.delete(applicationId);
  }
}

/** Postgres-backed BYOK store — ciphertext at rest via GATEWAY_VAULT_KEY. */
export class PostgresProviderCredentialStore implements ProviderCredentialStore {
  constructor(
    private readonly db: PgQueryable,
    private readonly encryptionKey: string,
  ) {}

  async getPublic(applicationId: string): Promise<ApplicationProviderCredentialPublic | null> {
    const res = await this.db.query(
      `SELECT application_id, organization_id, provider_kind, endpoint_url,
              api_key_last4, model_map, status, updated_at
       FROM application_provider_credentials
       WHERE application_id = $1`,
      [applicationId],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return toPublic({
      application_id: String(row.application_id),
      organization_id: String(row.organization_id),
      provider_kind: row.provider_kind as ProviderCredentialKind,
      endpoint_url: String(row.endpoint_url),
      api_key_last4: String(row.api_key_last4),
      model_map: asModelMap(row.model_map),
      status: row.status as 'active' | 'disabled',
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    });
  }

  async resolveSecret(applicationId: string): Promise<ResolvedProviderCredential | null> {
    return this.loadSecret(applicationId, true);
  }

  async revealSecret(applicationId: string): Promise<ResolvedProviderCredential | null> {
    return this.loadSecret(applicationId, false);
  }

  private async loadSecret(
    applicationId: string,
    activeOnly: boolean,
  ): Promise<ResolvedProviderCredential | null> {
    const res = await this.db.query(
      `SELECT application_id, organization_id, provider_kind, endpoint_url,
              api_key_ciphertext, model_map, status
       FROM application_provider_credentials
       WHERE application_id = $1${activeOnly ? ` AND status = 'active'` : ''}`,
      [applicationId],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      application_id: String(row.application_id),
      organization_id: String(row.organization_id),
      provider_kind: row.provider_kind as ProviderCredentialKind,
      endpoint_url: String(row.endpoint_url),
      api_key: decryptUtf8(String(row.api_key_ciphertext), this.encryptionKey),
      model_map: asModelMap(row.model_map),
    };
  }

  async upsert(input: UpsertProviderCredentialInput): Promise<ApplicationProviderCredentialPublic> {
    const apiKey = input.api_key.trim();
    if (!apiKey) throw new Error('api_key is required');
    const endpoint = input.endpoint_url.trim().replace(/\/$/, '');
    if (!endpoint) throw new Error('endpoint_url is required');
    const modelMap = input.model_map ?? {};
    const status = input.status ?? 'active';
    const ciphertext = encryptUtf8(apiKey, this.encryptionKey);
    const suffix = last4(apiKey);

    const res = await this.db.query(
      `INSERT INTO application_provider_credentials (
         application_id, organization_id, provider_kind, endpoint_url,
         api_key_ciphertext, api_key_last4, model_map, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
       ON CONFLICT (application_id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         provider_kind = EXCLUDED.provider_kind,
         endpoint_url = EXCLUDED.endpoint_url,
         api_key_ciphertext = EXCLUDED.api_key_ciphertext,
         api_key_last4 = EXCLUDED.api_key_last4,
         model_map = EXCLUDED.model_map,
         status = EXCLUDED.status,
         updated_at = now()
       RETURNING application_id, organization_id, provider_kind, endpoint_url,
                 api_key_last4, model_map, status, updated_at`,
      [
        input.application_id,
        input.organization_id,
        input.provider_kind,
        endpoint,
        ciphertext,
        suffix,
        JSON.stringify(modelMap),
        status,
      ],
    );
    const row = res.rows[0] as Record<string, unknown>;
    return toPublic({
      application_id: String(row.application_id),
      organization_id: String(row.organization_id),
      provider_kind: row.provider_kind as ProviderCredentialKind,
      endpoint_url: String(row.endpoint_url),
      api_key_last4: String(row.api_key_last4),
      model_map: asModelMap(row.model_map),
      status: row.status as 'active' | 'disabled',
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    });
  }

  async delete(applicationId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM application_provider_credentials WHERE application_id = $1`,
      [applicationId],
    );
  }
}

export function parseProviderKind(value: unknown): ProviderCredentialKind {
  const raw = String(value ?? 'openai_compatible').trim();
  if (raw === 'custom') return 'custom';
  return 'openai_compatible';
}

export function parseModelMapField(value: unknown): Record<string, string> {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return asModelMap(value);
  }
  const text = String(value).trim();
  if (!text) return {};
  try {
    return asModelMap(JSON.parse(text));
  } catch {
    // gatewayModel:upstreamModel pairs
    const out: Record<string, string> = {};
    for (const part of text.split(',')) {
      const [left, right] = part.split(':').map((s) => s.trim());
      if (left && right) out[left] = right;
    }
    return out;
  }
}
