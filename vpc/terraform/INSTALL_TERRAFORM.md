# Installing Terraform

Terraform is optional for VPC deployment. You can deploy Node2AI Enterprise using:

1. **Cloud-Init** (automated, no Terraform needed)
2. **Manual AWS CLI** commands
3. **Terraform** (Infrastructure as Code - optional)

## Quick Install Options

### macOS (Homebrew)

```bash
brew install terraform
```

### macOS (Manual)

1. Download from [terraform.io](https://www.terraform.io/downloads)
2. Extract and add to PATH:

   ```bash
   # Extract to /usr/local/bin
   sudo mv terraform /usr/local/bin/

   # Verify
   terraform version
   ```

### Linux (Ubuntu/Debian)

```bash
# Add HashiCorp GPG key
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -

# Add repository
sudo apt-add-repository "deb [arch=$(dpkg --print-architecture)] https://apt.releases.hashicorp.com $(lsb_release -cs) main"

# Install
sudo apt update
sudo apt install terraform
```

### Linux (RHEL/CentOS)

```bash
# Add repository
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://rpm.releases.hashicorp.com/RHEL/hashicorp.repo

# Install
sudo yum install terraform
```

## Verify Installation

```bash
terraform version
```

Should output something like:

```
Terraform v1.6.0
```

## Alternative: Deploy Without Terraform

You don't need Terraform to deploy! Use one of these methods:

### Option 1: Cloud-Init (Recommended)

```bash
# Create Cloud-Init package
cd /Users/jasongelsomino/Projects/Node2
./scripts/create-vpc-installer.sh --format cloud-init --platform aws

# Launch instance with Cloud-Init
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.large \
  --user-data file://vpc/aws/cloud-init.yaml \
  --security-group-ids sg-xxx \
  --key-name my-key
```

### Option 2: Manual AWS CLI

See [vpc/aws/README.md](../aws/README.md) for manual deployment steps.

## Using Terraform (After Installation)

Once Terraform is installed:

```bash
cd vpc/terraform/aws

# Initialize
terraform init

# Review plan
terraform plan

# Apply (creates resources)
terraform apply
```

## Next Steps

- If you want to use Terraform: Install it using one of the methods above
- If you prefer automated deployment: Use Cloud-Init (no Terraform needed)
- If you prefer manual control: Use AWS CLI commands

See [vpc/aws/README.md](../aws/README.md) for all deployment options.
