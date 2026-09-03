# Hybrid Database Integration Guide

## Overview

This guide explains how Node2AI interacts with documents and data stored in your customer's database (MySQL, Oracle, etc.) while keeping Node2AI's internal operations in PostgreSQL.

## The Hybrid Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER'S INFRASTRUCTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐          ┌────────────────┐           │
│  │  Customer App   │          │  Customer DB    │           │
│  │   (Your App)    │──────────▶│  MySQL/Oracle  │           │
│  │                 │  Writes   │                │           │
│  │ • Documents     │           │ • documents    │           │
│  │ • Records       │           │ • users        │           │
│  │ • Data          │           │ • data         │           │
│  └─────────────────┘           └──────┬─────────┘           │
│                                        │                      │
└────────────────────────────────────────┼──────────────────────┘
                                         │ Read access (read-only)
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NODE2AI APPLICATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │            Document Connector Service                  │   │
│  │  • Connects to customer DB                             │   │
│  │  • Fetches documents periodically                      │   │
│  │  • Detects changes/updates                            │   │
│  └───────────────────────┬────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌────────────────────────────────────────────────────────┐   │
│  │           Document Processing Pipeline                 │   │
│  │   1. Extract text from document                        │   │
│  │   2. Chunk the text intelligently                      │   │
│  │   3. Generate embeddings (vectors)                     │   │
│  │   4. Detect PII/PHI and sanitize                       │   │
│  └───────────────────────┬────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌────────────────────────────────────────────────────────┐   │
│  │            NODE2AI POSTGRESQL DATABASE                 │   │
│  │                                                         │   │
│  │  ┌────────────────┐  ┌────────────────┐              │   │
│  │  │curated_sources │  │vector_embedding│              │   │
│  │  │                │  │                │              │   │
│  │  │• name          │  │• chunk_text    │              │   │
│  │  │• storage_path  │  │• embedding     │◀─ pgvector  │   │
│  │  │• metadata      │  │• similarity    │              │   │
│  │  │• last_sync     │  │                │              │   │
│  │  └────────────────┘  └────────────────┘              │   │
│  │                                                         │   │
│  │  ┌────────────────┐  ┌────────────────┐              │   │
│  │  │audit_logs      │  │token_mappings  │              │   │
│  │  │                │  │                │              │   │
│  │  │• syncs         │  │• sanitization  │              │   │
│  │  │• accesses      │  │• tokens        │              │   │
│  │  └────────────────┘  └────────────────┘              │   │
│  └────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌────────────────────────────────────────────────────────┐   │
│  │           AI/RAG Service                                │   │
│  │  • Vector similarity search                             │   │
│  │  • Context retrieval                                     │   │
│  │  • Chat completions with document context               │   │
│  └───────────────────────┬────────────────────────────────┘   │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           │ AI Responses
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER APPLICATION                         │
│                                                                 │
│  Customer queries Node2AI with questions about their documents │
│  Node2AI searches embeddings and returns relevant context      │
└─────────────────────────────────────────────────────────────────┘
```

## Step-by-Step Data Flow

### Step 1: Customer Creates Documents

The customer's application stores documents in their MySQL/Oracle database:

```sql
-- Customer's MySQL database
INSERT INTO documents (id, title, content, created_at)
VALUES (1, 'Company Policy', 'Our company policy states that...', NOW());

-- Customer's Oracle database
INSERT INTO DOCUMENTS (ID, TITLE, CONTENT, CREATED_AT)
VALUES (SEQ_DOCS.NEXTVAL, 'HR Guidelines', 'All employees must...', SYSTIMESTAMP);
```

**Key Point**: Documents remain in customer's database. Node2AI never copies the full document.

### Step 2: Node2AI Syncs Documents

Node2AI's sync service runs (manually or on schedule):

```typescript
import { ExternalDatabaseConnector } from './connector';

