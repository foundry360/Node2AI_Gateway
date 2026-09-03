/**
 * Oracle Database Adapter
 *
 * Supports Oracle Database 12c+ with:
 * - JSON support (12c+)
 * - Transactions
 * - Vector search (Oracle 23c+ only)
 * - Full-text search
 *
 * Note: Requires Oracle 23c+ for vector search support
 */

import {
  DatabaseAdapter,
  AdapterDatabaseConfig,
  DatabaseCapabilities,
  ColumnInfo,
  VectorSearchResult,
  TransactionContext,
} from '@node2/shared';

// Note: This requires 'oracledb' package
// Install with: npm install oracledb
// Also requires Oracle Instant Client

let oracledb: any;
try {
  oracledb = require('oracledb');
} catch (error) {
  console.warn(
    '⚠️  oracledb package not installed. Oracle adapter will not work.'
  );
}

export class OracleAdapter implements DatabaseAdapter {
  private connection: any = null;
  private transactionContext: TransactionContext = new TransactionContext();
  private capabilities: DatabaseCapabilities;

  constructor(private config: AdapterDatabaseConfig) {
    if (!oracledb) {
      throw new Error(
        'oracledb package not installed. Run: npm install oracledb'
      );
    }

    // Oracle capabilities (vector search requires 23c+)
    this.capabilities = {
      supportsVectorSearch: false, // Only in Oracle 23c+
      supportsJSON: true,
      supportsTransactions: true,
      supportsRowLevelSecurity: false, // Uses VPD instead
      supportsFullTextSearch: true,
      requiresExtensions: [],
    };

    // Detect Oracle version on connection
    this.detectCapabilities();
  }

  private async detectCapabilities(): Promise<void> {
    // This will be called after connect() to check Oracle version
  }

  async connect(): Promise<void> {
    if (!oracledb) throw new Error('oracledb not available');

    this.connection = await oracledb.getConnection({
      user: this.config.username,
      password: this.config.password,
      connectString: `${this.config.host}:${this.config.port}/${this.config.database}`,
    });

    // Check Oracle version
    const version = await this.getOracleVersion();
    console.log(`✅ Oracle connected (version: ${version})`);

    // Enable vector search if Oracle 23c+
    if (version >= 23) {
      this.capabilities.supportsVectorSearch = true;
    }
  }

  private async getOracleVersion(): Promise<number> {
    if (!this.connection) return 0;

    const result = await this.connection.execute(
      `SELECT * FROM V$VERSION WHERE BANNER LIKE 'Oracle Database%'`
    );

    if (result.rows && result.rows.length > 0) {
      const banner = (result.rows[0] as any)[0] as string;
      const match = banner.match(/Oracle Database (\d+)c/);
      if (match) {
        return parseInt(match[1]);
      }
    }

    return 0;
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.connection) throw new Error('Not connected to database');

    // Convert PostgreSQL placeholders to Oracle placeholders
    const oracleSql = this.convertSQL(sql, params);

    const result = await this.connection.execute(oracleSql, params || {});

    // Convert Oracle result to array of objects
    const rows: any[] = [];
    if (result.rows) {
      for (const row of result.rows) {
        const obj: any = {};
        result.metaData?.forEach((col: any, i: number) => {
          obj[col.name] = row[i];
        });
        rows.push(obj);
      }
    }

