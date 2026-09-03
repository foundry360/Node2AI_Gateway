import { describe, expect, it } from 'vitest';
import { PostgresAuditService } from '../../src/audit/pg-service.js';
import { PostgresIdentityStore } from '../../src/identity/store.js';
import type { PgQueryable } from '../../src/shared/pg.js';
import { hashApiKey } from '../../src/shared/ids.js';
import { createPhase1Gateway, PHASE1_DEMO_API_KEY } from '../../src/api/app-factory.js';

function memoryDb(seedRows: {
  orgs?: Record<string, unknown>[];
  apps?: Record<string, unknown>[];
  users?: Record<string, unknown>[];
  keys?: Record<string, unknown>[];
  audits?: Record<string, unknown>[];
}): PgQueryable & { audits: Record<string, unknown>[] } {
  const audits = seedRows.audits ?? [];
  return {
    audits,
    async query(text: string, params: unknown[] = []) {
      if (text.includes('FROM organizations WHERE')) {
        const row = (seedRows.orgs ?? []).find((o) => o.organization_id === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (text.includes('FROM applications WHERE')) {
        const row = (seedRows.apps ?? []).find((a) => a.application_id === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (text.includes('FROM users WHERE')) {
        const row = (seedRows.users ?? []).find((u) => u.user_id === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (text.includes('FROM api_keys WHERE')) {
        const row = (seedRows.keys ?? []).find(
          (k) => k.key_hash === params[0] && k.status === 'active',
        );
        return { rows: row ? [row] : [] };
      }
      if (text.includes('FROM organizations ORDER')) {
        return { rows: seedRows.orgs ?? [] };
      }
      if (text.includes('FROM applications ORDER')) {
        return { rows: seedRows.apps ?? [] };
      }
      if (text.includes('FROM users ORDER')) {
        return { rows: seedRows.users ?? [] };
      }
      if (text.includes('INSERT INTO audit_events')) {
        audits.push({
          audit_id: params[0],
          timestamp: params[1],
          organization_id: params[2],
          application_id: params[3],
          user_id: params[4],
          request_id: params[5],
          correlation_id: params[6],
          operation: params[7],
          data_classification: params[8],
          policy_ids: JSON.parse(String(params[9])),
          policy_decision: params[10],
          model_selected: params[11],
          provider: params[12],
          input_transformation: params[13],
          response_transformation: params[14],
          response_decision: params[15],
          latency_ms: params[16],
          usage: JSON.parse(String(params[17])),
          reason_codes: JSON.parse(String(params[18])),
          errors: JSON.parse(String(params[19])),
          metadata: JSON.parse(String(params[20])),
        });
        return { rows: [] };
      }
      if (text.includes('FROM audit_events')) {
        return { rows: audits };
      }
      return { rows: [] };
    },
  };
}

describe('PostgreSQL persistence adapters', () => {
  it('loads identity from Postgres-shaped store and authenticates', async () => {
    const db = memoryDb({
      orgs: [
        {
          organization_id: 'org_demo',
          name: 'Demo',
          status: 'active',
          configuration: {},
        },
      ],
      apps: [
        {
          application_id: 'app_clinical',
          organization_id: 'org_demo',
          name: 'Clinical',
          type: 'clinical',
          environment: 'prod',
          status: 'active',
          trust_level: 'trusted',
          allowed_models: ['local-general-v1'],
          allowed_datasets: [],
          allowed_operations: ['summarize'],
        },
      ],
      users: [
        {
          user_id: 'user_clinician',
          organization_id: 'org_demo',
          roles: ['clinician'],
          permissions: [],
          status: 'active',
        },
      ],
      keys: [
        {
          api_key_id: 'key_clinical',
          organization_id: 'org_demo',
          application_id: 'app_clinical',
          key_prefix: 'n2ai',
          key_hash: hashApiKey(PHASE1_DEMO_API_KEY),
          status: 'active',
        },
      ],
    });

    const identityStore = new PostgresIdentityStore(db);
    const audit = new PostgresAuditService(db);
    const gw = createPhase1Gateway({
      identityStore,
      audit,
      persistence: 'postgres',
    });

    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.body.status).toBe('approved');
    expect(db.audits.length).toBeGreaterThan(0);
    expect(db.audits.at(-1)?.provider).toBe('local-runtime');
  });
});
