# Node2AI Installation Guide

## Overview

Node2AI is an enterprise-grade AI orchestration platform that provides secure, scalable, and intelligent routing across multiple AI providers. This guide covers the complete installation process for production, development, and enterprise environments.

**What this guide covers:**

- System requirements and prerequisites
- Multiple installation methods (Docker, Manual, Kubernetes)
- Environment configuration and security setup
- Initial setup and verification
- Troubleshooting and maintenance

**Estimated installation time:** 30-45 minutes  
**Support contact:** support@foundry360.com

## Prerequisites

### System Requirements

| Component          | Minimum                                                         | Recommended      |
| ------------------ | --------------------------------------------------------------- | ---------------- |
| **OS**             | Linux (Ubuntu 20.04+), RHEL 8+, macOS 12+, Windows 11 with WSL2 | Ubuntu 22.04 LTS |
| **RAM**            | 4GB                                                             | 8GB+             |
| **Disk Space**     | 20GB                                                            | 50GB+            |
| **CPU**            | 2 cores                                                         | 4+ cores         |
| **Docker**         | 20.10+                                                          | Latest stable    |
| **Docker Compose** | 2.0+                                                            | Latest stable    |
| **Node.js**        | 18+                                                             | 20+ LTS          |
| **pnpm**           | 8+                                                              | Latest           |
| **PostgreSQL**     | 14+                                                             | 15+              |

### Required Accounts

