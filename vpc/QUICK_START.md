# VPC Deployment Quick Start

Choose your deployment method:

## Option 1: Cloud-Init (Easiest - No Terraform Needed)

**Best for:** Automated deployment, AWS/Azure/GCP console

### Steps:

1. **Create Cloud-Init package:**

   ```bash
   cd /Users/jasongelsomino/Projects/Node2
   ./scripts/create-vpc-installer.sh --format cloud-init --platform aws --version 1.0.0
   ```

2. **Upload to cloud storage (AWS S3, Azure Blob, GCP Storage)**

3. **Launch instance via cloud console:**
   - AWS: Use EC2 Launch Wizard, paste Cloud-Init config
   - Azure: Use VM creation, add custom data
   - GCP: Use Compute Engine, add startup script

4. **Instance auto-installs on boot!**

## Option 2: Archive Package (Manual)

**Best for:** Quick testing, existing infrastructure

### Steps:

1. **Create archive:**

   ```bash
   ./scripts/create-vpc-installer.sh --format archive --version 1.0.0
   ```

2. **Upload to instance:**

   ```bash
   scp dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0.tar.gz user@instance:/tmp/
   ```

3. **SSH into instance and install:**
   ```bash
   ssh user@instance
   tar xzf /tmp/node2ai-enterprise-vpc-v1.0.0.tar.gz -C /opt/node2ai
   cd /opt/node2ai
   sudo ./install-vpc.sh
   ```

## Option 3: ISO/DMG Image

**Best for:** Air-gapped environments, offline installation

### Steps:

1. **Create ISO/DMG:**

   ```bash
   ./scripts/create-vpc-installer.sh --format iso --version 1.0.0
   ```

2. **Mount on VPC instance:**

   ```bash
   # macOS VPC
   hdiutil attach node2ai-enterprise-vpc-v1.0.0.dmg

   # Linux VPC
   sudo mount -o loop node2ai-enterprise-vpc-v1.0.0.iso /mnt/iso
   ```

3. **Run installer:**
   ```bash
   cd /mnt/iso  # or /Volumes/Node2AI\ Enterprise\ 1.0.0/
   sudo ./install-vpc.sh
   ```

## Option 4: Terraform (Infrastructure as Code)

**Best for:** Repeatable deployments, team environments

### Prerequisites:

- Install Terraform: `brew install terraform` (macOS)
- AWS CLI configured (optional, can use Terraform Cloud)

### Steps:

1. **Install Terraform:**

   ```bash
   brew install terraform
   ```

2. **Configure:**

   ```bash
   cd vpc/terraform/aws

   # Create terraform.tfvars
   cat > terraform.tfvars <<EOF
   instance_type = "t3.large"
   vpc_id        = "vpc-xxx"
   subnet_id     = "subnet-xxx"
   key_name      = "my-key"
   EOF
   ```

3. **Deploy:**
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

## Installation Methods Supported

The installer automatically detects and uses:

1. **Docker** (if `docker/` directory exists)
2. **Kubernetes** (if `kubernetes/` directory exists)
3. **Standalone** (if `standalone/` directory exists)

## Quick Test

Test the package creation:

```bash
# Create all formats
./scripts/create-vpc-installer.sh --format all --version 1.0.0

# Check what was created
ls -lh dist/vpc-installer/
```

## Next Steps

- **Cloud-Init**: See [vpc/aws/README.md](aws/README.md)
- **Terraform**: See [vpc/terraform/aws/README.md](terraform/aws/README.md)
- **Full Guide**: See [docs/VPC_DEPLOYMENT.md](../docs/VPC_DEPLOYMENT.md)
