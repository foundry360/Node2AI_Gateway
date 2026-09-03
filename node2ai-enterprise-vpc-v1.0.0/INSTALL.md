# Node2AI Enterprise Installation Guide

Complete step-by-step installation instructions for Node2AI Enterprise.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Methods](#installation-methods)
3. [Post-Installation](#post-installation)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Minimum Requirements:**

- CPU: 2 cores
- RAM: 4GB
- Disk: 20GB free space
- Network: Internet access (or configured for air-gapped)

**Recommended Requirements:**

- CPU: 4+ cores
- RAM: 8GB+
- Disk: 50GB+ SSD
- Network: 100Mbps+ connection

### Software Requirements

**For Docker Deployment:**

- Docker 20.10+
- Docker Compose 2.0+
- 4GB+ available RAM

**For Kubernetes Deployment:**

- Kubernetes 1.24+
- kubectl configured
- 8GB+ available RAM

**For Standalone Deployment:**

- Node.js 18+
- PostgreSQL 14+
- Redis 7+ (optional)
- pnpm 8+

### Operating Systems

**Supported:**

- Ubuntu 20.04+ / 22.04+
- RHEL 8+ / CentOS 8+
- Debian 11+
- macOS 10.15+ (for development)
- Windows 10/11 (with WSL2 for Docker)

## Installation Methods

### Method 1: Docker Deployment (Recommended)

**Time**: ~15 minutes  
**Difficulty**: Easy

#### Step 1: Extract Package

```bash
tar -xzf node2ai-enterprise-v1.0.0.tar.gz
cd node2ai-enterprise-v1.0.0
```

#### Step 2: Configure Environment

```bash
cd docker
cp ../config/.env.example .env
nano .env  # or use your preferred editor
```

**Required Configuration:**

```bash
# Database
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_USER=node2ai
POSTGRES_DB=node2ai

# Redis
REDIS_PASSWORD=your-redis-password-here

# Security
JWT_SECRET=generate-random-secret-here
ENCRYPTION_KEY=generate-random-key-here
API_KEY_SECRET=generate-random-secret-here

# License
LICENSE_KEY=your-license-key-here
LICENSE_TIER=enterprise

# AI Providers (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
PERPLEXITY_API_KEY=...
```

#### Step 3: Generate Secrets

```bash
# Use the provided script
../scripts/utils/generate-secrets.sh > .env.secrets
cat .env.secrets >> .env
```

#### Step 4: Start Services

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

#### Step 5: Verify Installation

```bash
# Check API health
curl http://localhost:3001/api/health

# Check web dashboard
curl http://localhost:3000
```

### Method 2: Kubernetes Deployment

**Time**: ~30 minutes  
**Difficulty**: Intermediate

#### Step 1: Extract Package

```bash
tar -xzf node2ai-enterprise-v1.0.0.tar.gz
cd node2ai-enterprise-v1.0.0/kubernetes
```

#### Step 2: Create Namespace

```bash
kubectl apply -f namespace.yaml
```

#### Step 3: Configure Secrets

```bash
# Edit secrets-template.yaml
cp secrets-template.yaml secrets.yaml
nano secrets.yaml

# Create secrets
kubectl create secret generic node2ai-secrets \
  --from-file=secrets.yaml \
  -n node2ai
```

#### Step 4: Deploy Application

```bash
# Apply all manifests
kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
```

#### Step 5: Verify Deployment

```bash
# Check pods
kubectl get pods -n node2ai

# Check services
kubectl get svc -n node2ai

# Check logs
kubectl logs -f deployment/node2ai-api -n node2ai
```

See [kubernetes/README.md](kubernetes/README.md) for detailed instructions.

### Method 3: Standalone Deployment

**Time**: ~45 minutes  
**Difficulty**: Advanced

#### Step 1: Extract Package

```bash
tar -xzf node2ai-enterprise-v1.0.0.tar.gz
cd node2ai-enterprise-v1.0.0/standalone
```

#### Step 2: Run Installation Script

```bash
chmod +x install.sh
./install.sh
```

The script will:

1. Check prerequisites
2. Prompt for configuration
3. Set up database
4. Install application
5. Configure systemd service
6. Start services

#### Step 3: Manual Configuration (if needed)

```bash
# Edit configuration
nano node2ai-server/.env

# Run database migrations
cd node2ai-server
pnpm run db:migrate
```

See [standalone/README.md](standalone/README.md) for detailed instructions.

## Post-Installation

### Initial Setup

1. **Access Web Dashboard**
   - Open browser: `http://localhost:3000` (or your configured domain)
   - Create admin account

2. **Configure AI Providers**
   - Navigate to Settings → AI Providers
   - Add API keys for OpenAI, Anthropic, Google, or Perplexity

3. **Set Up License**
   - Go to Settings → License
   - Enter your license key
   - Verify license status

4. **Configure Data Sanitization**
   - Navigate to Settings → Data Sanitization
   - Enable PII/PHI detection
   - Configure sanitization rules

### Desktop Admin Control Center

1. **Install Desktop App**

   ```bash
   cd desktop-admin/installers
   # Windows: Run Node2AI-Admin-Setup-1.0.0.exe
   # macOS: Open Node2AI-Admin-1.0.0.dmg
   # Linux: Install .deb or .rpm package
   ```

2. **Connect to Instance**
   - Launch Desktop Admin app
   - Add connection profile
   - Enter instance URL and credentials
   - Test connection

## Verification

### Health Checks

```bash
# API health
curl http://localhost:3001/api/health

# Expected response:
# {"status":"ok","version":"1.0.0","timestamp":"..."}

# Database connectivity
docker-compose exec postgres pg_isready -U node2ai

# Redis connectivity
docker-compose exec redis redis-cli ping
```

### Smoke Tests

```bash
cd tests
./smoke-tests.sh
```

### Access Verification

1. **Web Dashboard**: `http://localhost:3000`
2. **API Documentation**: `http://localhost:3001/api/docs`
3. **Health Endpoint**: `http://localhost:3001/api/health`

## Troubleshooting

### Common Issues

**Services won't start:**

```bash
# Check logs
docker-compose logs

# Check port availability
netstat -tuln | grep -E '3000|3001|5432|6379'

# Verify environment variables
docker-compose config
```

**Database connection errors:**

```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U node2ai -d node2ai

# Check credentials in .env
grep POSTGRES docker/.env
```

**High memory usage:**

```bash
# Monitor resources
docker stats

# Adjust limits in docker-compose.prod.yml
# Restart services
docker-compose restart
```

### Getting Help

1. Check [docs/troubleshooting.md](docs/troubleshooting.md)
2. Review logs: `docker-compose logs -f`
3. Contact support: See [support/contact-support.md](support/contact-support.md)

## Next Steps

- [Configuration Guide](CONFIGURATION.md)
- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Desktop Admin Guide](docs/desktop-admin/installation-guide.md)
