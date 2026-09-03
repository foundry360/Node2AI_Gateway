# Node2AI Enterprise Packaging Guide

## Overview

This guide covers how to package and distribute Node2AI Enterprise Edition for enterprise customers.

## Package Contents

### Docker Package

- Pre-built Docker images for all components
- Docker Compose configuration for easy deployment
- Environment configuration templates
- Installation and utility scripts
- Complete documentation

### Kubernetes Package

- Kubernetes manifests for all components
- RBAC configuration
- Network policies
- Monitoring and observability setup
- Helm charts (optional)

## Building Enterprise Packages

### 1. Docker Package

```bash
# Build the enterprise package
./scripts/package-enterprise.sh 1.0.0

# This creates:
# - dist/enterprise/node2ai-enterprise-v1.0.0/
# - dist/enterprise/node2ai-enterprise-v1.0.0-20240115-143022.tar.gz
```

### 2. Kubernetes Package

```bash
# The Kubernetes manifests are already included in the package
# They are located in deployments/kubernetes/enterprise/
```

## Package Structure

```
node2ai-enterprise-v1.0.0/
├── docker-images/           # Pre-built Docker images
│   ├── node2ai-api-1.0.0.tar.gz
│   ├── node2ai-web-1.0.0.tar.gz
│   ├── postgres-14-alpine.tar.gz
│   └── redis-7-alpine.tar.gz
├── deployments/
│   ├── docker/             # Docker Compose deployment
│   │   ├── docker-compose.enterprise.yml
│   │   ├── init-db.sql
│   │   └── init-extensions.sql
│   └── kubernetes/         # Kubernetes manifests
│       └── enterprise/
│           ├── namespace.yaml
│           ├── configmap.yaml
│           ├── secrets.yaml
│           ├── deployment.yaml
│           ├── service.yaml
│           ├── ingress.yaml
│           ├── rbac.yaml
│           ├── database.yaml
│           └── monitoring.yaml
├── scripts/
│   ├── install.sh          # Docker installation script
│   ├── install-enterprise-k8s.sh  # Kubernetes installation script
│   ├── backup.sh           # Backup script
│   ├── restore.sh          # Restore script
│   └── health-check.sh     # Health check script
├── docs/                   # Complete documentation
│   ├── INSTALLATION.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── PROVIDER-KEYS.md
│   ├── FAQ.md
│   └── QUICKSTART.md
├── env.example             # Environment configuration template
├── env.enterprise.example  # Enterprise environment template
├── checksums.txt           # File integrity verification
└── README.md               # Package README
```

## Installation Methods

### 1. Docker Compose (Recommended for most enterprises)

```bash
# Extract package
tar -xzf node2ai-enterprise-v1.0.0-20240115-143022.tar.gz
cd node2ai-enterprise-v1.0.0

# Configure environment
cp env.enterprise.example .env
# Edit .env with your configuration

# Load Docker images
docker load < docker-images/node2ai-api-1.0.0.tar.gz
docker load < docker-images/node2ai-web-1.0.0.tar.gz
docker load < docker-images/postgres-14-alpine.tar.gz
docker load < docker-images/redis-7-alpine.tar.gz

# Install and start
./scripts/install.sh
```

### 2. Kubernetes (Recommended for large enterprises)

```bash
# Extract package
tar -xzf node2ai-enterprise-v1.0.0-20240115-143022.tar.gz
cd node2ai-enterprise-v1.0.0

# Configure secrets
# Edit deployments/kubernetes/enterprise/secrets.yaml with your values

# Install
./scripts/install-enterprise-k8s.sh
```

## Enterprise Features

### Security

- JWT and API key authentication
- Role-based access control (RBAC)
- Multi-factor authentication (MFA)
- Single sign-on (SSO) support
- AES-256-GCM encryption for provider keys
- Comprehensive audit logging
- Network policies and security headers

### Compliance

- GDPR compliance features
- SOC 2 Type II compliance
- Data retention policies
- Audit trail management
- Data export and deletion capabilities

### Monitoring & Observability

- Prometheus metrics collection
- Grafana dashboards
- Alerting rules
- Health checks
- Performance monitoring
- Resource usage tracking

### High Availability

- Multi-replica deployments
- Pod anti-affinity rules
- Health checks and readiness probes
- Rolling updates
- Resource limits and requests

### Backup & Recovery

- Automated backup scripts
- Database backup and restore
- Configuration backup
- Disaster recovery procedures

## Configuration

### Environment Variables

See `env.enterprise.example` for all available configuration options:

- **License**: Enterprise license key
- **Security**: JWT secrets, encryption keys
- **Database**: PostgreSQL configuration
- **Redis**: Caching configuration
- **Email**: SMTP configuration
- **Monitoring**: Sentry, New Relic integration
- **Features**: Feature flags and toggles
- **Compliance**: GDPR, SOC 2 settings

### Kubernetes Configuration

All configuration is managed through ConfigMaps and Secrets:

- **ConfigMap**: Non-sensitive configuration
- **Secrets**: Sensitive data (passwords, keys, certificates)
- **RBAC**: Role-based access control
- **Network Policies**: Network security rules

## Support

### Enterprise Support

- **Email**: enterprise@foundry360.com
- **Phone**: +1-555-NODE2AI
- **SLA**: 24/7 support with 4-hour response time
- **Documentation**: https://docs.foundry360.com/node2ai/enterprise

### Resources

- **Installation Guide**: [INSTALLATION.md](./INSTALLATION.md)
- **API Documentation**: [API.md](./API.md)
- **Security Guide**: [SECURITY.md](./SECURITY.md)
- **Provider Keys Guide**: [PROVIDER-KEYS.md](./PROVIDER-KEYS.md)
- **FAQ**: [FAQ.md](./FAQ.md)
- **Quick Start**: [QUICKSTART.md](./QUICKSTART.md)

## License

This is a licensed copy of Node2AI Enterprise Edition.
Contact sales@foundry360.com for licensing questions.

## Version Information

- **Version**: 1.0.0
- **Build Date**: 2024-01-15
- **Kubernetes Version**: 1.24+
- **Docker Version**: 20.10+
- **Node.js Version**: 18+
