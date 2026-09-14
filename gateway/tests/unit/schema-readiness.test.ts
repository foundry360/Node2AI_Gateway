/**
 * Product 1.0 schema readiness — prevent healthy status when required tables are missing.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { Orchestrator } from '../../src/api/orchestrator.js';
import { loadConfig } from '../../src/shared/config.js';
import {
  assertDatabaseReadyForAppliance,
  checkDatabase,
} from '../../src/shared/db-health.js';
import {
  PRODUCT_1_0_REQUIRED_TABLES,
  assertSchemaReadiness,
  formatSchemaReadinessFailure,
  verifyProductSchema,
  type SchemaReadiness,
} from '../../src/shared/schema-readiness.js';

function mockQueryable(opts: {
  tables: string[];
  columns?: Record<string, string[]>;
}) {
  const columns = opts.columns ?? {};
  return {
    async query<T extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<{ rows: T[] }> {
      if (text.includes('information_schema.tables')) {
        const wanted = (values?.[0] as string[]) ?? [];
        return {
          rows: wanted
            .filter((t) => opts.tables.includes(t))
            .map((table_name) => ({ table_name }) as T),
        };
      }
      if (text.includes('information_schema.columns')) {
        const table = String(values?.[0] ?? '');
        const column = String(values?.[1] ?? '');
        const exists = (columns[table] ?? []).includes(column);
        return { rows: [{ exists } as T] };
      }
      return { rows: [] };
    },
  };
}

describe('Product 1.0 schema readiness', () => {
  it('Test A: complete schema reports ready', async () => {
    const cols: Record<string, string[]> = {
      action_outcomes: ['deployment_id', 'execution_id', 'evaluation_id'],
    };
    const ready = await verifyProductSchema(
      mockQueryable({
        tables: [...PRODUCT_1_0_REQUIRED_TABLES],
        columns: cols,
      }),
    );
    expect(ready.ok).toBe(true);
    expect(ready.missing_tables).toEqual([]);
    expect(ready.missing_columns).toEqual([]);
    expect(() => assertSchemaReadiness(ready)).not.toThrow();
  });

  it('Test B: missing action_outcomes is not ready and is actionable', async () => {
    const tables = PRODUCT_1_0_REQUIRED_TABLES.filter(
      (t) => t !== 'action_outcomes',
    );
    const ready = await verifyProductSchema(
      mockQueryable({
        tables: [...tables],
        columns: {},
      }),
    );
    expect(ready.ok).toBe(false);
    expect(ready.missing_tables).toContain('action_outcomes');
    expect(ready.remediation).toMatch(/migrate-action-outcome-phase4/);
    expect(() => assertSchemaReadiness(ready)).toThrow(/SCHEMA_NOT_READY/);
    expect(formatSchemaReadinessFailure(ready)).toMatch(/action_outcomes/);
  });

  it('Test B: Phase 4 without deployment_id column is incomplete', async () => {
    const ready = await verifyProductSchema(
      mockQueryable({
        tables: [...PRODUCT_1_0_REQUIRED_TABLES],
        columns: {
          action_outcomes: ['execution_id', 'evaluation_id'],
        },
      }),
    );
    expect(ready.ok).toBe(false);
    expect(ready.missing_columns).toContain('action_outcomes.deployment_id');
  });

  it('Test C: unavailable database fails closed (not ready)', async () => {
    const health = await checkDatabase(
      'postgres://invalid:invalid@127.0.0.1:1/does_not_exist',
    );
    expect(health.ok).toBe(false);
    expect(health.connectivity_ok).toBe(false);
    await expect(
      assertDatabaseReadyForAppliance(
        'postgres://invalid:invalid@127.0.0.1:1/does_not_exist',
      ),
    ).rejects.toThrow(/DATABASE_UNAVAILABLE/);
  });

  it('/health returns 503 SCHEMA_NOT_READY when schema incomplete', async () => {
    const incomplete: SchemaReadiness = {
      ok: false,
      detail: 'product_1_0_schema_incomplete',
      missing_tables: ['action_outcomes'],
      missing_columns: [],
      remediation: 'apply migrations',
    };
    const orchestrator = {
      completions: async () => ({ httpStatus: 401, body: {} }),
      actions: async () => ({ httpStatus: 401, body: {} }),
      reportActionOutcome: async () => ({ httpStatus: 401, body: {} }),
    } as unknown as Orchestrator;

    const server = await buildServer({
      orchestrator,
      admin: {
        config: loadConfig({} as NodeJS.ProcessEnv),
        identityStore: {} as never,
        registry: {} as never,
        providers: [],
        audit: { list: async () => [] } as never,
        persistence: 'postgres',
        policyStore: {} as never,
        checkDatabase: async () => ({
          ok: false,
          detail: 'schema_incomplete',
          connectivity_ok: true,
          schema: incomplete,
        }),
        checkLocalRuntime: async () => ({
          mode: 'stub',
          active_runtime: 'stub',
          available: true,
          airgap: false,
        }),
      },
    });

    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(503);
    const body = health.json() as {
      status: string;
      reason_code: string;
      database: { connectivity_ok?: boolean; schema?: { missing_tables?: string[] } };
    };
    expect(body.status).toBe('unavailable');
    expect(body.reason_code).toBe('SCHEMA_NOT_READY');
    expect(body.database.connectivity_ok).toBe(true);
    expect(body.database.schema?.missing_tables).toContain('action_outcomes');
    await server.close();
  });

  it('/health returns 503 DATABASE_UNAVAILABLE when connectivity fails', async () => {
    const orchestrator = {
      completions: async () => ({ httpStatus: 401, body: {} }),
      actions: async () => ({ httpStatus: 401, body: {} }),
      reportActionOutcome: async () => ({ httpStatus: 401, body: {} }),
    } as unknown as Orchestrator;

    const server = await buildServer({
      orchestrator,
      admin: {
        config: loadConfig({} as NodeJS.ProcessEnv),
        identityStore: {} as never,
        registry: {} as never,
        providers: [],
        audit: { list: async () => [] } as never,
        persistence: 'postgres',
        policyStore: {} as never,
        checkDatabase: async () => ({
          ok: false,
          detail: 'connection refused',
          connectivity_ok: false,
        }),
        checkLocalRuntime: async () => ({
          mode: 'stub',
          active_runtime: 'stub',
          available: true,
          airgap: false,
        }),
      },
    });

    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(503);
    const body = health.json() as { reason_code: string; status: string };
    expect(body.status).toBe('unavailable');
    expect(body.reason_code).toBe('DATABASE_UNAVAILABLE');
    await server.close();
  });

  it('/health remains 200 when schema ready (no false failure)', async () => {
    const orchestrator = {
      completions: async () => ({ httpStatus: 401, body: {} }),
      actions: async () => ({ httpStatus: 401, body: {} }),
      reportActionOutcome: async () => ({ httpStatus: 401, body: {} }),
    } as unknown as Orchestrator;

    const server = await buildServer({
      orchestrator,
      admin: {
        config: loadConfig({} as NodeJS.ProcessEnv),
        identityStore: {} as never,
        registry: {} as never,
        providers: [],
        audit: { list: async () => [] } as never,
        persistence: 'postgres',
        policyStore: {} as never,
        checkDatabase: async () => ({
          ok: true,
          detail: 'connected',
          connectivity_ok: true,
          schema: {
            ok: true,
            detail: 'product_1_0_schema_ready',
            missing_tables: [],
            missing_columns: [],
          },
        }),
        checkLocalRuntime: async () => ({
          mode: 'stub',
          active_runtime: 'stub',
          available: true,
          airgap: false,
        }),
      },
    });

    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const body = health.json() as { status: string; database: { ok: boolean } };
    expect(body.status).toBe('ok');
    expect(body.database.ok).toBe(true);
    await server.close();
  });
});