const connector = new ExternalDatabaseConnector({
  type: 'mysql',
  host: 'customer-mysql.internal',
  port: 3306,
  database: 'customer_app',
  username: 'readonly_user',
  password: 'password',
  tables: ['documents'], // Which tables to read from
});

// Connect to customer DB
await connector.connect();

// Sync documents
const result = await connector.syncDocuments('organization-id');
// Result: { success: true, documentsProcessed: 150, errors: [] }
```

**What happens**:

- Connects to customer's database (read-only access)
- Reads all documents from configured tables
- Checks last sync timestamp
- Only processes new or updated documents

### Step 3: Document Processing

For each document, Node2AI:

1. **Extracts text**:

   ```typescript
   // Get document from customer DB
   const doc = await customerDB.query('SELECT * FROM documents WHERE id = ?', [
     docId,
   ]);

   // Extract text content
   const textContent = doc.content; // "Our company policy states that..."
   ```

2. **Chunks the text**:

   ```typescript
   // Split into 500-character chunks with overlap
   const chunks = chunkText(textContent, 500, 50);
   // Result: ['Our company policy states that...', 'states that all employees...', ...]
   ```

3. **Generates embeddings**:

   ```typescript
   // Convert each chunk to a vector using AI model
   const embedding = await aiModel.createEmbedding(chunk);
   // Result: [0.123, -0.456, 0.789, ...]  (1536 dimensions)
   ```

4. **Stores in Node2AI PostgreSQL**:

   ```typescript
   // Store in Node2AI's curated_sources table
   await node2aiDB.insert('curated_sources', {
     organization_id: 'org-123',
     name: 'External: Company Policy',
     source_type: 'external_database',
     storage_path: 'mysql://customer_app/documents/1', // Reference, not copy
     metadata: {
       external_id: 1,
       external_table: 'documents',
       last_sync: '2024-01-15T10:30:00Z',
     },
   });

   // Store embeddings in vector_embeddings table
   await node2aiDB.insert('vector_embeddings', {
     source_id: sourceId,
     chunk_text: chunk,
     embedding: embedding, // pgvector type for similarity search
     chunk_index: 0,
     metadata: { page: 1, section: 'intro' },
   });
   ```

**Key Point**: Only the **chunks** and **embeddings** are stored in Node2AI, not the full document.

### Step 4: AI Queries Use Documents

When customer queries Node2AI:

```typescript
// Customer asks a question
const question = 'What is our company policy on remote work?';

// Node2AI converts question to embedding
const queryEmbedding = await aiModel.createEmbedding(question);

// Search for similar chunks in PostgreSQL
const results = await node2aiDB.query(
  `
  SELECT 
    chunk_text,
    metadata,
    1 - (embedding <=> $1::vector) as similarity
  FROM vector_embeddings
  WHERE organization_id = $2
    AND 1 - (embedding <=> $1::vector) > 0.7  -- Similarity threshold
  ORDER BY embedding <=> $1::vector
  LIMIT 5
`,
  [queryEmbedding, orgId]
);

// Results contain relevant document chunks
// Node2AI uses these chunks as context for AI response
```

### Step 5: Response to Customer

```typescript
// Node2AI sends response with document context
return {
  answer: 'Based on the company policy document, remote work is allowed for...',
  sources: [
    {
      document: 'Company Policy',
      location: 'Section 3.2',
      relevance_score: 0.94,
    },
  ],
};
```

## Implementation Example

### Full Working Example

```typescript
// apps/api/src/app/api/v1/sync-documents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ExternalDatabaseConnector } from '@/lib/external-db/connector';

