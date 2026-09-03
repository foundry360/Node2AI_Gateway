/**
 * MySQL Database Adapter
 *
 * Supports MySQL 8.0+ with:
 * - JSON support
 * - Transactions
 * - Full-text search
 * - UUID support (MySQL 8.0+)
 *
 * Note: Vector search NOT supported natively
 */

import {
  DatabaseAdapter,
  AdapterDatabaseConfig,
  DatabaseCapabilities,
  ColumnInfo,
  TransactionContext,
} from '@node2/shared';

// Note: This requires 'mysql2' package
// Install with: npm install mysql2 @types/mysql2

let mysql: any;
try {
  mysql = require('mysql2/promise');
} catch (error) {
  console.warn(
    '⚠️  mysql2 package not installed. MySQL adapter will not work.'
  );
}

export class MySQLAdapter implements DatabaseAdapter {
  private connection: any = null;
  private pool: any = null;
  private transactionContext: TransactionContext = new TransactionContext();
  private capabilities: DatabaseCapabilities;

  constructor(private config: AdapterDatabaseConfig) {
    if (!mysql) {
      throw new Error('mysql2 package not installed. Run: npm install mysql2');
    }

    // MySQL capabilities
    this.capabilities = {
      supportsVectorSearch: false, // Not natively supported
      supportsJSON: true,
      supportsTransactions: true,
      supportsRowLevelSecurity: false, // Not available
      supportsFullTextSearch: true,
      requiresExtensions: [],
    };

    // Create connection pool
    this.createPool();
  }

  private createPool(): void {
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      waitForConnections: true,
      connectionLimit: this.config.pool?.max || 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    console.log('✅ MySQL connection pool created');
  }

  async connect(): Promise<void> {
    // Get a connection from the pool
    this.connection = await this.pool.getConnection();
    console.log('✅ MySQL connected');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.release();
      this.connection = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.connection) throw new Error('Not connected to database');

    // Convert PostgreSQL placeholders to MySQL placeholders
    const mysqlSql = this.convertSQL(sql);

    const [rows] = await this.connection.query(mysqlSql, params);
    return rows as T[];
  }

  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results[0] || null;
  }

  async execute(sql: string, params?: any[]): Promise<number> {
    if (!this.connection) throw new Error('Not connected to database');

    const mysqlSql = this.convertSQL(sql);
    const [result] = await this.connection.execute(mysqlSql, params);

    // MySQL returns affectedRows
    return (result as any).affectedRows || 0;
  }

  async beginTransaction(): Promise<void> {
    if (!this.connection) throw new Error('Not connected to database');
    if (this.transactionContext.isActive()) {
      throw new Error('Transaction already active');
    }

    await this.connection.beginTransaction();
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
        IS_NULLABLE = 'YES' as nullable,
        COLUMN_DEFAULT as default_value,
        CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END as is_primary_key
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;

    const [rows] = await this.connection.query(query, [tableName]);

    return rows.map((col: any) => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable,
      defaultValue: col.default_value,
      isPrimaryKey: col.is_primary_key,
    }));
  }

  async tableExists(tableName: string): Promise<boolean> {
    if (!this.connection) throw new Error('Not connected to database');

    const query = `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ?
    `;

    const [rows] = await this.connection.query(query, [tableName]);
    return rows[0].count > 0;
  }

  // MySQL does NOT support native vector search
  // Would need to use external vector database or application-level similarity
  async vectorSearch(
    tableName: string,
    queryEmbedding: number[],
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<any[]> {
    throw new Error(
      'Vector search not supported in MySQL. Use external vector database.'
    );
  }

  getCapabilities(): DatabaseCapabilities {
    return this.capabilities;
  }

  /**
   * Convert PostgreSQL SQL syntax to MySQL
   */
  private convertSQL(sql: string): string {
    let converted = sql;

    // Convert parameter placeholders: $1, $2, ... to ?, ?, ...
    converted = converted.replace(/\$(\d+)/g, '?');

    // Convert ILIKE (case-insensitive) to LIKE with LOWER()
    converted = converted.replace(/\s+ILIKE\s+/gi, ' LIKE ');

    // Convert NOW() to NOW() (same in both)

    // Convert TIMESTAMP WITH TIME ZONE to TIMESTAMP
    converted = converted.replace(
      /TIMESTAMP\s+WITH\s+TIME\s+ZONE/gi,
      'TIMESTAMP'
    );

    // Convert JSONB to JSON
    converted = converted.replace(/\bJSONB\b/gi, 'JSON');

    // Convert UUID type to CHAR(36)
    converted = converted.replace(/\::text\b/, '');

    return converted;
  }
}
