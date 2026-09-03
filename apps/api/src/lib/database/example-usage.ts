/**
 * Database Abstraction Layer - Usage Examples
 *
 * This demonstrates how to use the multi-database support in your application.
 * The same code works across PostgreSQL, MySQL, and Oracle databases.
 */

import {
  createDatabaseAdapter,
  getDatabaseCapabilities,
  validateDatabaseSupport,
} from './factory';
import { AdapterDatabaseConfig } from '@node2/shared';

// ============================================================================
// Example 1: Basic Usage - Switch Between Databases
// ============================================================================

async function example1_BasicUsage() {
  // PostgreSQL configuration
  const postgresConfig: Partial<AdapterDatabaseConfig> = {
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'node2',
    username: 'node2',
    password: 'password',
  };

  // MySQL configuration
  const mysqlConfig: Partial<AdapterDatabaseConfig> = {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'node2',
    username: 'node2',
    password: 'password',
  };

  // Create adapter for PostgreSQL
  const db = createDatabaseAdapter(postgresConfig);

  // Same code works with any database!
  await db.connect();

  // Query users (works the same for all databases)
  const users = await db.query(
    'SELECT * FROM users WHERE organization_id = ?',
    ['org-123']
  );
  console.log('Users:', users);

  // Insert a record
  await db.execute(
    'INSERT INTO users (id, name, email, organization_id) VALUES (?, ?, ?, ?)',
    ['uuid-here', 'John Doe', 'john@example.com', 'org-123']
  );

  await db.disconnect();
}

// ============================================================================
// Example 2: Check Database Capabilities
// ============================================================================

async function example2_CapabilitiesCheck() {
  const dbType = process.env.DATABASE_TYPE || 'postgresql';

  // Check what features are available
  const capabilities = getDatabaseCapabilities(dbType as any);

  console.log('Database Capabilities:');
  console.log('- Vector Search:', capabilities.supportsVectorSearch);
  console.log('- JSON Support:', capabilities.supportsJSON);
  console.log('- Transactions:', capabilities.supportsTransactions);
  console.log('- Vector Search:', capabilities.supportsVectorSearch);

  // Validate if database supports required features
  const validation = validateDatabaseSupport(dbType as any);

  if (!validation.valid) {
    console.warn('Missing features:', validation.missingFeatures);
  }
}

// ============================================================================
// Example 3: Vector Search (PostgreSQL and Oracle 23c+ only)
// ============================================================================

async function example3_VectorSearch() {
  const db = createDatabaseAdapter();
  await db.connect();

  // Check if vector search is supported
  const capabilities = db.getCapabilities();

  if (!capabilities.supportsVectorSearch) {
    console.warn('⚠️  Vector search not supported in this database');
    return;
  }

  // Generate embedding for a query
  const query = 'What is the company policy on remote work?';
  const queryEmbedding = await generateEmbedding(query); // Your AI model

  // Search for similar chunks
  const results = await db.vectorSearch!(
    'vector_embeddings',
    queryEmbedding,
    10, // limit
    0.7 // similarity threshold
  );

  console.log('Found', results.length, 'similar chunks');
  for (const result of results) {
    console.log(`Similarity: ${result.similarity.toFixed(2)}`);
    console.log(`Text: ${result.chunk_text.substring(0, 100)}...`);
  }

  await db.disconnect();
}

// ============================================================================
// Example 4: Transactions
// ============================================================================

async function example4_Transactions() {
  const db = createDatabaseAdapter();
  await db.connect();

  try {
    await db.beginTransaction();

    // Insert multiple records atomically
    await db.execute(
      'INSERT INTO audit_logs (id, organization_id, action) VALUES (?, ?, ?)',
      ['id1', 'org-123', 'created']
    );

    await db.execute(
      'INSERT INTO audit_logs (id, organization_id, action) VALUES (?, ?, ?)',
      ['id2', 'org-123', 'updated']
    );

    // Commit if everything succeeded
    await db.commit();
    console.log('✅ Transaction committed');
  } catch (error) {
    // Rollback on error
    await db.rollback();
    console.error('❌ Transaction rolled back:', error);
  }

  await db.disconnect();
}

// ============================================================================
// Example 5: Using with Application Code
// ============================================================================

class UserService {
  private db = createDatabaseAdapter();