    return rows as T[];
  }

  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results[0] || null;
  }

  async execute(sql: string, params?: any[]): Promise<number> {
    if (!this.connection) throw new Error('Not connected to database');

    const oracleSql = this.convertSQL(sql, params);
    const result = await this.connection.execute(oracleSql, params || {});

    return result.rowsAffected || 0;
  }

  async beginTransaction(): Promise<void> {
    if (!this.connection) throw new Error('Not connected to database');
    if (this.transactionContext.isActive()) {
      throw new Error('Transaction already active');
    }

    // Oracle uses implicit transactions, but we can be explicit
    this.transactionContext.start();
  }

  async commit(): Promise<void> {
    if (!this.connection) throw new Error('Not connected to database');
    if (!this.transactionContext.isActive()) {
      throw new Error('No active transaction');
    }

    await this.connection.commit();
    this.transactionContext.commit();
  }

  async rollback(): Promise<void> {
    if (!this.connection) throw new Error('Not connected to database');
    if (!this.transactionContext.isActive()) {
      throw new Error('No active transaction');
    }

    await this.connection.rollback();
    this.transactionContext.rollback();
  }

  inTransaction(): boolean {
    return this.transactionContext.isActive();
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.connection) throw new Error('Not connected to database');

    const query = `
      SELECT 
        COLUMN_NAME as name,
        DATA_TYPE as type,
        NULLABLE as nullable,
        DATA_DEFAULT as default_value,
        CASE WHEN COLUMN_NAME IN (
          SELECT COLUMN_NAME 
          FROM USER_CONS_COLUMNS 
          WHERE CONSTRAINT_NAME IN (
            SELECT CONSTRAINT_NAME 
            FROM USER_CONSTRAINTS 
            WHERE TABLE_NAME = UPPER(:tableName) AND CONSTRAINT_TYPE = 'P'
          )
        ) THEN 1 ELSE 0 END as is_primary_key
      FROM USER_TAB_COLUMNS 
      WHERE TABLE_NAME = UPPER(:tableName)
      ORDER BY COLUMN_ID
    `;

    const result = await this.connection.execute(query, { tableName });

    const rows: any[] = [];
    if (result.rows) {
      for (const row of result.rows) {
        const obj: any = {};
        result.metaData?.forEach((col: any, i: number) => {
          obj[col.name] = row[i];
        });
        rows.push(obj);
      }
    }

    return rows.map((col: any) => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable === 'Y',
      defaultValue: col.default_value,
      isPrimaryKey: col.is_primary_key === 1,
    }));
  }

  async tableExists(tableName: string): Promise<boolean> {
    if (!this.connection) throw new Error('Not connected to database');

    const query = `
      SELECT COUNT(*) as count
      FROM USER_TABLES
      WHERE TABLE_NAME = UPPER(:tableName)
    `;

    const result = await this.connection.execute(query, { tableName });
    return result.rows?.[0]?.[0] > 0;
  }

  // Vector search (Oracle 23c+ only)
  async vectorSearch(
    tableName: string,
    queryEmbedding: number[],
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<VectorSearchResult[]> {
    if (!this.connection) throw new Error('Not connected to database');
    if (!this.capabilities.supportsVectorSearch) {
      throw new Error('Vector search requires Oracle 23c or higher');
    }

    if (tableName !== 'VECTOR_EMBEDDINGS') {
      throw new Error(
        'Vector search only supported on VECTOR_EMBEDDINGS table'
      );
    }

    // Oracle 23c vector search syntax
    const query = `
      SELECT 
        CHUNK_TEXT,
        JSON_SERIALIZE(METADATA) as METADATA,
        VECTOR_DISTANCE(EMBEDDING, :queryEmbedding, DOT) as SIMILARITY,
        SOURCE_ID
      FROM VECTOR_EMBEDDINGS
      WHERE VECTOR_DISTANCE(EMBEDDING, :queryEmbedding, DOT) < :threshold
      ORDER BY VECTOR_DISTANCE(EMBEDDING, :queryEmbedding, DOT)
      FETCH FIRST :limit ROWS ONLY
    `;

    const result = await this.connection.execute(query, {
      queryEmbedding,
      threshold,
      limit,
    });

    const rows: any[] = [];
    if (result.rows) {
      for (const row of result.rows) {
        const obj: any = {};
        result.metaData?.forEach((col: any, i: number) => {
          obj[col.name] = row[i];
        });
        rows.push(obj);
      }
    }

    return rows.map((row: any) => ({
      chunk_text: row.CHUNK_TEXT,
      metadata: row.METADATA ? JSON.parse(row.METADATA) : null,
      similarity: 1 - row.SIMILARITY, // Convert distance to similarity
      source_id: row.SOURCE_ID,
    }));
  }

  getCapabilities(): DatabaseCapabilities {
    return this.capabilities;
  }

  /**
   * Convert PostgreSQL SQL syntax to Oracle
   */
  private convertSQL(sql: string, params?: any[]): string {
    let converted = sql;

    // Convert parameter placeholders: $1, $2, ... to :1, :2, ...
    converted = converted.replace(/\$(\d+)/g, ':$1');

    // Convert ILIKE to UPPER() with LIKE
    converted = converted.replace(/\s+ILIKE\s+/gi, ' LIKE ');

    // Convert NOW() to SYSTIMESTAMP
    converted = converted.replace(/\bNOW\(\)/gi, 'SYSTIMESTAMP');

    // Convert TIMESTAMP WITH TIME ZONE to TIMESTAMP WITH TIME ZONE (same)

    // Convert JSONB to JSON (Oracle 12c+)
    converted = converted.replace(/\bJSONB\b/gi, 'JSON');

    // Convert UUID to RAW(16) or CHAR(36) depending on usage
    converted = converted.replace(/\bUUID\b/gi, 'CHAR(36)');

    // Convert TRUE/FALSE to 1/0 for boolean checks
    converted = converted.replace(/\bTRUE\b/gi, '1');
    converted = converted.replace(/\bFALSE\b/gi, '0');

    return converted;
  }
}
