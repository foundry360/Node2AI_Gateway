/**
 * External Database Connector - Example Implementation
 *
 * This demonstrates how Node2AI can connect to customer's MySQL or Oracle
 * databases to read their documents and process them through Node2AI's pipeline.
 *
 * HOW TO USE:
 * 1. Install required drivers: npm install mysql2 oracledb
 * 2. Configure connection in environment variables
 * 3. Call syncDocuments() to pull documents from customer DB
 * 4. Documents get processed and stored in Node2AI's PostgreSQL
 *
 * EXAMPLE USAGE:
 *
 * ```typescript
 * import { ExternalDatabaseConnector } from './connector';
 *
 * const connector = new ExternalDatabaseConnector({
 *   type: 'mysql',
 *   host: 'customer-mysql.internal',
 *   port: 3306,
 *   database: 'customer_app',
 *   username: 'readonly',
 *   password: 'password',
 *   tables: ['documents']
 * });
 *
 * // Sync documents from customer DB to Node2AI
 * await connector.syncDocuments('org-123');
 * ```
 */

import { query } from '../db/postgres-client';

// ============================================================================
// Types
// ============================================================================

export interface ExternalDatabaseConfig {
  type: 'mysql' | 'oracle';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  tables: string[];
  tableSchema?: TableSchema;
}

export interface TableSchema {
  tableName: string;
  idColumn: string;
  contentColumn: string;
  titleColumn?: string;
  metadataColumn?: string;
  timestampColumn?: string;
}

export interface SyncResult {
  success: boolean;
  documentsProcessed: number;
  errors: string[];
}

// ============================================================================
// MySQL Connector
// ============================================================================

class MySQLConnector {
  private connection: any;

  async connect(config: ExternalDatabaseConfig): Promise<void> {
    // Note: You need to install: npm install mysql2
    // Uncomment when ready to use:
    /*
    const mysql = require('mysql2/promise');
    this.connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
    });
    console.log('✅ Connected to MySQL database');
    */
    throw new Error(
      'MySQL connector not yet implemented. Install mysql2 package first.'
    );
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
    }
  }

  async fetchDocuments(tableName: string, schema: TableSchema): Promise<any[]> {
    const query = this.buildSelectQuery(tableName, schema);
    const [rows] = await this.connection.query(query);
    return rows;
  }

  private buildSelectQuery(tableName: string, schema: TableSchema): string {
    const columns = [
      schema.idColumn,
      schema.contentColumn,
      schema.titleColumn,
      schema.metadataColumn,
      schema.timestampColumn,
    ]
      .filter(Boolean)
      .join(', ');

    return `SELECT ${columns} FROM ${tableName}`;
  }
}

// ============================================================================
// Oracle Connector
// ============================================================================

class OracleConnector {
  private connection: any;

  async connect(config: ExternalDatabaseConfig): Promise<void> {
    // Note: You need to install: npm install oracledb
    // Uncomment when ready to use:
    /*
    const oracledb = require('oracledb');
    this.connection = await oracledb.getConnection({
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.database}`,
    });
    console.log('✅ Connected to Oracle database');
    */
    throw new Error(
      'Oracle connector not yet implemented. Install oracledb package first.'
    );
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }

  async fetchDocuments(tableName: string, schema: TableSchema): Promise<any[]> {
    const query = this.buildSelectQuery(tableName, schema);
    const result = await this.connection.execute(query);

    // Convert Oracle result to array of objects
    const documents: any[] = [];
    if (result.rows) {
      for (const row of result.rows) {
        const doc: any = {};
        result.metaData?.forEach((col: any, i: number) => {
          doc[col.name] = row[i];
        });
        documents.push(doc);
      }
    }
    return documents;
  }

  private buildSelectQuery(tableName: string, schema: TableSchema): string {
    const columns = [
      schema.idColumn,
      schema.contentColumn,
      schema.titleColumn,
      schema.metadataColumn,
      schema.timestampColumn,
    ]
      .filter(Boolean)
      .join(', ');

    return `SELECT ${columns} FROM ${tableName.toUpperCase()}`;
  }
}

// ============================================================================
// Main Connector Class
// ============================================================================

export class ExternalDatabaseConnector {
  private connector: MySQLConnector | OracleConnector | null = null;

  constructor(private config: ExternalDatabaseConfig) {
    // Determine which connector to use based on type
    if (config.type === 'mysql') {
      this.connector = new MySQLConnector();
    } else if (config.type === 'oracle') {
      this.connector = new OracleConnector();
    }
  }

  /**
   * Connect to external database
   */
  async connect(): Promise<void> {
    if (!this.connector) {
      throw new Error(`Unsupported database type: ${this.config.type}`);
    }
    await this.connector.connect(this.config);
  }

  /**
   * Disconnect from external database
   */
  async disconnect(): Promise<void> {
    if (this.connector) {
      await this.connector.disconnect();
    }
  }

