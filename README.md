# Node2AI Enterprise Platform

A self-hosted AI orchestration platform with data sanitization for regulated industries (healthcare, finance, government).

> **⚠️ IMPORTANT**: This project is designed for **enterprise on-premises deployment** and should **NOT** be deployed to Vercel or other public cloud platforms. It requires Docker, Kubernetes, and enterprise infrastructure for proper operation.

## 🚀 Overview

Node2AI is a comprehensive enterprise platform designed for organizations that need to leverage AI capabilities while maintaining strict data privacy and compliance requirements. Built for regulated industries, it provides:

- **🔒 Data Sanitization**: Proprietary engine for PII, PHI, financial, and government data
- **🏥 Healthcare Compliance**: HIPAA-ready with built-in PHI protection
- **💰 Financial Security**: SOX compliance with audit trails
- **🏛️ Government Ready**: Air-gapped deployment for sensitive environments
- **⚡ High Performance**: Enterprise-scale processing with advanced caching and latency optimizations
- **📊 Compliance Reporting**: Automated GDPR, HIPAA, SOX compliance reports

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Node2AI Platform                        │
├─────────────────────────────────────────────────────────────┤
│  Web Dashboard (Next.js 14)  │  API Gateway (Next.js 14)  │
├─────────────────────────────────────────────────────────────┤
│              Data Sanitization Engine (Proprietary)       │
├─────────────────────────────────────────────────────────────┤
│  TypeScript SDK  │  Shared Libraries  │  Compliance Engine  │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL  │  Redis  │  AI Models  │  Audit Logs        │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Docker** 20.10+ with Docker Compose
- **Node.js** 18+ (for development)
- **8GB RAM** minimum (16GB recommended)
- **20GB storage** minimum (100GB recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/node2-ai/enterprise.git
cd enterprise

# Run automated installation
chmod +x scripts/install.sh
./scripts/install.sh
```

### Access the Platform

- **Web Dashboard**: http://localhost:3000
- **API Gateway**: http://localhost:3001
- **API Documentation**: http://localhost:3001/api/docs

**Default Credentials:**

- Email: `admin@node2.ai`
- Password: `admin123`

### Configure Authentication (Native PostgreSQL + JWT)

The platform now ships with native PostgreSQL authentication—Supabase credentials are no longer required anywhere in the stack.

1. Generate a JWT secret:

   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
   ```

2. Copy `apps/api/env.example` to `apps/api/.env.local` and update the following values:

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/node2ai_dev
   JWT_SECRET=<value-from-step-1>
   API_KEY_SECRET=dev-api-key
   PORT=3001
   NODE_ENV=production
   ```

3. Copy `apps/web/env.example` to `apps/web/.env.local` and set:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NODE_ENV=production
   PORT=3000
   ```

4. Remove any legacy Supabase variables (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`) from your environment, deployment manifests, and secret stores.

5. Restart both services after changing secrets.

## 📦 Project Structure

```
node2-enterprise/
├── apps/
│   ├── api/                    # Next.js 14 API Gateway
│   └── web/                    # Next.js 14 Admin Dashboard
├── packages/
│   ├── shared/                 # Shared types and utilities
│   ├── sdk/                    # TypeScript SDK
│   └── sanitization/           # Proprietary data sanitization engine
├── deployments/
│   ├── docker/                 # Docker deployment configs
│   └── kubernetes/             # Kubernetes/Helm charts
├── scripts/                    # Installation and maintenance scripts
├── models/                     # AI models for air-gapped deployment
└── docs/                       # Comprehensive documentation
```

## 🔧 Deployment Modes

### Cloud Deployment

For cloud-based deployments with external AI services:

```bash
export DEPLOYMENT_MODE=cloud
export OPENAI_API_KEY=your-openai-key
export ANTHROPIC_API_KEY=your-anthropic-key
```

### Self-Hosted Deployment

For on-premises deployment with local AI models:

```bash
export DEPLOYMENT_MODE=self-hosted
export LOCAL_MODEL_PATH=/models
export LOCAL_MODEL_TYPE=llama2
```

### Air-Gapped Deployment

For completely offline deployment:

```bash
export DEPLOYMENT_MODE=airgap
export AIRGAP_MODE=true
export OFFLINE_MODELS_PATH=/models/offline
```

## 🛡️ Security Features

### Data Protection

- **AES-256 Encryption**: Data at rest and in transit
- **Proprietary Sanitization**: Advanced PII/PHI detection
- **Access Controls**: Role-based permissions
- **Audit Logging**: Complete activity tracking

### Compliance Ready

- **GDPR**: Right to be forgotten, data portability
- **HIPAA**: PHI protection, breach notification
- **SOX**: Financial controls, audit trails
- **Government**: Air-gapped deployment support

### Security Monitoring

- **Real-time Alerts**: Security incident detection
- **Behavioral Analysis**: Anomaly detection
- **Threat Intelligence**: Automated threat response
- **Compliance Reporting**: Automated compliance reports

## 📊 Key Features

### Data Sanitization Engine

- **Multi-Category Detection**: PII, PHI, financial, government data
- **Proprietary Algorithms**: Advanced pattern recognition
- **High Performance**: 10,000+ characters per second
- **Custom Rules**: Industry-specific sanitization rules

### AI Model Management

- **Multiple Providers**: OpenAI, Anthropic, local models
- **Model Testing**: Built-in model testing interface
- **Performance Monitoring**: Real-time model metrics
- **Cost Optimization**: Usage tracking and optimization

### Compliance & Auditing

- **Automated Reports**: GDPR, HIPAA, SOX compliance
- **Audit Trails**: Complete activity logging
- **Risk Assessment**: Automated risk scoring
- **Incident Response**: Automated security response

### User Management

- **Role-Based Access**: Admin, Operator, Viewer, Auditor roles
- **Multi-Factor Authentication**: TOTP, SMS, hardware tokens
- **Single Sign-On**: SAML, OAuth2 integration
- **Audit Logging**: Complete user activity tracking

## 🚀 Getting Started

### 1. Installation

```bash
# Automated installation
./scripts/install.sh

# Manual installation
docker-compose up -d
```

### 2. Configuration

```bash
# Copy environment template
cp env.example .env

# Edit configuration
nano .env
```

### 3. Health Check

```bash
# Check system health
./scripts/health-check.sh

# View logs
docker-compose logs -f
```

### 4. First Steps

1. **Change default passwords**
2. **Configure your license key**
3. **Set up SSL certificates**
4. **Configure backup schedules**
5. **Test data sanitization**

## 📚 Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Complete installation instructions
- **[Configuration Guide](docs/CONFIGURATION.md)** - Configuration options and settings
- **[Security Guide](docs/SECURITY.md)** - Security best practices and compliance
- **[API Reference](docs/API-REFERENCE.md)** - Complete API documentation
- **[Docker Deployment](deployments/docker/README.md)** - Docker deployment guide
- **[Kubernetes Deployment](deployments/kubernetes/README.md)** - Kubernetes deployment guide

## 🔧 Development

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker 20.10+

### Setup

```bash
# Install dependencies
pnpm install

# Build packages
pnpm run build

# Start development servers
pnpm run dev
```

### Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run linting
pnpm lint
```

## 🚀 Deployment

### Docker Deployment

```bash
# Standard deployment
docker-compose up -d

# Production deployment
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Air-gapped deployment
docker-compose -f docker-compose.yml -f docker-compose.airgap.yml up -d
```

### Kubernetes Deployment

```bash
# Install Helm chart
helm install supernova ./deployments/kubernetes/helm-chart \
  --set license.key=your-license-key \
  --set postgresql.auth.password=your-password \
  --set redis.auth.password=your-redis-password
```

## 🔒 Security

### Security Features

- **Multi-Factor Authentication**: TOTP, SMS, hardware tokens
- **Role-Based Access Control**: Granular permissions
- **Data Encryption**: AES-256 encryption everywhere
- **Audit Logging**: Complete activity tracking
- **Compliance**: GDPR, HIPAA, SOX ready

### Security Best Practices

1. **Use strong passwords** for all services
2. **Enable SSL/TLS** for all connections
3. **Regularly rotate secrets** and keys
4. **Monitor security events** continuously
5. **Keep software updated** regularly

## 📊 Monitoring

### Health Checks

```bash
# Check system health
./scripts/health-check.sh

# View service status
docker-compose ps

# Check logs
docker-compose logs -f
```

### Metrics

- **API Metrics**: Request rates, response times, error rates
- **Sanitization Metrics**: Processing rates, rule effectiveness
- **Compliance Metrics**: Audit events, compliance scores
- **System Metrics**: CPU, memory, disk usage

## 🔄 Backup & Recovery

### Backup

```bash
# Create backup
./scripts/backup.sh backup

# List backups
./scripts/backup.sh list

# Restore from backup
./scripts/backup.sh restore backup_file.tar.gz
```

### Recovery

```bash
# Database recovery
docker-compose exec postgres psql -U supernova supernova < backup.sql

# Full system recovery
./scripts/backup.sh restore latest_backup.tar.gz
```

## 🆙 Upgrades

### Upgrade Process

```bash
# Upgrade to new version
./scripts/upgrade.sh 1.1.0

# Check upgrade status
./scripts/health-check.sh

# Rollback if needed
./scripts/upgrade.sh rollback
```

## 🤝 Support

### Getting Help

1. **Documentation**: Check the comprehensive docs
2. **Health Check**: Run `./scripts/health-check.sh`
3. **Logs**: Check service logs for errors
4. **Community**: Join our community forum
5. **Support**: Contact SupernovaAI support

### Useful Commands

```bash
# Health check
./scripts/health-check.sh

# Backup
./scripts/backup.sh backup

# Upgrade
./scripts/upgrade.sh 1.1.0

# View logs
docker-compose logs -f

# Restart services
docker-compose restart
```

## 📄 License

Proprietary - Node2AI Enterprise License

## 🏢 Enterprise

Node2AI is designed for enterprise use with:

- **24/7 Support**: Enterprise support available
- **Custom Deployment**: On-premises and cloud options
- **Compliance**: GDPR, HIPAA, SOX compliance
- **Security**: Enterprise-grade security features
- **Scalability**: Handles enterprise workloads

## 🔗 Links

- **Website**: https://node2.ai
- **Documentation**: https://docs.node2.ai
- **Support**: https://support.node2.ai
- **Community**: https://community.node2.ai
- **GitHub**: https://github.com/node2-ai/enterprise

---

**Node2AI Enterprise Platform** - Secure AI orchestration for regulated industries.

_Last updated: November 2024_
