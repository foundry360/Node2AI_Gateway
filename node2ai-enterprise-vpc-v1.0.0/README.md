# Node2AI Enterprise v1.0.0

**Self-hosted AI orchestration platform with data sanitization for regulated industries**

Node2AI Enterprise is a complete, production-ready deployment package that enables organizations to securely deploy and manage AI interactions with full compliance, audit trails, and data protection.

## 🚀 Quick Start (30 Minutes)

### Prerequisites

- **Operating System**: Linux (Ubuntu 20.04+, RHEL 8+), macOS 10.15+, or Windows 10/11
- **Docker**: Version 20.10+ (for Docker deployment)
- **Node.js**: Version 18+ (for standalone deployment)
- **PostgreSQL**: Version 14+ (if not using Docker)
- **Resources**: Minimum 4GB RAM, 2 CPU cores, 20GB disk space

### Installation Options

**Option 1: Docker (Recommended - Fastest)**

```bash
cd docker
cp ../config/.env.example .env
# Edit .env with your configuration
docker-compose up -d
```

**Option 2: Kubernetes**

```bash
cd kubernetes
# Follow instructions in kubernetes/README.md
kubectl apply -f namespace.yaml
kubectl apply -f .
```

**Option 3: Standalone**

```bash
cd standalone
./install.sh
```

### Verify Installation

```bash
# Check health
curl http://localhost:3001/api/health

# Access web dashboard
open http://localhost:3000
```

## 📦 Package Contents

```
node2ai-enterprise-v1.0.0/
├── README.md                    # This file
├── INSTALL.md                   # Detailed installation guide
├── CONFIGURATION.md             # Configuration reference
├── CHANGELOG.md                 # Version history
├── LICENSE                      # Software license
│
├── docker/                      # Docker deployment
├── kubernetes/                  # Kubernetes deployment
├── standalone/                  # Standalone installation
├── desktop-admin/               # Desktop Admin Control Center
├── config/                      # Configuration templates
├── database/                    # Database schema and migrations
├── scripts/                     # Management scripts
├── docs/                        # Comprehensive documentation
├── monitoring/                  # Monitoring configurations
└── tests/                       # Test suites
```

## 🎯 Key Features

- **Multi-Provider AI Routing**: OpenAI, Anthropic, Google, Perplexity
- **Data Sanitization**: Automatic PII/PHI detection and removal
- **Blockchain Audit Trail**: Immutable transaction logging (Hyperledger Fabric)
- **HIPAA Compliance**: Built-in privacy and security controls
- **License Management**: Enterprise licensing with seat and usage tracking
- **Desktop Admin App**: Native desktop application for management
- **Air-Gapped Support**: Offline deployment capabilities

## 📚 Documentation

- **[Installation Guide](INSTALL.md)** - Step-by-step installation instructions
- **[Configuration Reference](CONFIGURATION.md)** - Complete configuration options
- **[Architecture Overview](docs/architecture.md)** - System architecture
- **[API Reference](docs/api-reference.md)** - API documentation
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

## 🔐 Security

- All services run as non-root users
- Encrypted credential storage
- TLS/SSL support
- Security headers configured
- Rate limiting enabled
- Input validation and sanitization

## 🆘 Support

- **Documentation**: See `docs/` directory
- **Support**: [Contact Support](support/contact-support.md)
- **System Requirements**: [System Requirements](support/system-requirements.md)

## 📄 License

Proprietary software. See [LICENSE](LICENSE) file for details.

## 🏢 About

Node2AI Enterprise is developed by **Foundry360**.

---

**Version**: 1.0.0  
**Release Date**: 2025-01-XX  
**License**: Proprietary