  /**
   * Sync documents from external database to Node2AI
   */
  async syncDocuments(
    organizationId: string,
    onProgress?: (msg: string) => void
  ): Promise<SyncResult> {
    if (!this.connector) {
      throw new Error('No connector available');
    }

    const result: SyncResult = {
      success: true,
      documentsProcessed: 0,
      errors: [],
    };

    try {
      for (const tableName of this.config.tables) {
        onProgress?.(`📊 Reading table: ${tableName}`);

        // Get table schema (or use default)
        const schema = this.getTableSchema(tableName);

        // Fetch documents
        const documents = await this.connector.fetchDocuments(
          tableName,
          schema
        );

        onProgress?.(`Found ${documents.length} documents in ${tableName}`);

        // Process each document
        for (const doc of documents) {
          try {
            await this.processDocument(doc, tableName, schema, organizationId);
            result.documentsProcessed++;

            if (result.documentsProcessed % 10 === 0) {
              onProgress?.(
                `Processed ${result.documentsProcessed} documents...`
              );
            }
          } catch (error: any) {
            const errorMsg = `Error processing document ${doc[schema.idColumn]}: ${error.message}`;
            result.errors.push(errorMsg);
            onProgress?.(`❌ ${errorMsg}`);
          }
        }
      }

      onProgress?.(
        `✅ Sync complete: ${result.documentsProcessed} documents processed`
      );
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Process a single document through Node2AI's pipeline
   */
  private async processDocument(
    document: any,
    sourceTable: string,
    schema: TableSchema,
    organizationId: string
  ): Promise<void> {
    // Extract text content
    const content = document[schema.contentColumn];
    const title =
      document[schema.titleColumn] || `doc_${document[schema.idColumn]}`;
    const metadata = document[schema.metadataColumn] || {};

    if (!content) {
      throw new Error('No content found in document');
    }

    // Create Buffer from content
    const buffer = Buffer.from(
      typeof content === 'string' ? content : JSON.stringify(content),
      'utf-8'
    );

    // For now, just store a reference in curated_sources
    // In a full implementation, you would:
    // 1. Process through RAGService
    // 2. Generate embeddings
    // 3. Store in vector_embeddings table

    await query(
      `
        INSERT INTO curated_sources (
          organization_id,
          name,
          source_type,
          storage_path,
          size_bytes,
          chunk_count,
          status,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        organizationId,
        `External: ${title}`,
        'external_database',
        `${this.config.type}://${this.config.database}/${sourceTable}/${document[schema.idColumn]}`,
        buffer.length,
        0,
        'pending',
        {
          external_db_type: this.config.type,
          external_db_name: this.config.database,
          external_table: sourceTable,
          external_id: document[schema.idColumn],
          external_title: title,
          last_sync: new Date().toISOString(),
          original_metadata: metadata,
        },
      ]
    );
  }

  /**
   * Get table schema (uses sensible defaults if not provided)
   */
  private getTableSchema(tableName: string): TableSchema {
    if (this.config.tableSchema) {
      return this.config.tableSchema;
    }

    // Use sensible defaults
    return {
      tableName,
      idColumn: this.config.type === 'mysql' ? 'id' : 'ID',
      contentColumn: this.config.type === 'mysql' ? 'content' : 'CONTENT',
      titleColumn: this.config.type === 'mysql' ? 'title' : 'TITLE',
      metadataColumn: this.config.type === 'mysql' ? 'metadata' : 'METADATA',
      timestampColumn:
        this.config.type === 'mysql' ? 'updated_at' : 'UPDATED_AT',
    };
  }
}

// ============================================================================
// Usage Example
// ============================================================================

/*
// Example: Sync documents from MySQL
const mysqlConnector = new ExternalDatabaseConnector({
  type: 'mysql',
  host: 'customer-mysql.internal',
  port: 3306,
  database: 'customer_app',
  username: 'readonly_user',
  password: 'secure_password',
  tables: ['documents', 'knowledge_base'],
  tableSchema: {
    tableName: 'documents',
    idColumn: 'id',
    contentColumn: 'body',
    titleColumn: 'title',
    metadataColumn: 'metadata',
    timestampColumn: 'updated_at',
  },
});

await mysqlConnector.connect();
const result = await mysqlConnector.syncDocuments('org-123', (msg) => {
  console.log(msg);
});
console.log(`Processed ${result.documentsProcessed} documents`);
await mysqlConnector.disconnect();
*/

// Example: Sync documents from Oracle
/*
const oracleConnector = new ExternalDatabaseConnector({
  type: 'oracle',
  host: 'oracle-db.customer.com',
  port: 1521,
  database: 'CUSTOMER_XE',
  username: 'NODE2_READONLY',
  password: 'secure_password',
  tables: ['DOCUMENTS'],
});

await oracleConnector.connect();
await oracleConnector.syncDocuments('org-123');
await oracleConnector.disconnect();
*/
