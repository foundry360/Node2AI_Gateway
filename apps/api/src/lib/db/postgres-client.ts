/**
 * PostgreSQL client for Node2AI
 * Direct connection to PostgreSQL (replaces Supabase for application data)
 */

import { Pool, QueryResult } from 'pg';

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'node2'}:${
        process.env.POSTGRES_PASSWORD || 'node2_dev_password'
      }@${process.env.POSTGRES_HOST || 'localhost'}:${
        process.env.POSTGRES_PORT || '5432'
      }/${process.env.POSTGRES_DB || 'node2ai'}`;

    // Log connection info (without password)
    const connectionInfo = connectionString.replace(
      /:\/\/[^:]+:([^@]+)@/,
      '://***:***@'
    );
    console.log('[PostgreSQL] Initializing connection pool:', connectionInfo);

    pool = new Pool({
      connectionString,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Set timezone for all connections in the pool
    pool.on('connect', async client => {
      // Set timezone to UTC for consistent analytics queries
      const timezone = process.env.DATABASE_TIMEZONE || 'UTC';
      await client.query(`SET timezone = '${timezone}'`);
    });

    // Handle pool errors
    pool.on('error', err => {
      console.error(
        '[PostgreSQL] Unexpected error on idle PostgreSQL client',
        err
      );
    });
  }

  return pool;
}

export async function query(
  text: string,
  params?: any[]
): Promise<QueryResult> {
  const pool = getPostgresPool();
  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error(
      '[PostgreSQL] Query error:',
      error instanceof Error ? error.message : error
    );
    console.error('[PostgreSQL] Query:', text);
    throw error;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
