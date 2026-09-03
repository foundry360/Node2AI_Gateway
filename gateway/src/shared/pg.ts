import pg from 'pg';

export type PgPool = pg.Pool;

export function createPgPool(databaseUrl: string): PgPool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
}

export interface PgQueryable {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
}
