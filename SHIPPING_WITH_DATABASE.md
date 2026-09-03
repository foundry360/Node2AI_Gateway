# Shipping Node2AI with PostgreSQL Database

## Yes - You Ship PostgreSQL! ✅

Node2AI **includes PostgreSQL** as part of the deployment. Customers don't need to provide their own database.

## What Gets Shipped

### Docker Deployment

```
docker-compose up -d
```

**Deploys**:

- ✅ PostgreSQL 15 with pgvector extension
- ✅ Redis 7 for caching
- ✅ API Gateway (Next.js)
- ✅ Web Dashboard (Next.js)
- ✅ Optional: Ollama for local LLMs

### Kubernetes Deployment

```
helm install node2ai ./helm-chart
```

**Deploys**:

- ✅ PostgreSQL StatefulSet (persistent)
- ✅ Redis Deployment
- ✅ API Gateway pods
- ✅ Web Dashboard pods
- ✅ Persistent storage (100GB by default)

## Customer Experience

### Before Node2AI

```
Customer's Infrastructure
├── Their existing apps
├── Their databases (MySQL/Oracle/etc)
└── Their infrastructure
```

### After Installing Node2AI

```
Customer's Infrastructure
├── Their existing apps
├── Their databases (MySQL/Oracle/etc)  ← UNCHANGED
│
└── Node2AI Stack (NEW)
    ├── PostgreSQL (Node2AI's database)
    ├── Redis (Node2AI's cache)
    ├── API Gateway
    └── Web Dashboard
```

## Key Benefits

### ✅ No Database Required

Customer doesn't need to:

- Set up a PostgreSQL server
- Configure database users
- Run migrations manually
- Install pgvector extension

### ✅ Automatic Setup

Everything configured automatically:

- Database initialized with schema
- Extensions installed (pgvector, pg_trgm, etc.)
- Default organization created
- User roles configured

### ✅ Isolated from Customer Data

- Node2AI's PostgreSQL is completely separate
- No access to customer's existing databases
- No migration needed
- Clean separation of concerns

### ✅ Full Feature Support

- ✅ Vector search (pgvector)
- ✅ RAG capabilities
- ✅ JSONB with indexing
- ✅ Row-level security
- ✅ All Node2AI features work

## Configuration Options

### Option A: Use Included Database (Recommended)

```env
# Use the included PostgreSQL
DATABASE_URL=postgresql://node2:password@postgres:5432/node2
```

**Deployment**: `docker-compose up -d`

### Option B: Use External PostgreSQL (Advanced)

```env
# Connect to customer's PostgreSQL
DATABASE_URL=postgresql://user:pass@customer-postgres:5432/node2
```

**Deployment**: Remove PostgreSQL service from docker-compose

### Option C: Hybrid (Option 3)

```env
# Node2AI uses its own PostgreSQL
DATABASE_URL=postgresql://node2:pass@postgres:5432/node2

# But also reads customer documents
CUSTOMER_DATABASE_URL=mysql://readonly:pass@customer-mysql:3306/docs
```

## Storage Requirements

### Minimum

- PostgreSQL: 10GB for database
- Redis: 1GB for cache
- Application: 2GB
- **Total: ~15GB**

### Recommended

- PostgreSQL: 50GB
- Redis: 5GB
- Application: 5GB
- **Total: ~60GB**

### Enterprise

- PostgreSQL: 200GB+ (with backups)
- Redis: 10GB
- Application: 10GB
- **Total: ~220GB**

## Resource Requirements

### Docker Deployment

```
CPU: 2 cores minimum, 4 recommended
Memory: 4GB minimum, 8GB recommended
Disk: 20GB minimum, 100GB recommended
```

### Kubernetes Deployment

```yaml
postgresql:
  resources:
    limits:
      cpu: 2000m # 2 cores
      memory: 4Gi # 4GB
    requests:
      cpu: 500m # 0.5 cores
      memory: 1Gi # 1GB
```

## Deployment Modes

### 1. Self-Hosted (Default)

```bash
docker-compose up -d
```

- PostgreSQL included ✅
- Full features ✅
- No external dependencies ✅

### 2. Kubernetes

```bash
helm install node2ai ./helm-chart
```

- PostgreSQL StatefulSet ✅
- Auto-scaling ✅
- Enterprise-grade ✅

### 3. Air-Gapped

```bash
docker-compose -f docker-compose.airgap.yml up -d
```

- PostgreSQL included ✅
- All containers local ✅
- No internet required ✅

## What's NOT Included

Customer still needs to provide:

- ❌ Docker or Kubernetes (infrastructure)
- ❌ Network access (if using external AI APIs)
- ❌ SSL certificates (optional)
- ❌ Backup storage (optional, we provide scripts)

## Migration Path

### From "No Database" to "Included PostgreSQL"

```
Nothing to do! It's already included.
```

### From "Included PostgreSQL" to "External PostgreSQL"

```bash
# 1. Connect to external PostgreSQL
export DATABASE_URL=postgresql://external:5432/node2

# 2. Run migrations
./scripts/migrate.sh

# 3. Restart with external DB
# (Remove postgres service from docker-compose)
docker-compose -f docker-compose.no-internal-db.yml up -d
```

## Comparison

| Approach                    | PostgreSQL Included? | Customer Setup | Flexibility |
| --------------------------- | -------------------- | -------------- | ----------- |
| **Your Current Setup**      | ✅ Yes               | Minimal        | Best        |
| Option 2 (Full Abstraction) | ❌ No                | Complex        | Limited     |
| Option 3 (Hybrid)           | ✅ Yes               | Medium         | Good        |
| External DB Required        | ❌ No                | Very Complex   | Worst       |

## Recommendation

**Keep shipping PostgreSQL! ✅**

Your current approach is **the best**:

- ✅ Simplest for customers
- ✅ Full feature support
- ✅ No dependencies
- ✅ Clean separation
- ✅ Easy to deploy

Don't change unless a specific customer requirement forces you to.

## Answer to Your Question

> "If you go the Postgres route are we shipping with a database?"

**YES!** You're already shipping PostgreSQL with your product. This is Option 1, and it's the **recommended default approach**.

Customers get:

1. Complete Node2AI stack
2. PostgreSQL with pgvector pre-configured
3. Redis for caching
4. Automatic initialization
5. Persistent data storage

No customer database required! 🎉
