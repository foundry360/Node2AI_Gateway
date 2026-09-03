/**
 * Database Abstraction Layer - Common Types
 *
 * This defines the interface for multi-database support.
 * All database adapters must implement this interface.
 */

export type DatabaseType = 'postgresql' | 'mysql' | 'oracle' | 'mssql';

export interface DatabaseAdapter {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Query execution
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<number>; // Returns affected rows

  // Transactions
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  inTransaction(): boolean;

  // Schema operations
  getColumns(tableName: string): Promise<ColumnInfo[]>;
  tableExists(tableName: string): Promise<boolean>;

  // Optional: Vector search (PostgreSQL and Oracle 23c+ only)
  vectorSearch?(
    tableName: string,
    queryEmbedding: number[],
    limit?: number,
    threshold?: number
  ): Promise<VectorSearchResult[]>;

  // Database-specific capabilities
  getCapabilities(): DatabaseCapabilities;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: any;
  isPrimaryKey: boolean;
}

export interface VectorSearchResult {
  chunk_text: string;
  metadata: any;
  similarity: number;
  source_id: string;
}

export interface DatabaseCapabilities {
  supportsVectorSearch: boolean;
  supportsJSON: boolean;
  supportsTransactions: boolean;
  supportsRowLevelSecurity: boolean;
  supportsFullTextSearch: boolean;
  requiresExtensions?: string[];
}

export interface AdapterDatabaseConfig {
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  pool?: {
    min?: number;
    max?: number;
    idle?: number;
  };
}

/**
 * Result of database operations
 */
export interface DatabaseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  affectedRows?: number;
}

/**
 * Transaction context - tracks if we're in a transaction
 */
export class TransactionContext {
  private inTransaction = false;

  start(): void {
    this.inTransaction = true;
  }

  commit(): void {
    this.inTransaction = false;
  }

  rollback(): void {
    this.inTransaction = false;
  }

  isActive(): boolean {
    return this.inTransaction;
  }
}
