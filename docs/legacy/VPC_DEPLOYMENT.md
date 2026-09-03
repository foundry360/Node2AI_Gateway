# Node2AI Enterprise VPC Deployment Guide

Complete guide for deploying Node2AI Enterprise on Virtual Private Cloud (VPC) environments.

## Overview

Node2AI Enterprise can be deployed on VPCs using multiple methods:

- **ISO Image** - For air-gapped or offline installations
- **Cloud-Init** - For automated cloud provisioning (AWS, Azure, GCP)
- **Archive Package** - For manual deployment
- **Container Package** - Docker/Kubernetes (already available)

## Packaging Options

### 1. ISO Image (Best for Air-Gapped VPCs)

**Use Case:**

- Air-gapped environments
- Physical server deployments
- Offline installations
- Complete system images

**Creation:**

```bash
./scripts/create-vpc-installer.sh --format iso --version 1.0.0
```

**Output:**

- `node2ai-enterprise-vpc-v1.0.0.iso`
- `node2ai-enterprise-vpc-v1.0.0.iso.sha256` (checksum)

**Installation:**

1. Attach ISO to VPC instance
2. Mount ISO: `sudo mount -o loop node2ai-enterprise.iso /mnt/iso`
3. Run installer: `cd /mnt/iso && sudo ./install-vpc.sh`

### 2. Cloud-Init Package (Best for Automated Cloud Deployment)

**Use Case:**

- AWS EC2, Azure VM, Google Cloud
- Automated provisioning
- Infrastructure as Code
- CI/CD deployments

**Creation:**

```bash
# AWS
./scripts/create-vpc-installer.sh --format cloud-init --platform aws

# Azure
./scripts/create-vpc-installer.sh --format cloud-init --platform azure

# Google Cloud
./scripts/create-vpc-installer.sh --format cloud-init --platform gcp

# All platforms
./scripts/create-vpc-installer.sh --format cloud-init --platform all
```

**Output:**

- `node2ai-enterprise-vpc-v1.0.0-aws-cloud-init.tar.gz`
- `node2ai-enterprise-vpc-v1.0.0-azure-cloud-init.tar.gz`
- `node2ai-enterprise-vpc-v1.0.0-gcp-cloud-init.tar.gz`

**Installation:**

- Launch instance with cloud-init user-data
- Instance auto-installs on boot

### 3. Archive Package (Best for Manual Deployment)

**Use Case:**

- Manual deployments
- Existing VPC infrastructure
- Custom configurations
- Quick deployment

**Creation:**

```bash
./scripts/create-vpc-installer.sh --format archive --version 1.0.0
```

**Output:**

- `node2ai-enterprise-vpc-v1.0.0.tar.gz`
- `node2ai-enterprise-vpc-v1.0.0.tar.gz.sha256` (checksum)

**Installation:**

1. Upload to instance: `scp package.tar.gz user@instance:/tmp/`
2. Extract: `tar xzf /tmp/package.tar.gz -C /opt/node2ai`
3. Install: `cd /opt/node2ai && sudo ./install-vpc.sh`

## Platform-Specific Deployment

### AWS EC2

See [AWS Deployment Guide](../vpc/aws/README.md) for detailed instructions.

**Quick Start:**

```bash
# Create package
./scripts/create-vpc-installer.sh --format cloud-init --platform aws

# Launch instance with cloud-init
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.large \
  --user-data file://vpc/aws/cloud-init.yaml \
  --security-group-ids sg-xxx \
  --key-name my-key
```

**Terraform:**

```bash
cd vpc/terraform/aws
terraform init && terraform apply
```

### Azure VM

**Quick Start:**

```bash
# Create package
./scripts/create-vpc-installer.sh --format cloud-init --platform azure

# Create VM with cloud-init
az vm create \
  --resource-group myResourceGroup \
  --name node2ai-vm \
  --image Ubuntu2204 \
  --custom-data vpc/azure/cloud-init.yaml \
  --admin-username azureuser \
  --generate-ssh-keys
```

### Google Cloud Platform

**Quick Start:**

```bash
# Create package
./scripts/create-vpc-installer.sh --format cloud-init --platform gcp

# Create instance with cloud-init
gcloud compute instances create node2ai-instance \
  --image-family ubuntu-2204-lts \
  --image-project ubuntu-os-cloud \
  --metadata-from-file user-data=vpc/gcp/cloud-init.yaml
```

## ISO Image Deployment

### Creating ISO Image

**Prerequisites:**

```bash
# macOS
brew install genisoimage xorriso

# Linux (Ubuntu/Debian)
sudo apt-get install genisoimage xorriso

# Linux (RHEL/CentOS)
sudo yum install genisoimage xorriso
```

**Create ISO:**

```bash
./scripts/create-vpc-installer.sh --format iso --version 1.0.0
```

**Verify ISO:**

