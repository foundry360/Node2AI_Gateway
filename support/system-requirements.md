# Node2AI Enterprise System Requirements

## Minimum Requirements

### Operating System

**Linux:**

- Ubuntu 20.04 LTS or later
- RHEL 8 or later
- CentOS 8 or later
- Debian 11 or later
- SUSE Linux Enterprise Server 15 or later

**macOS:**

- macOS 10.15 (Catalina) or later
- Intel or Apple Silicon

**Windows:**

- Windows 10 (64-bit) or later
- Windows Server 2016 or later

### Hardware

**CPU:**

- Minimum: 2 cores
- Recommended: 4+ cores

**Memory (RAM):**

- Minimum: 4GB
- Recommended: 8GB+

**Storage:**

- Minimum: 20GB free space
- Recommended: 50GB+ SSD

**Network:**

- Minimum: 10Mbps
- Recommended: 100Mbps+

### Software

**Docker Deployment:**

- Docker 20.10+
- Docker Compose 2.0+

**Kubernetes Deployment:**

- Kubernetes 1.24+
- kubectl configured
- Persistent volume storage class

**Standalone Deployment:**

- Node.js 18+
- PostgreSQL 14+
- Redis 7+ (optional)
- pnpm 8+

## Recommended Production Requirements

### Small Deployment (1-10 users)

- CPU: 4 cores
- RAM: 8GB
- Storage: 50GB SSD
- Network: 100Mbps

### Medium Deployment (10-50 users)

- CPU: 8 cores
- RAM: 16GB
- Storage: 100GB SSD
- Network: 1Gbps

### Large Deployment (50+ users)

- CPU: 16+ cores
- RAM: 32GB+
- Storage: 500GB+ SSD
- Network: 10Gbps
- Load balancer recommended
- Database replication recommended

## Desktop Admin Application

### Windows

- Windows 10 or later (64-bit)
- 2GB RAM
- 500MB disk space

### macOS

- macOS 10.15 (Catalina) or later
- Intel or Apple Silicon
- 2GB RAM
- 500MB disk space

### Linux

- Modern distribution (Ubuntu 20.04+, etc.)
- X11 or Wayland
- 2GB RAM
- 500MB disk space

## Network Requirements

### Inbound Ports

- 3000: Web dashboard (HTTP)
- 3001: API server (HTTP)
- 5432: PostgreSQL (internal)
- 6379: Redis (internal)
- 80/443: Nginx (if using reverse proxy)

### Outbound Connections

- Internet access for AI provider APIs
- GitHub Container Registry (for Docker images)
- Update servers (for auto-updates)

### Firewall Rules

See `support/firewall-rules.md` for detailed firewall configuration.

## Cloud Provider Compatibility

Tested and supported on:

- AWS (EC2, ECS, EKS)
- Azure (VM, Container Instances, AKS)
- Google Cloud (Compute Engine, GKE)
- DigitalOcean (Droplets, Kubernetes)
- On-premises infrastructure

## Virtualization

Supported on:

- VMware vSphere
- Microsoft Hyper-V
- KVM/QEMU
- Docker Desktop
- Podman

## Browser Requirements (Web Dashboard)

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- JavaScript enabled
- Cookies enabled

## Support

For questions about system requirements:

- Contact: [Support](contact-support.md)
- Documentation: [Installation Guide](../INSTALL.md)