export async function POST(request: NextRequest) {
  try {
    const { organizationId, databaseConfig } = await request.json();

    // Create connector
    const connector = new ExternalDatabaseConnector({
      type: databaseConfig.type,
      host: databaseConfig.host,
      port: databaseConfig.port,
      database: databaseConfig.database,
      username: databaseConfig.username,
      password: databaseConfig.password,
      tables: databaseConfig.tables,
    });

    // Connect
    await connector.connect();

    // Sync documents with progress updates
    const result = await connector.syncDocuments(organizationId, progress => {
      console.log(progress); // Log progress
      // Could also emit via WebSocket for real-time updates
    });

    // Disconnect
    await connector.disconnect();

    return NextResponse.json({
      success: result.success,
      documentsProcessed: result.documentsProcessed,
      errors: result.errors,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### Customer Configuration

Customer configures their database connection in Node2AI dashboard:

```json
{
  "organizationId": "customer-org-123",
  "externalDatabase": {
    "type": "mysql",
    "host": "mysql.internal.company.com",
    "port": 3306,
    "database": "company_app",
    "username": "node2_readonly",
    "password": "encrypted_password",
    "tables": ["documents", "knowledge_base", "policies"]
  }
}
```

## Security

### 1. Read-Only Access

```sql
-- Customer creates a read-only user for Node2AI
CREATE USER 'node2_readonly'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT ON company_app.* TO 'node2_readonly'@'%';
```

### 2. Network Isolation

```yaml
# Only Node2AI server can access customer DB
- Firewall rules: Allow only Node2AI server IP
- VPN/Tunnel: Connect via secure tunnel
```

### 3. Data Privacy

- **Full documents never copied**: Only chunks and embeddings stored
- **Encryption**: All connections use SSL/TLS
- **Audit trail**: All sync operations logged
- **Data residency**: Embeddings stored in Node2AI's DB, not customer's

## Scheduling

### Manual Sync

```bash
curl -X POST http://node2ai/api/v1/sync-documents \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"organizationId": "org-123"}'
```

### Automatic Sync (Cron Job)

```typescript
// Every 6 hours
import { DBSyncJob } from '@/lib/external-db/sync-job';

const job = new DBSyncJob(customerConfig);
job.start(organizationId, 360); // Sync every 360 minutes
```

### Webhook-Based Sync

```typescript
// Customer's app triggers sync when documents change
await fetch('http://node2ai/api/v1/sync-documents', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + webhookToken },
  body: JSON.stringify({ organizationId: 'org-123' }),
});
```

## Common Scenarios

### Scenario 1: Healthcare EHR System

- **Customer DB**: Oracle Database with patient records
- **Use Case**: Node2AI processes clinical notes, policies, guidelines
- **Access**: Read-only view to specific tables
- **Sync**: Every 4 hours during business hours
- **Result**: AI assistant can answer questions about patient care protocols

### Scenario 2: Financial Services

- **Customer DB**: MySQL with compliance documents
- **Use Case**: Node2AI indexes regulatory documents, policies
- **Access**: Read-only connection from Node2AI server
- **Sync**: Real-time via webhook when documents updated
- **Result**: AI assistant helps with compliance questions

### Scenario 3: Legal Document Management

- **Customer DB**: PostgreSQL with case files
- **Use Case**: Node2AI processes legal documents, precedents
- **Access**: Direct connection to customer's PostgreSQL
- **Sync**: Manual sync when needed
- **Result**: AI legal research assistant

## Benefits

✅ **No Migration**: Customer keeps their existing database
✅ **Full Features**: Node2AI uses PostgreSQL with all AI capabilities
✅ **Secure**: Read-only access, data never fully copied
✅ **Compliant**: Customer retains data sovereignty
✅ **Flexible**: Supports any SQL database
✅ **Scalable**: Periodic sync, not real-time load

## Next Steps

1. **Install database drivers**: `npm install mysql2 oracledb`
2. **Set up external DB configuration**: Add to organization settings
3. **Test connection**: Verify read access to customer's tables
4. **Run first sync**: Process initial documents
5. **Set up schedule**: Configure automatic syncing
6. **Monitor**: Track sync status and errors

For detailed implementation code, see:

- `apps/api/src/lib/external-db/connector.example.ts`
- `HYBRID_DATABASE_INTEGRATION.md`