```bash
# Check ISO contents
isoinfo -l -i node2ai-enterprise-vpc-v1.0.0.iso

# Verify checksum
sha256sum -c node2ai-enterprise-vpc-v1.0.0.iso.sha256
```

### Mounting ISO on VPC Instance

**AWS EC2:**

```bash
# Upload ISO to S3
aws s3 cp node2ai-enterprise-vpc.iso s3://my-bucket/

# Create volume from ISO (requires conversion process)
# Or use AWS Import/Export service

# Attach to instance
aws ec2 attach-volume \
  --volume-id vol-xxx \
  --instance-id i-xxx \
  --device /dev/sdf

# On instance, mount
sudo mkdir /mnt/iso
sudo mount /dev/xvdf /mnt/iso
```

**Azure VM:**

```bash
# Upload ISO to blob storage
az storage blob upload \
  --account-name mystorage \
  --container-name isos \
  --name node2ai-enterprise.iso \
  --file node2ai-enterprise.iso

# Attach as disk
az vm disk attach \
  --vm-name myVM \
  --disk myISO \
  --lun 1

# On VM, mount
sudo mkdir /mnt/iso
sudo mount /dev/sdc /mnt/iso
```

**Google Cloud:**

```bash
# Upload ISO to Cloud Storage
gsutil cp node2ai-enterprise.iso gs://my-bucket/

# Create disk from image
gcloud compute disks create node2ai-iso \
  --image-source=gs://my-bucket/node2ai-enterprise.iso

# Attach to instance
gcloud compute instances attach-disk INSTANCE \
  --disk node2ai-iso

# On instance, mount
sudo mkdir /mnt/iso
sudo mount /dev/sdb /mnt/iso
```

## Network Configuration

### Required Ports

**Inbound:**

- 22 (SSH) - Management access
- 3000 (HTTP) - Web dashboard
- 3001 (HTTP) - API server
- 80/443 (HTTP/HTTPS) - Optional reverse proxy

**Outbound:**

- 443 (HTTPS) - AI provider APIs
- 443 (HTTPS) - Package repositories

### Security Groups

**AWS:**

- Create security group with required ports
- Attach to EC2 instance

**Azure:**

- Configure Network Security Group
- Add inbound rules for required ports

**Google Cloud:**

- Create firewall rules
- Apply to VPC network

## Security Considerations

### ISO Security

- Sign ISO with GPG key (optional)
- Verify checksums before installation
- Include security certificates
- Encrypt sensitive data

**Sign ISO:**

```bash
# Generate GPG key (if needed)
gpg --gen-key

# Sign ISO
gpg --armor --detach-sig node2ai-enterprise-vpc-v1.0.0.iso

# Verify signature
gpg --verify node2ai-enterprise-vpc-v1.0.0.iso.asc
```

### Cloud-Init Security

- Use secrets management (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager)
- Encrypt user-data
- Use IAM roles/service accounts
- Enable VPC security groups/firewall rules
- Restrict SSH access to specific IPs

## Monitoring

### Installation Logs

**Cloud-Init:**

```bash
# Check status
sudo cloud-init status

# View logs
sudo tail -f /var/log/cloud-init-output.log
sudo journalctl -u cloud-final
```

**Docker:**

```bash
# Check services
docker ps
docker-compose ps

# View logs
docker logs <container>
docker-compose logs
```

## Troubleshooting

### Installation Fails

1. **Check logs:**

   ```bash
   sudo tail -f /var/log/cloud-init-output.log
   sudo journalctl -u cloud-final
   ```

2. **Verify installer files:**

   ```bash
   ls -la /opt/node2ai/
   ```

3. **Check Docker:**

   ```bash
   docker --version
   docker-compose --version
   ```

4. **Manual installation:**
   ```bash
   cd /opt/node2ai
   sudo ./install-vpc.sh
   ```

### Services Not Accessible

1. **Check security groups/firewall rules**
2. **Verify services are running:**

   ```bash
   docker ps
   curl http://localhost:3000
   ```

3. **Check network:**
   ```bash
   sudo netstat -tlnp | grep -E '3000|3001'
   ```

### ISO Mount Issues

1. **Check device:**

   ```bash
   lsblk
   sudo fdisk -l
   ```

2. **Try different mount point:**
   ```bash
   sudo mount /dev/xvdf /mnt/iso -o loop
   ```

## Quick Reference

### Create All Package Formats

```bash
./scripts/create-vpc-installer.sh --format all --version 1.0.0
```

### Create ISO Only

```bash
./scripts/create-vpc-installer.sh --format iso --version 1.0.0
```

### Create Cloud-Init for All Platforms

```bash
./scripts/create-vpc-installer.sh --format cloud-init --platform all --version 1.0.0
```

## Support

- [Installation Guide](../INSTALL.md)
- [Configuration Reference](../CONFIGURATION.md)
- [AWS Deployment Guide](../vpc/aws/README.md)
- [Terraform Module](../vpc/terraform/aws/README.md)
