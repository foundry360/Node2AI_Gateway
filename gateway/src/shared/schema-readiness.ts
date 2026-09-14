/**
 * Product 1.0 schema readiness — verify required Postgres relations exist.
 * Does not apply migrations; operators apply migrate-*.sql / Compose schema.sql.
 */

export type SchemaReadiness = {
  ok: boolean;
  detail: string;
  missing_tables: string[];
  missing_columns: string[];
  /** Operator-facing remediation hint when incomplete. */
  remediation?: string;
};

/**
 * Canonical Product 1.0 runtime tables (appliance Postgres).
 * Fresh installs: gateway/db/schema.sql + schema-epa.sql via Compose init.
 * Existing volumes: apply migrate-*.sql / schema-epa.sql per docs/OPERATIONS.md.
 */
export const PRODUCT_1_0_REQUIRED_TABLES = [
  'organizations',
  'applications',
  'api_keys',
  'providers',
  'models',
  'token_vault',
  'audit_events',
  'system_config',
  'policy_evaluations',
  'agents',
  'tools',
  'agent_application_bindings',
  'agent_tool_grants',
  'action_outcomes',
] as const;

/** Columns that distinguish incomplete Outcome Phase 4.1 from Phase 4-only. */
export const PRODUCT_1_0_REQUIRED_COLUMNS: ReadonlyArray<{
  table: string;
  column: string;
}> = [
  { table: 'action_outcomes', column: 'deployment_id' },
  { table: 'action_outcomes', column: 'execution_id' },
  { table: 'action_outcomes', column: 'evaluation_id' },
];

const REMEDIATION =
  'Required Product 1.0 schema is incomplete. For existing Postgres volumes apply operator migrations (see docs/OPERATIONS.md), including db/migrate-action-outcome-phase4.sql, db/migrate-action-outcome-phase4.1.sql, db/migrate-agent-tool-governance-phase-a.sql, and db/schema-epa.sql. Fresh Compose volumes load schema from gateway/db/schema.sql + schema-epa.sql.';

type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

export function formatSchemaReadinessFailure(ready: SchemaReadiness): string {
  const parts = [
    ready.detail,
    ready.missing_tables.length
      ? `missing_tables=${ready.missing_tables.join(',')}`
      : null,
    ready.missing_columns.length
      ? `missing_columns=${ready.missing_columns.join(',')}`
      : null,
    ready.remediation ?? REMEDIATION,
  ].filter(Boolean);
  return parts.join(' | ');
}

export async function verifyProductSchema(
  client: Queryable,
): Promise<SchemaReadiness> {
  const tableResult = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])`,
    [[...PRODUCT_1_0_REQUIRED_TABLES]],
  );
  const present = new Set(tableResult.rows.map((r) => String(r.table_name)));
  const missing_tables = PRODUCT_1_0_REQUIRED_TABLES.filter(
    (t) => !present.has(t),
  );

  const missing_columns: string[] = [];
  for (const req of PRODUCT_1_0_REQUIRED_COLUMNS) {
    if (missing_tables.includes(req.table as (typeof PRODUCT_1_0_REQUIRED_TABLES)[number])) {
      missing_columns.push(`${req.table}.${req.column}`);
      continue;
    }
    const col = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
       ) AS exists`,
      [req.table, req.column],
    );
    if (!col.rows[0]?.exists) {
      missing_columns.push(`${req.table}.${req.column}`);
    }
  }

  if (missing_tables.length === 0 && missing_columns.length === 0) {
    return {
      ok: true,
      detail: 'product_1_0_schema_ready',
      missing_tables: [],
      missing_columns: [],
    };
  }

  return {
    ok: false,
    detail: 'product_1_0_schema_incomplete',
    missing_tables: [...missing_tables],
    missing_columns,
    remediation: REMEDIATION,
  };
}

export async function verifyProductSchemaAtUrl(
  databaseUrl: string,
): Promise<SchemaReadiness> {
  const mod = await import('pg');
  const Client = mod.default?.Client ?? mod.Client;
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
  });
  await client.connect();
  try {
    return await verifyProductSchema(client);
  } finally {
    await client.end();
  }
}

/**
 * Fail closed at appliance boot when required schema is missing.
 */
export function assertSchemaReadiness(ready: SchemaReadiness): void {
  if (ready.ok) return;
  throw new Error(
    `SCHEMA_NOT_READY: ${formatSchemaReadinessFailure(ready)}`,
  );
}
