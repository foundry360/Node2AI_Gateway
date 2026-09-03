# VPC Packaging & Installation Guide

Complete guide for creating installable packages for Virtual Private Cloud (VPC) deployments.

## Quick Start

```bash
# Create all package formats
./scripts/create-vpc-installer.sh --format all --version 1.0.0

# Create specific format
./scripts/create-vpc-installer.sh --format iso --version 1.0.0
./scripts/create-vpc-installer.sh --format cloud-init --platform aws --version 1.0.0
./scripts/create-vpc-installer.sh --format archive --version 1.0.0
```

## Package Formats

### ISO Image

**Best for:** Air-gapped environments, offline installations

**Requirements:**

- `genisoimage` or `mkisofs` tool
- macOS: `brew install genisoimage`
- Linux: `sudo apt-get install genisoimage`

**Create:**

```bash
./scripts/create-vpc-installer.sh --format iso --version 1.0.0
```

**Output:**

- `dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0.iso`
- `dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0.iso.sha256`

**Install:**

1. Mount ISO: `sudo mount -o loop node2ai-enterprise.iso /mnt/iso`
2. Run installer: `cd /mnt/iso && sudo ./install-vpc.sh`

### Cloud-Init Package

**Best for:** Automated cloud provisioning (AWS, Azure, GCP)

**Create:**

```bash
# Single platform
./scripts/create-vpc-installer.sh --format cloud-init --platform aws

# All platforms
./scripts/create-vpc-installer.sh --format cloud-init --platform all
```

**Output:**

- `dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0-aws-cloud-init.tar.gz`
- `dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0-azure-cloud-init.tar.gz`
- `dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0-gcp-cloud-init.tar.gz`

**Install:**

- Launch instance with cloud-init user-data
- Instance auto-installs on boot

### Archive Package

**Best for:** Manual deployment, existing infrastructure

**Create:**

```bash
./scripts/create-vpc-installer.sh --format archive --version 1.0.0
```

**Output:**

- `dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0.tar.gz`
- `dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0.tar.gz.sha256`

**Install:**

1. Upload: `scp package.tar.gz user@instance:/tmp/`
2. Extract: `tar xzf /tmp/package.tar.gz -C /opt/node2ai`
3. Install: `cd /opt/node2ai && sudo ./install-vpc.sh`

## Package Contents

All packages include:

- `install-vpc.sh` - Main installation script
- `docker/` - Docker deployment files
- `kubernetes/` - Kubernetes manifests
- `standalone/` - Standalone installation
- `scripts/` - Management scripts
- `config/` - Configuration templates
- `docs/` - Documentation

## Installation Script

The `install-vpc.sh` script:

- Detects cloud platform (AWS, Azure, GCP)
- Chooses installation method (Docker, Kubernetes, Standalone)
- Loads Docker images if available
- Generates secrets if needed
- Starts services
- Provides access URLs

## Verification

### Verify Checksums

```bash
# ISO
sha256sum -c node2ai-enterprise-vpc-v1.0.0.iso.sha256

# Archive
sha256sum -c node2ai-enterprise-vpc-v1.0.0.tar.gz.sha256
```

### Test Package Contents

```bash
# Extract and inspect
tar xzf node2ai-enterprise-vpc-v1.0.0.tar.gz
cd node2ai-enterprise-vpc-v1.0.0
ls -la
./install-vpc.sh --help  # If help is implemented
```

## Integration with CI/CD

### GitHub Actions

Add to `.github/workflows/release.yml`:

```yaml
- name: Create VPC installer packages
  run: |
    ./scripts/create-vpc-installer.sh --format all --version ${{ steps.version.outputs.VERSION }}

- name: Upload VPC packages
  uses: actions/upload-artifact@v4
  with:
    name: vpc-installers
    path: dist/vpc-installer/*
```

## Security

### Signing Packages

**ISO:**

```bash
gpg --armor --detach-sig node2ai-enterprise-vpc-v1.0.0.iso
```

**Archive:**

```bash
gpg --armor --detach-sig node2ai-enterprise-vpc-v1.0.0.tar.gz
```

### Checksums

All packages include SHA256 checksums for verification.

## Support

- [VPC Deployment Guide](VPC_DEPLOYMENT.md)
- [Installation Guide](../INSTALL.md)
- [Configuration Reference](../CONFIGURATION.md)
