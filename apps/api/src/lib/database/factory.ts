/**
 * Database Factory - Creates the appropriate database adapter
 *
 * Usage:
 * ```typescript
 * const db = createDatabaseAdapter();
 * await db.connect();
 * const users = await db.query('SELECT * FROM users');
 * ```
 */

import {
  DatabaseAdapter,
  AdapterDatabaseConfig,
  DatabaseType,
} from '@node2/shared';
import { PostgreSQLAdapter } from './adapters/postgresql';
import { MySQLAdapter } from './adapters/mysql';
import { OracleAdapter } from './adapters/oracle';

/**
 * Create a database adapter based on configuration
 */
export function createDatabaseAdapter(
  config?: Partial<AdapterDatabaseConfig>
): DatabaseAdapter {
  const dbType = (config?.type ||
    process.env.DATABASE_TYPE ||
    'postgresql') as DatabaseType;

  // Get configuration from environment if not provided
  const fullConfig: AdapterDatabaseConfig = {
    type: dbType,
    host: config?.host || process.env.DATABASE_HOST || 'localhost',
    port: parseInt(
      config?.port?.toString() || process.env.DATABASE_PORT || '5432'
    ),
    database: config?.database || process.env.DATABASE_NAME || 'node2',
    username: config?.username || process.env.DATABASE_USER || 'node2',
    password: config?.password || process.env.DATABASE_PASSWORD || '',
    ssl: config?.ssl || process.env.DATABASE_SSL === 'true',
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
      max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
      idle: parseInt(process.env.DATABASE_POOL_IDLE || '30000'),
    },
  };

  // Create appropriate adapter based on database type
  switch (dbType) {
    case 'postgresql':
      return new PostgreSQLAdapter(fullConfig);

    case 'mysql':
      return new MySQLAdapter(fullConfig);

    case 'oracle':
      return new OracleAdapter(fullConfig);

    case 'mssql':
      throw new Error('Microsoft SQL Server adapter not yet implemented');

    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

/**
 * Get database capabilities for the configured database type
 */
export function getDatabaseCapabilities(dbType: DatabaseType = 'postgresql') {
  switch (dbType) {
    case 'postgresql':
      return {
        supportsVectorSearch: true,
        supportsJSON: true,
        supportsTransactions: true,
        supportsRowLevelSecurity: true,
        supportsFullTextSearch: true,
        requiresExtensions: ['pgvector', 'pg_trgm', 'btree_gin'],
      };

    case 'mysql':
      return {
        supportsVectorSearch: false,
        supportsJSON: true,
        supportsTransactions: true,
        supportsRowLevelSecurity: false,
        supportsFullTextSearch: true,
        requiresExtensions: [],
      };

    case 'oracle':
      return {
        supportsVectorSearch: true, // Oracle 23c+
        supportsJSON: true,
        supportsTransactions: true,
        supportsRowLevelSecurity: false, // Uses VPD instead
        supportsFullTextSearch: true,
        requiresExtensions: [],
      };

    default:
      return {
        supportsVectorSearch: false,
        supportsJSON: false,
        supportsTransactions: false,
        supportsRowLevelSecurity: false,
        supportsFullTextSearch: false,
        requiresExtensions: [],
      };
  }
}

/**
 * Validate if the configured database supports all required features
 */
export function validateDatabaseSupport(dbType: DatabaseType): {
  valid: boolean;
  missingFeatures: string[];
} {
  const capabilities = getDatabaseCapabilities(dbType);
  const missingFeatures: string[] = [];

  // Check for required features
  if (!capabilities.supportsJSON) {
    missingFeatures.push('JSON data type');
  }

  if (!capabilities.supportsTransactions) {
    missingFeatures.push('Transactions');
  }

  if (!capabilities.supportsVectorSearch) {
    missingFeatures.push('Vector search (RAG functionality will be limited)');
  }

  return {
    valid: missingFeatures.length === 0,
    missingFeatures,
  };
}