  async connect() {
    await this.db.connect();
  }

  async getUserById(userId: string): Promise<any> {
    return await this.db.queryOne('SELECT * FROM users WHERE id = ?', [userId]);
  }

  async getUsersByOrganization(orgId: string): Promise<any[]> {
    return await this.db.query(
      'SELECT * FROM users WHERE organization_id = ? ORDER BY created_at DESC',
      [orgId]
    );
  }

  async createUser(user: {
    id: string;
    name: string;
    email: string;
    organization_id: string;
    role: string;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO users (id, name, email, organization_id, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [user.id, user.name, user.email, user.organization_id, user.role, true]
    );
  }

  async searchUsers(query: string, orgId: string): Promise<any[]> {
    // Use full-text search
    return await this.db.query(
      `SELECT * FROM users 
       WHERE organization_id = ? 
         AND (name LIKE ? OR email LIKE ?)
       ORDER BY created_at DESC
       LIMIT 25`,
      [orgId, `%${query}%`, `%${query}%`]
    );
  }

  async disconnect() {
    await this.db.disconnect();
  }
}

// ============================================================================
// Example 6: Schema Information
// ============================================================================

async function example6_SchemaInfo() {
  const db = createDatabaseAdapter();
  await db.connect();

  // Check if table exists
  const tableExists = await db.tableExists('users');
  console.log('Users table exists:', tableExists);

  // Get column information
  const columns = await db.getColumns('users');
  console.log('Users table columns:');
  for (const col of columns) {
    console.log(
      `- ${col.name}: ${col.type} ${col.nullable ? 'NULL' : 'NOT NULL'}`
    );
  }

  await db.disconnect();
}

// ============================================================================
// Example 7: Environment-Based Configuration
// ============================================================================

async function example7_EnvironmentConfig() {
  // Database type determined by environment variable
  // DATABASE_TYPE=postgresql|mysql|oracle
  // Other config comes from DATABASE_HOST, DATABASE_PORT, etc.

  const db = createDatabaseAdapter(); // Uses environment variables
  await db.connect();

  // Your code here - works with any database

  await db.disconnect();
}

// ============================================================================
// Example 8: Handling Database Differences
// ============================================================================

async function example8_HandlingDifferences() {
  const db = createDatabaseAdapter();
  const capabilities = db.getCapabilities();

  await db.connect();

  // Vector search (PostgreSQL and Oracle 23c+ only)
  if (capabilities.supportsVectorSearch) {
    const embedding = await generateEmbedding('query');
    const results = await db.vectorSearch!('vector_embeddings', embedding);
    console.log('Vector search results:', results);
  } else {
    console.log('⚠️  Vector search not available - using external vector DB');
    // Fallback to Pinecone, Weaviate, etc.
  }

  // JSON support (check for JSON operations)
  if (capabilities.supportsJSON) {
    const data = await db.query('SELECT metadata FROM sources WHERE id = ?', [
      'id-123',
    ]);
    const metadata = data[0].metadata; // Native JSON type
  } else {
    // Store JSON as TEXT and parse manually
  }

  // Row Level Security (PostgreSQL only)
  if (capabilities.supportsRowLevelSecurity) {
    console.log('Using PostgreSQL RLS for security');
  } else {
    console.log('Using application-level row filtering');
  }

  await db.disconnect();
}

// ============================================================================
// Helper Functions
// ============================================================================

// Mock function for generating embeddings
async function generateEmbedding(text: string): Promise<number[]> {
  // In real app, this would call your AI model
  return new Array(1536).fill(0).map(() => Math.random() - 0.5);
}

// ============================================================================
// Run Examples
// ============================================================================

async function runExamples() {
  console.log('Running database abstraction examples...\n');

  try {
    console.log('Example 1: Basic Usage');
    await example1_BasicUsage();
    console.log('\n');

    console.log('Example 2: Capabilities Check');
    await example2_CapabilitiesCheck();
    console.log('\n');

    console.log('Example 6: Schema Information');
    await example6_SchemaInfo();
    console.log('\n');
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Uncomment to run:
// runExamples();

export {
  example1_BasicUsage,
  example2_CapabilitiesCheck,
  example3_VectorSearch,
  example4_Transactions,
  UserService,
  example6_SchemaInfo,
  example7_EnvironmentConfig,
  example8_HandlingDifferences,
};
