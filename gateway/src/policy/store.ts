import type { PgQueryable } from '../shared/pg.js';

export interface StoredPolicy {
  policy_id: string;
  organization_id: string | null;
  name: string;
  status: 'active' | 'disabled';
  version: number;
  rules: Record<string, unknown>;
  created_at?: string;
  created_by?: string | null;
}

export interface PolicyStore {
  list(): Promise<StoredPolicy[]>;
  /** Latest version for each policy name (org-scoped). */
  listLatest(): Promise<StoredPolicy[]>;
  get(policyId: string): Promise<StoredPolicy | null>;
  setStatus(policyId: string, status: 'active' | 'disabled'): Promise<StoredPolicy>;
  createVersion(input: {
    policy_id: string;
    organization_id?: string | null;
    name: string;
    rules: Record<string, unknown>;
    created_by?: string;
    status?: 'active' | 'disabled';
  }): Promise<StoredPolicy>;
}

function mapPolicy(row: Record<string, unknown>): StoredPolicy {
  return {
    policy_id: String(row.policy_id),
    organization_id: row.organization_id == null ? null : String(row.organization_id),
    name: String(row.name),
    status: row.status as StoredPolicy['status'],
    version: Number(row.version),
    rules: (row.rules as Record<string, unknown>) ?? {},
    created_at: row.created_at ? String(row.created_at) : undefined,
    created_by: row.created_by == null ? null : String(row.created_by),
  };
}

const DEFAULT_POLICIES: StoredPolicy[] = [
  {
    policy_id: 'pol_phase2_core',
    organization_id: 'org_demo',
    name: 'Request governance',
    status: 'active',
    version: 2,
    rules: {
      summary:
        'Application trust, operation allowlists, PHI local-only, PII tokenize, credential block.',
    },
    created_by: 'seed',
  },
  {
    policy_id: 'pol_phase5_response',
    organization_id: 'org_demo',
    name: 'Response governance',
    status: 'active',
    version: 5,
    rules: {
      summary:
        'Block PHI/credentials/tool calls in outputs; redact PII; detokenize only when authorized.',
    },
    created_by: 'seed',
  },
];

export class InMemoryPolicyStore implements PolicyStore {
  private policies: StoredPolicy[];

  constructor(seed: StoredPolicy[] = DEFAULT_POLICIES) {
    this.policies = seed.map((p) => ({ ...p, rules: { ...p.rules } }));
  }

  async list(): Promise<StoredPolicy[]> {
    return [...this.policies].sort((a, b) => a.name.localeCompare(b.name) || b.version - a.version);
  }

  async listLatest(): Promise<StoredPolicy[]> {
    const byKey = new Map<string, StoredPolicy>();
    for (const p of this.policies) {
      const key = `${p.organization_id ?? ''}::${p.name}`;
      const prev = byKey.get(key);
      if (!prev || p.version > prev.version) byKey.set(key, p);
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(policyId: string): Promise<StoredPolicy | null> {
    return this.policies.find((p) => p.policy_id === policyId) ?? null;
  }

  async setStatus(policyId: string, status: 'active' | 'disabled'): Promise<StoredPolicy> {
    const p = await this.get(policyId);
    if (!p) throw new Error(`Policy not found: ${policyId}`);
    p.status = status;
    return p;
  }

  async createVersion(input: {
    policy_id: string;
    organization_id?: string | null;
    name: string;
    rules: Record<string, unknown>;
    created_by?: string;
    status?: 'active' | 'disabled';
  }): Promise<StoredPolicy> {
    const siblings = this.policies.filter(
      (p) => p.name === input.name && p.organization_id === (input.organization_id ?? null),
    );
    const version = siblings.reduce((m, p) => Math.max(m, p.version), 0) + 1;
    const created: StoredPolicy = {
      policy_id: input.policy_id,
      organization_id: input.organization_id ?? null,
      name: input.name,
      status: input.status ?? 'active',
      version,
      rules: input.rules,
      created_at: new Date().toISOString(),
      created_by: input.created_by ?? 'admin',
    };
    this.policies.push(created);
    return created;
  }
}

export class PostgresPolicyStore implements PolicyStore {
  constructor(private readonly db: PgQueryable) {}

  async list(): Promise<StoredPolicy[]> {
    const res = await this.db.query(
      `SELECT policy_id, organization_id, name, status, version, rules, created_at, created_by
       FROM policies ORDER BY name, version DESC`,
    );
    return res.rows.map(mapPolicy);
  }

  async listLatest(): Promise<StoredPolicy[]> {
    const res = await this.db.query(
      `SELECT DISTINCT ON (organization_id, name)
         policy_id, organization_id, name, status, version, rules, created_at, created_by
       FROM policies
       ORDER BY organization_id, name, version DESC`,
    );
    return res.rows.map(mapPolicy);
  }

  async get(policyId: string): Promise<StoredPolicy | null> {
    const res = await this.db.query(
      `SELECT policy_id, organization_id, name, status, version, rules, created_at, created_by
       FROM policies WHERE policy_id = $1`,
      [policyId],
    );
    return res.rows[0] ? mapPolicy(res.rows[0]) : null;
  }

  async setStatus(policyId: string, status: 'active' | 'disabled'): Promise<StoredPolicy> {
    const res = await this.db.query(
      `UPDATE policies SET status = $2 WHERE policy_id = $1
       RETURNING policy_id, organization_id, name, status, version, rules, created_at, created_by`,
      [policyId, status],
    );
    if (!res.rows[0]) throw new Error(`Policy not found: ${policyId}`);
    return mapPolicy(res.rows[0]);
  }

  async createVersion(input: {
    policy_id: string;
    organization_id?: string | null;
    name: string;
    rules: Record<string, unknown>;
    created_by?: string;
    status?: 'active' | 'disabled';
  }): Promise<StoredPolicy> {
    const verRes = await this.db.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM policies WHERE name = $1 AND organization_id IS NOT DISTINCT FROM $2`,
      [input.name, input.organization_id ?? null],
    );
    const version = Number(verRes.rows[0]?.next_version ?? 1);
    const res = await this.db.query(
      `INSERT INTO policies (policy_id, organization_id, name, status, version, rules, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING policy_id, organization_id, name, status, version, rules, created_at, created_by`,
      [
        input.policy_id,
        input.organization_id ?? null,
        input.name,
        input.status ?? 'active',
        version,
        JSON.stringify(input.rules),
        input.created_by ?? 'admin',
      ],
    );
    return mapPolicy(res.rows[0]);
  }
}