- **AI Provider Account(s)**: At least one of the following:
  - [OpenAI API](https://platform.openai.com/api-keys) - GPT-4, GPT-3.5
  - [Anthropic API](https://console.anthropic.com/) - Claude-3 models
  - [Google AI Studio](https://aistudio.google.com/) - Gemini models
  - [Perplexity API](https://www.perplexity.ai/settings/api) - Llama models
- **Email Service** (optional): For notifications and alerts

### Network Requirements

- **Internet Access**: Required for AI API calls and updates
- **Ports**:
  - `3000` - Web dashboard
  - `3001` - API server
  - `5432` - PostgreSQL database
  - `6379` - Redis cache (optional)

## Installation Methods

### Method 1: Docker Compose (Recommended for Production)

> **💡 Best for:** Production deployments, easy maintenance, consistent environments

```bash
# 1. Clone repository
git clone https://github.com/foundry360/node2ai.git
cd node2ai

# 2. Copy environment template
cp env.example .env

# 3. Generate secure keys
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "PROVIDER_KEY_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "SESSION_SECRET=$(openssl rand -base64 32)" >> .env

# 4. Edit configuration
nano .env

# 5. Start all services
docker-compose -f deployments/docker/docker-compose.yml up -d

# 6. Wait for database initialization (30 seconds)
sleep 30

# 7. Initialize database and seed data
docker-compose -f deployments/docker/docker-compose.yml exec api pnpm run seed

# 8. Verify installation
curl http://localhost:3001/api/health
```

**Expected output:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "database": "connected",
  "redis": "connected"
}
```

### Method 2: Manual Installation (Development)

> **💡 Best for:** Development, customization, debugging

```bash
# 1. Clone and install dependencies
git clone https://github.com/foundry360/node2ai.git
cd node2ai
pnpm install

# 2. Setup PostgreSQL database
sudo -u postgres psql
CREATE DATABASE node2ai;
CREATE USER node2ai WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE node2ai TO node2ai;
\q

# 3. Configure environment
cp env.example .env
nano .env  # Edit with your settings

# 4. Run database migrations
cd apps/api
pnpm exec prisma migrate deploy
pnpm exec prisma generate

# 5. Seed initial data
cd ../..
pnpm run seed

# 6. Start API server (Terminal 1)
cd apps/api
pnpm run dev

# 7. Start web application (Terminal 2)
cd apps/web
pnpm run dev
```

### Method 3: Kubernetes Deployment (Enterprise)

> **💡 Best for:** Enterprise deployments, high availability, auto-scaling

```bash
# Prerequisites: kubectl configured, cluster ready

# 1. Create namespace
kubectl create namespace node2ai

# 2. Create secrets
kubectl create secret generic node2ai-secrets \
  --from-literal=database-url='postgresql://node2ai:password@postgres:5432/node2ai' \
  --from-literal=jwt-secret='your-jwt-secret' \
  --from-literal=encryption-key='your-encryption-key' \
  -n node2ai

# 3. Deploy services
kubectl apply -f deployments/kubernetes/

# 4. Check deployment status
kubectl get pods -n node2ai

# 5. Get service URL
kubectl get svc node2ai-web -n node2ai
```

## Environment Configuration

### Complete .env Configuration

```env
# ============================================
# Node2AI Configuration
# ============================================
NODE_ENV=production
APP_NAME=Node2AI
APP_VERSION=1.0.0

# ============================================
# Database Configuration
# ============================================
DATABASE_URL=postgresql://node2ai:password@localhost:5432/node2ai
DATABASE_POOL_SIZE=20
DATABASE_SSL=false  # Set to true in production
DATABASE_TIMEOUT=30000

# ============================================
# Application URLs
# ============================================
API_URL=http://localhost:3001
WEB_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# ============================================
# Security (CRITICAL - Generate unique values)
# ============================================
JWT_SECRET=your-secure-jwt-secret-min-32-chars
JWT_EXPIRES_IN=24h
PROVIDER_KEY_ENCRYPTION_KEY=your-32-character-hex-encryption-key
SESSION_SECRET=your-session-secret
API_KEY_SECRET=your-api-key-secret

# ============================================
# Redis Configuration (Optional)
# ============================================
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_TLS=false
REDIS_DB=0

# ============================================
# Email Configuration (Optional)
# ============================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@node2ai.com
EMAIL_TEMPLATES_PATH=./templates

# ============================================
# Feature Flags
# ============================================
ENABLE_ANALYTICS=true
ENABLE_AUDIT_LOGGING=true
ENABLE_RATE_LIMITING=true
ENABLE_SANITIZATION=true
ENABLE_MONITORING=true

# ============================================
# Rate Limiting
# ============================================
RATE_LIMIT_WINDOW=60000  # 1 minute in milliseconds
RATE_LIMIT_MAX=100       # Max requests per window
RATE_LIMIT_SKIP_SUCCESS=false

# ============================================
# Monitoring & Logging
# ============================================
SENTRY_DSN=
LOG_LEVEL=info  # debug, info, warn, error
ENABLE_REQUEST_LOGGING=true
LOG_FORMAT=json  # json, pretty

# ============================================
# AI Provider Defaults
# ============================================
DEFAULT_PROVIDER=openai
DEFAULT_MODEL=gpt-3.5-turbo
MAX_TOKENS=1000
TEMPERATURE=0.7

# ============================================
# Security Headers
# ============================================
HELMET_ENABLED=true
CSP_ENABLED=true
HSTS_ENABLED=true

# ============================================
# Backup Configuration
# ============================================
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM
BACKUP_RETENTION_DAYS=30
BACKUP_STORAGE_PATH=/backups
```

### Key Generation Commands

```bash
# Generate JWT secret (32+ characters)
openssl rand -base64 32
# Example: 7xK9mP2nQ5rS8tU1vW3xY6zA0bC4dE7fG

# Generate encryption key (exactly 32 hex characters)
openssl rand -hex 32
# Example: a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456

# Generate session secret
openssl rand -base64 32

# Generate API key secret
openssl rand -base64 32
```

## Step-by-Step Initial Setup

### Step 1: Generate Secure Keys

> **⚠️ Security Warning:** Never use default keys in production!

```bash
# Generate all required keys
echo "# Node2AI Security Keys" > .env
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "PROVIDER_KEY_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "SESSION_SECRET=$(openssl rand -base64 32)" >> .env
echo "API_KEY_SECRET=$(openssl rand -base64 32)" >> .env

# Verify key lengths
echo "JWT_SECRET length: $(grep JWT_SECRET .env | cut -d'=' -f2 | wc -c)"
echo "Encryption key length: $(grep PROVIDER_KEY_ENCRYPTION_KEY .env | cut -d'=' -f2 | wc -c)"
```

### Step 2: Configure Database

**For Docker installation (automatic):**

```bash
# Database is created automatically with Docker Compose
# No manual configuration needed
```

**For manual installation:**

```bash
# Create database and user
sudo -u postgres psql
CREATE DATABASE node2ai;
CREATE USER node2ai WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE node2ai TO node2ai;
ALTER USER node2ai CREATEDB;  # For migrations
\q

# Test connection
psql -h localhost -U node2ai -d node2ai -c "SELECT version();"
```

### Step 3: Initialize Database

```bash
# Run migrations and seed data
pnpm run seed

# Verify tables were created
psql -d node2ai -c "\dt"
# Expected output: 11 tables including users, organizations, api_keys, etc.

# Check seeded data
psql -d node2ai -c "SELECT email, role FROM users;"
# Expected: 4 users including admin@node2ai.ai
```

### Step 4: Verify Services

```bash
# Check API health
curl http://localhost:3001/api/health
# Expected: {"status":"healthy","timestamp":"..."}

# Check web application
curl -I http://localhost:3000
# Expected: HTTP/1.1 200 OK

# Test database connection
psql -d node2ai -c "SELECT COUNT(*) FROM users;"
# Expected: count = 4 (default users)

# Test Redis connection (if enabled)
redis-cli ping
# Expected: PONG
```

### Step 5: First Login

1. **Open browser:** http://localhost:3000
2. **Login with default admin credentials:**
   - Email: `admin@node2ai.ai`
   - Password: `admin123`
3. **⚠️ CRITICAL:** Change password immediately
   - Navigate to Settings → Profile → Change Password
   - Use a strong password (12+ characters, mixed case, numbers, symbols)

### Step 6: Add Provider API Keys

1. **Navigate to:** Settings → Provider Keys
2. **Click:** "Add Provider Key"
3. **Select provider:** OpenAI, Anthropic, Google, or Perplexity
4. **Enter API key:** Your provider API key
5. **Click:** "Test Connection" to verify
6. **Save:** When test succeeds

## Post-Installation Configuration

### Security Checklist

- [ ] ✅ Change all default passwords
- [ ] ✅ Add provider API keys
- [ ] ✅ Configure email notifications
- [ ] ✅ Set up monitoring (optional)
- [ ] ✅ Configure backup schedules
- [ ] ✅ Review rate limits
- [ ] ✅ Configure custom domain (production)
- [ ] ✅ Enable SSL/TLS certificates
- [ ] ✅ Set up log aggregation
- [ ] ✅ Create additional user accounts

### Production Configuration

```bash
# 1. Enable SSL/TLS
# Add to .env:
DATABASE_SSL=true
REDIS_TLS=true

# 2. Configure monitoring
# Add to .env:
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=warn
ENABLE_REQUEST_LOGGING=true

# 3. Set up backups
# Add to crontab:
0 2 * * * /usr/bin/pg_dump node2ai > /backup/node2ai-$(date +\%Y\%m\%d).sql

# 4. Configure reverse proxy (Nginx)
# See: docs/NGINX-CONFIGURATION.md
```

## Verification & Testing

### Automated Testing

```bash
# Test authentication system
pnpm run test:auth
# Expected: All tests pass ✅

# Test provider key management
pnpm run test:provider-keys
# Expected: All tests pass ✅

# Run full installation verification
./scripts/test-installation.sh
# Expected: Comprehensive report with all ✅

# Test API endpoints
curl -X POST http://localhost:3001/api/v1/chat \
  -H "Authorization: Bearer $(cat jwt-token.txt)" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, this is a test!",
    "provider": "openai",
    "model": "gpt-4"
  }'
```

### Manual Verification

```bash
# 1. Check all services are running
docker-compose ps
# All services should show "Up"

# 2. Verify database connectivity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
# Should return: count = 4

# 3. Test API authentication
curl -H "X-API-Key: test-api-key-123" http://localhost:3001/api/health
# Should return: {"status":"healthy"}

# 4. Test web dashboard
curl -I http://localhost:3000
# Should return: HTTP/1.1 200 OK
```

## Troubleshooting Common Issues

### Issue: Database Connection Fails

**Symptoms:** API won't start, "database connection error"  
**Causes:** Wrong DATABASE_URL, PostgreSQL not running, network issues

**Solutions:**

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Verify DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://username:password@host:port/database

# Test connection manually
psql $DATABASE_URL -c "SELECT 1"

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log

# Common fixes:
# 1. Start PostgreSQL: sudo systemctl start postgresql
# 2. Check credentials: verify username/password
# 3. Check network: ensure host is reachable
# 4. Check database exists: CREATE DATABASE node2ai;
```

### Issue: Docker Containers Won't Start

**Symptoms:** `docker-compose up` fails, containers exit immediately  
**Causes:** Port conflicts, insufficient resources, Docker daemon issues

**Solutions:**

```bash
# Check Docker daemon
sudo systemctl status docker

# Check port availability
sudo lsof -i :3000
sudo lsof -i :3001
sudo lsof -i :5432

# Check Docker logs
docker-compose logs api
docker-compose logs web
docker-compose logs postgres

# Restart Docker
sudo systemctl restart docker

# Common fixes:
# 1. Kill processes using ports: sudo kill -9 $(lsof -ti:3000)
# 2. Increase Docker memory: Docker Desktop → Settings → Resources
# 3. Check .env file: ensure all required variables are set
# 4. Rebuild images: docker-compose build --no-cache
```

### Issue: Authentication Fails After Login

**Symptoms:** Login succeeds but redirected back to login page  
**Causes:** JWT_SECRET not set, cookie issues, CORS misconfiguration

**Solutions:**

```bash
# Verify JWT_SECRET is set
echo $JWT_SECRET
# Should be 32+ characters

# Check CORS configuration
grep CORS_ORIGINS .env
# Should include your domain

# Clear browser cookies
# Open DevTools → Application → Cookies → Clear All

# Check API logs for errors
docker-compose logs api | grep -i error

# Common fixes:
# 1. Regenerate JWT_SECRET: openssl rand -base64 32
# 2. Update CORS_ORIGINS: add your domain
# 3. Clear browser cache and cookies
# 4. Restart API service: docker-compose restart api
```

### Issue: Provider Keys Won't Save

**Symptoms:** "Encryption error" when adding provider keys  
**Causes:** PROVIDER_KEY_ENCRYPTION_KEY not set or wrong format

**Solutions:**

```bash
# Verify encryption key is exactly 32 hex characters
echo $PROVIDER_KEY_ENCRYPTION_KEY | wc -c
# Should output: 65 (64 chars + newline)

# Check key format
echo $PROVIDER_KEY_ENCRYPTION_KEY | grep -E '^[a-fA-F0-9]{64}$'
# Should return the key if valid

# Regenerate if needed
openssl rand -hex 32

# Update .env and restart
docker-compose restart api

# Common fixes:
# 1. Regenerate key: openssl rand -hex 32
# 2. Update .env file: PROVIDER_KEY_ENCRYPTION_KEY=...
# 3. Restart services: docker-compose restart
# 4. Check key format: must be 64 hex characters
```

### Issue: Web Application Shows 502 Bad Gateway

**Symptoms:** Web loads but API calls fail with 502  
**Causes:** API not running, wrong API_URL, network issues

**Solutions:**

```bash
# Check API is running
curl http://localhost:3001/api/health

# Verify API_URL in .env
grep API_URL .env
# Should match your API server URL

# Check API container logs
docker-compose logs api

# Restart API service
docker-compose restart api

# Common fixes:
# 1. Start API service: docker-compose up api -d
# 2. Check API_URL: ensure it matches running API
# 3. Check network: ensure containers can communicate
# 4. Check resources: ensure sufficient memory/CPU
```

### Issue: High Memory Usage

**Symptoms:** System slow, OOM errors  
**Causes:** Database queries, memory leaks, insufficient resources

**Solutions:**

```bash
# Check memory usage
docker stats

# Adjust connection pool
# In .env: DATABASE_POOL_SIZE=10

# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory

# Enable query logging to find slow queries
# LOG_LEVEL=debug

# Common fixes:
# 1. Reduce connection pool: DATABASE_POOL_SIZE=5
# 2. Increase Docker memory: 8GB+ recommended
# 3. Optimize queries: check slow query log
# 4. Restart services: docker-compose restart
```

## Upgrading Node2AI

### Backup Before Upgrade

```bash
# 1. Backup database
pg_dump node2ai > backup-$(date +%Y%m%d).sql

# 2. Backup configuration
cp .env .env.backup

# 3. Backup encryption keys (SECURE STORAGE)
echo $PROVIDER_KEY_ENCRYPTION_KEY > encryption-key-backup.txt
chmod 600 encryption-key-backup.txt
```

### Upgrade Process

```bash
# 1. Pull latest changes
git fetch origin
git checkout main
git pull origin main

# 2. Update dependencies
pnpm install

# 3. Run database migrations
cd apps/api
pnpm exec prisma migrate deploy

# 4. Rebuild and restart (Docker)
docker-compose down
docker-compose build
docker-compose up -d

# 5. Verify upgrade
curl http://localhost:3001/api/health
./scripts/test-installation.sh
```

## Backup & Restore

### Automated Backup

```bash
# Daily database backup (cron)
0 2 * * * /usr/bin/pg_dump node2ai > /backup/node2ai-$(date +\%Y\%m\%d).sql

# Weekly configuration backup
0 3 * * 0 cp .env /backup/env-$(date +\%Y\%m\%d).backup

# Monthly full backup
0 4 1 * * tar -czf /backup/node2ai-full-$(date +\%Y\%m).tar.gz /opt/node2ai
```

### Manual Backup

```bash
# Database backup
pg_dump node2ai > node2ai-backup-$(date +%Y%m%d-%H%M%S).sql

# Backup encryption keys (SECURE STORAGE ONLY)
echo $PROVIDER_KEY_ENCRYPTION_KEY > encryption-key-backup.txt
chmod 600 encryption-key-backup.txt

# Backup .env file
cp .env .env.backup

# Backup application files
tar -czf node2ai-app-$(date +%Y%m%d).tar.gz --exclude=node_modules .
```

### Restore Process

```bash
# 1. Stop services
docker-compose down

# 2. Restore database
psql node2ai < node2ai-backup-20240101.sql

# 3. Restore .env
cp .env.backup .env

# 4. Start services
docker-compose up -d

# 5. Verify
./scripts/test-installation.sh
```

## Uninstallation

### Complete Removal

```bash
# 1. Stop all services
docker-compose down

# 2. Remove volumes (WARNING: Deletes all data)
docker-compose down -v

# 3. Remove Docker images
docker rmi node2ai-api node2ai-web

# 4. Remove application files
cd ..
rm -rf node2ai

# 5. Drop database (if manual installation)
sudo -u postgres psql
DROP DATABASE node2ai;
DROP USER node2ai;
\q

# 6. Remove systemd services (if installed)
sudo systemctl stop node2ai
sudo systemctl disable node2ai
sudo rm /etc/systemd/system/node2ai.service
```

### Partial Removal (Keep Data)

```bash
# 1. Stop services
docker-compose down

# 2. Backup data
pg_dump node2ai > final-backup.sql

# 3. Remove application
rm -rf /opt/node2ai

# 4. Keep database for future use
# Database remains in PostgreSQL
```

## Next Steps

### Immediate Actions

1. **Read [Provider Keys Guide](./PROVIDER-KEYS.md)** to add AI provider API keys
2. **Review [API Documentation](./API.md)** for integration
3. **Study [Security Best Practices](./SECURITY.md)** for production deployment
4. **Check [FAQ](./FAQ.md)** for common questions

### Production Readiness

1. **Configure SSL/TLS certificates**
2. **Set up monitoring and alerting**
3. **Configure automated backups**
4. **Review security settings**
5. **Set up log aggregation**
6. **Configure custom domain**

### Community & Support

- 📖 **Documentation:** https://docs.foundry360.com/node2ai
- 🐛 **GitHub Issues:** https://github.com/foundry360/node2ai/issues
- 💬 **Community Forum:** https://community.foundry360.com
- 📧 **Email Support:** support@foundry360.com
- 🔐 **Security Issues:** security@foundry360.com

---

## Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Dashboard]
        API_CLIENT[API Clients]
        MOBILE[Mobile Apps]
    end

    subgraph "Application Layer"
        NGINX[Nginx Reverse Proxy]
        API[Node2AI API]
        WEB_APP[Web Application]
    end

    subgraph "Data Layer"
        POSTGRES[(PostgreSQL)]
        REDIS[(Redis Cache)]
        FILES[File Storage]
    end

    subgraph "AI Providers"
        OPENAI[OpenAI]
        ANTHROPIC[Anthropic]
        GOOGLE[Google AI]
        PERPLEXITY[Perplexity]
    end

    WEB --> NGINX
    API_CLIENT --> NGINX
    MOBILE --> NGINX

    NGINX --> API
    NGINX --> WEB_APP

    API --> POSTGRES
    API --> REDIS
    API --> FILES

    API --> OPENAI
    API --> ANTHROPIC
    API --> GOOGLE
    API --> PERPLEXITY
```

## Network Topology

```mermaid
graph LR
    subgraph "Internet"
        USERS[Users]
        AI_PROVIDERS[AI Providers]
    end

    subgraph "DMZ"
        LB[Load Balancer]
        NGINX[Nginx]
    end

    subgraph "Application Tier"
        API1[API Server 1]
        API2[API Server 2]
        WEB1[Web Server 1]
        WEB2[Web Server 2]
    end

    subgraph "Data Tier"
        POSTGRES_PRIMARY[(PostgreSQL Primary)]
        POSTGRES_REPLICA[(PostgreSQL Replica)]
        REDIS_CLUSTER[(Redis Cluster)]
    end

    USERS --> LB
    LB --> NGINX
    NGINX --> API1
    NGINX --> API2
    NGINX --> WEB1
    NGINX --> WEB2

    API1 --> POSTGRES_PRIMARY
    API2 --> POSTGRES_REPLICA
    API1 --> REDIS_CLUSTER
    API2 --> REDIS_CLUSTER

    API1 --> AI_PROVIDERS
    API2 --> AI_PROVIDERS
```

## Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as Web Dashboard
    participant A as API Server
    participant D as Database
    participant P as AI Provider

    U->>W: Login Request
    W->>A: Authenticate
    A->>D: Validate Credentials
    D-->>A: User Data
    A-->>W: JWT Token
    W-->>U: Dashboard Access

    U->>W: Send Chat Message
    W->>A: API Request + JWT
    A->>D: Log Request
    A->>P: Forward to AI Provider
    P-->>A: AI Response
    A->>D: Log Response
    A-->>W: Formatted Response
    W-->>U: Display Response
```

---

**🎉 Congratulations!** You have successfully installed Node2AI. The platform is now ready for configuration and use.
