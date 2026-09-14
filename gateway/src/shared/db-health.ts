import {
  assertSchemaReadiness,
  type SchemaReadiness,
  verifyProductSchema,
} from './schema-readiness.js';

export type DatabaseStats = {
  size_bytes: number;
  size_pretty: string;
  connections_active: number;
  connections_max: number | null;
  cache_hit_pct: number | null;
  deadlocks: number;
  xact_commit: number;
  server_version: string | null;
};

export type DatabaseHealth = {
  /** Overall: reachable and (when Postgres) Product 1.0 schema ready. */
  ok: boolean;
  detail: string;
  /** True when a TCP/SQL connection succeeded (independent of schema). */
  connectivity_ok?: boolean;
  schema?: SchemaReadiness;
  stats?: DatabaseStats;
};

export async function checkDatabase(
  databaseUrl?: string,
): Promise<DatabaseHealth> {
  if (!databaseUrl) {
    return { ok: true, detail: 'not_configured' };
  }
  try {
    const mod = await import('pg');
    const Client = mod.default?.Client ?? mod.Client;
    const client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 2000,
    });
    await client.connect();
    const result = await client.query<{
      size_bytes: string;
      size_pretty: string;
      connections_active: string;
      connections_max: string | null;
      cache_hit_pct: string | null;
      deadlocks: string;
      xact_commit: string;
      server_version: string | null;
    }>(`
      SELECT
        pg_database_size(current_database())::text AS size_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS size_pretty,
        (
          SELECT count(*)::text
          FROM pg_stat_activity
          WHERE datname = current_database()
        ) AS connections_active,
        (
          SELECT setting
          FROM pg_settings
          WHERE name = 'max_connections'
        ) AS connections_max,
        (
          SELECT CASE
            WHEN blks_hit + blks_read = 0 THEN NULL
            ELSE round((blks_hit::numeric / (blks_hit + blks_read)) * 100, 1)::text
          END
          FROM pg_stat_database
          WHERE datname = current_database()
        ) AS cache_hit_pct,
        (
          SELECT deadlocks::text
          FROM pg_stat_database
          WHERE datname = current_database()
        ) AS deadlocks,
        (
          SELECT xact_commit::text
          FROM pg_stat_database
          WHERE datname = current_database()
        ) AS xact_commit,
        (
          SELECT split_part(version(), ' on ', 1)
        ) AS server_version
    `);

    const schema = await verifyProductSchema(client);
    await client.end();

    const row = result.rows[0];
    const stats: DatabaseStats | undefined = row
      ? {
          size_bytes: Number(row.size_bytes) || 0,
          size_pretty: row.size_pretty,
          connections_active: Number(row.connections_active) || 0,
          connections_max: row.connections_max
            ? Number(row.connections_max)
            : null,
          cache_hit_pct:
            row.cache_hit_pct === null || row.cache_hit_pct === undefined
              ? null
              : Number(row.cache_hit_pct),
          deadlocks: Number(row.deadlocks) || 0,
          xact_commit: Number(row.xact_commit) || 0,
          server_version: row.server_version,
        }
      : undefined;

    if (!schema.ok) {
      return {
        ok: false,
        detail: 'schema_incomplete',
        connectivity_ok: true,
        schema,
        stats,
      };
    }

    return {
      ok: true,
      detail: 'connected',
      connectivity_ok: true,
      schema,
      stats,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : 'connection_failed',
      connectivity_ok: false,
    };
  }
}

/**
 * Appliance boot gate: Postgres configured ⇒ must be reachable with Product 1.0 schema.
 */
export async function assertDatabaseReadyForAppliance(
  databaseUrl: string,
): Promise<DatabaseHealth> {
  const health = await checkDatabase(databaseUrl);
  if (!health.connectivity_ok) {
    throw new Error(
      `DATABASE_UNAVAILABLE: ${health.detail}. Postgres must be reachable before the Gateway can start.`,
    );
  }
  if (health.schema && !health.schema.ok) {
    assertSchemaReadiness(health.schema);
  }
  if (!health.ok) {
    throw new Error(`DATABASE_NOT_READY: ${health.detail}`);
  }
  return health;
}
