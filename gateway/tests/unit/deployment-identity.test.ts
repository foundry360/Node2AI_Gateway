/**
 * Phase 1 — persistent installation-scoped deployment_id.
 */
import { describe, expect, it } from 'vitest';
import {
  InMemoryDeploymentIdentityStore,
  PostgresDeploymentIdentityStore,
  getOrCreateDeploymentId,
  isValidDeploymentId,
} from '../../src/admin/deployment-identity.js';
import { loadEnigmaLicense } from '../../src/admin/license.js';
import { createPhase1Gateway } from '../../src/api/app-factory.js';
import type { PgQueryable } from '../../src/shared/pg.js';

function memoryPg(initial: Record<string, unknown> = {}): {
  db: PgQueryable;
  rows: Map<string, unknown>;
} {
  const rows = new Map<string, unknown>(Object.entries(initial));
  const db: PgQueryable = {
    async query(text: string, params?: unknown[]) {
      if (text.includes('SELECT value FROM system_config')) {
        const key = String(params?.[0]);
        if (!rows.has(key)) return { rows: [] };
        return { rows: [{ value: rows.get(key) }] };
      }
      if (text.includes('INSERT INTO system_config') && text.includes('ON CONFLICT')) {
        const key = String(params?.[0]);
        const value = params?.[1];
        if (!rows.has(key)) {
          rows.set(key, value);
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return { db, rows };
}

describe('deployment identity (Phase 1)', () => {
  it('1. first creation generates a valid UUID and persists it', async () => {
    const store = new InMemoryDeploymentIdentityStore();
    const id = await getOrCreateDeploymentId(store);
    expect(isValidDeploymentId(id)).toBe(true);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('2. persistence — second call returns the same UUID', async () => {
    const state: { deployment_id?: string } = {};
    const store = new InMemoryDeploymentIdentityStore(state);
    const a = await store.getOrCreateDeploymentId();
    const b = await store.getOrCreateDeploymentId();
    expect(b).toBe(a);
    expect(state.deployment_id).toBe(a);
  });

  it('3. restart simulation — new store instance, same durable state', async () => {
    const durable: { deployment_id?: string } = {};
    const firstBoot = new InMemoryDeploymentIdentityStore(durable);
    const id1 = await firstBoot.getOrCreateDeploymentId();

    const afterRestart = new InMemoryDeploymentIdentityStore(durable);
    const id2 = await afterRestart.getOrCreateDeploymentId();
    expect(id2).toBe(id1);
  });

  it('4. GET /v1/admin/system returns deployment_id', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/admin/system',
        headers: { authorization: 'Bearer test_admin' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.deployment?.deployment_id).toBeTruthy();
      expect(isValidDeploymentId(body.deployment.deployment_id)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('5. existing install without value receives one (Postgres store)', async () => {
    const { db, rows } = memoryPg({ deployment_mode: 'connected' });
    expect(rows.has('deployment_id')).toBe(false);
    const store = new PostgresDeploymentIdentityStore(db);
    const id = await store.getOrCreateDeploymentId();
    expect(isValidDeploymentId(id)).toBe(true);
    expect(rows.get('deployment_id')).toBe(id);
    expect(rows.get('deployment_mode')).toBe('connected');
  });

  it('6. license independence — renewing license does not change deployment_id', async () => {
    const store = new InMemoryDeploymentIdentityStore();
    const idBefore = await store.getOrCreateDeploymentId();
    const licA = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_ID: 'ENIGMA-A',
        ENIGMA_LICENSE_START_DATE: '2026-01-01',
        ENIGMA_LICENSE_EXPIRATION_DATE: '2027-01-01',
      },
      new Date('2026-06-01T12:00:00Z'),
    );
    const licB = loadEnigmaLicense(
      {
        ENIGMA_LICENSE_ID: 'ENIGMA-B-RENEWED',
        ENIGMA_LICENSE_START_DATE: '2027-01-01',
        ENIGMA_LICENSE_EXPIRATION_DATE: '2028-01-01',
      },
      new Date('2027-06-01T12:00:00Z'),
    );
    expect(licA?.license_id).toBe('ENIGMA-A');
    expect(licB?.license_id).toBe('ENIGMA-B-RENEWED');
    const idAfter = await store.getOrCreateDeploymentId();
    expect(idAfter).toBe(idBefore);
  });

  it('7. governance independence — deployment store is not a policy module', async () => {
    // Sanity: creating a gateway still evaluates without deployment facts in PDP.
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    expect(gw.deploymentIdentity).toBeTruthy();
    const id = await gw.deploymentIdentity.getOrCreateDeploymentId();
    expect(isValidDeploymentId(id)).toBe(true);
    // Policy repository / pack PDP remain independent objects.
    expect(gw.packPdp).toBeTruthy();
  });

  it('8. air-gapped — no network dependency (pure local store)', async () => {
    const store = new InMemoryDeploymentIdentityStore();
    // No fetch / DNS — local UUID only.
    const id = await store.getOrCreateDeploymentId();
    expect(isValidDeploymentId(id)).toBe(true);
  });

  it('9. concurrent first boot — single persisted winner', async () => {
    const { db, rows } = memoryPg();
    const a = new PostgresDeploymentIdentityStore(db);
    const b = new PostgresDeploymentIdentityStore(db);
    const [idA, idB] = await Promise.all([
      a.getOrCreateDeploymentId(),
      b.getOrCreateDeploymentId(),
    ]);
    expect(idA).toBe(idB);
    expect(rows.get('deployment_id')).toBe(idA);
  });

  it('system API keeps license separate from deployment', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/admin/system',
        headers: { authorization: 'Bearer test_admin' },
      });
      const body = res.json();
      expect(body.deployment.deployment_id).not.toBe(body.license?.license_id);
      expect(body.license?.license_id).toBeTruthy();
    } finally {
      await server.close();
    }
  });
});
