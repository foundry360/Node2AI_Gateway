import {
  DatabaseAdapter,
  AdapterDatabaseConfig,
  DatabaseCapabilities,
  ColumnInfo,
  VectorSearchResult,
  TransactionContext,
} from '@node2/shared';
import { Pool, PoolClient, QueryResult, PoolConfig } from 'pg';

export class PostgreSQLAdapter implements DatabaseAdapter {
  private pool: Pool;
  private transactionContext = new TransactionContext();
  private transactionClient: PoolClient | null = null;
  private connected = false;

  private readonly capabilities: DatabaseCapabilities = {
    supportsVectorSearch: true,
    supportsJSON: true,
    supportsTransactions: true,
    supportsRowLevelSecurity: true,
    supportsFullTextSearch: true,
    requiresExtensions: ['uuid-ossp', 'vector', 'pg_trgm', 'btree_gin'],
  };

  constructor(private config: AdapterDatabaseConfig) {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgresql://${config.username}:${encodeURIComponent(
        config.password || ''
      )}@${config.host}:${config.port}/${config.database}`;

    const poolConfig: PoolConfig = {
      connectionString,
      max: config.pool?.max ?? 10,
      ssl:
        config.ssl ??
        (connectionString.includes('sslmode=require')
          ? { rejectUnauthorized: false }
          : undefined),
    };

    if (typeof config.pool?.idle === 'number') {
      poolConfig.idleTimeoutMillis = config.pool.idle;
    }

    this.pool = new Pool(poolConfig);
  }

  private getExecutor(): Pool | PoolClient {
    return this.transactionClient ?? this.pool;
  }

  async connect(): Promise<void> {
    await this.pool.query('SELECT 1');
    this.connected = true;
    console.log('✅ PostgreSQL connected');
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const result = await this.getExecutor().query(sql, params);
    return result.rows as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const result = await this.getExecutor().query(sql, params);
    return (result.rows[0] as T) ?? null;
  }

  async execute(sql: string, params: any[] = []): Promise<number> {
    const result = await this.getExecutor().query(sql, params);
    return result.rowCount ?? 0;
  }

  async beginTransaction(): Promise<void> {
    if (this.transactionContext.isActive()) {
      throw new Error('Transaction already active');
    }

    this.transactionClient = await this.pool.connect();
    try {
      await this.transactionClient.query('BEGIN');
      this.transactionContext.start();
    } catch (error) {
      this.transactionClient.release();
      this.transactionClient = null;
      throw error;
    }
  }

  async commit(): Promise<void> {
    if (!this.transactionContext.isActive() || !this.transactionClient) {
      throw new Error('No active transaction');
    }

    try {
      await this.transactionClient.query('COMMIT');
    } finally {
      this.transactionClient.release();
      this.transactionClient = null;
      this.transactionContext.commit();
    }
  }

  async rollback(): Promise<void> {
    if (!this.transactionContext.isActive() || !this.transactionClient) {
      throw new Error('No active transaction');
    }

    try {
      await this.transactionClient.query('ROLLBACK');
    } finally {
      this.transactionClient.release();
      this.transactionClient = null;
      this.transactionContext.rollback();
    }
  }

  inTransaction(): boolean {
    return this.transactionContext.isActive();
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.query<ColumnInfo & { default_value: any }>(
      `
      SELECT 
        column_name AS name,
        data_type AS type,
        is_nullable = 'YES' AS nullable,
        column_default,
        CASE WHEN column_name IN (
          SELECT column_name 
          FROM information_schema.key_column_usage 
          WHERE table_name = $1 AND constraint_name LIKE '%_pkey'
        ) THEN true ELSE false END AS "isPrimaryKey"
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `,
      [tableName]
    );

    return result.map(col => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable,
      defaultValue: (col as any).column_default ?? null,
      isPrimaryKey: (col as any).isPrimaryKey,
    }));
  }

  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.queryOne<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      )
    `,
      [tableName]
    );

    return Boolean(result?.exists);
  }

  async vectorSearch(
    tableName: string,
    queryEmbedding: number[],
    limit = 10,
    threshold = 0.7
  ): Promise<VectorSearchResult[]> {
    const sql = `
      SELECT
        chunk_text,
        metadata,
        similarity,
        source_id
      FROM search_similar_embeddings($1::vector, $2::int, $3::float)
    `;

    const rows = await this.query<VectorSearchResult>(sql, [
      queryEmbedding,
      limit,
      threshold,
    ]);

    return rows;
  }

  getCapabilities(): DatabaseCapabilities {
    return this.capabilities;
  }
}

export { TransactionContext } from '@node2/shared';
