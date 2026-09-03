# Node2AI Enterprise - AWS Terraform Deployment

Terraform module for deploying Node2AI Enterprise on AWS EC2.

## Prerequisites

- Terraform >= 1.0
- AWS Provider >= 5.0
- AWS CLI configured
- Valid AWS credentials
- Existing VPC and subnet

## Usage

### Basic Deployment

```hcl
module "node2ai" {
  source = "./vpc/terraform/aws"

  instance_type = "t3.large"
  vpc_id        = "vpc-xxx"
  subnet_id     = "subnet-xxx"
  key_name      = "my-key"
}
```

### With S3 Installer

If you've uploaded the installer package to S3:

```hcl
module "node2ai" {
  source = "./vpc/terraform/aws"

  instance_type        = "t3.large"
  vpc_id               = "vpc-xxx"
  subnet_id            = "subnet-xxx"
  key_name             = "my-key"
  installer_s3_bucket  = "my-installer-bucket"
  installer_s3_key     = "node2ai-enterprise-vpc.tar.gz"
}
```

### With Custom Tags

```hcl
module "node2ai" {
  source = "./vpc/terraform/aws"

  instance_type = "t3.large"
  vpc_id        = "vpc-xxx"
  subnet_id     = "subnet-xxx"
  key_name      = "my-key"

  tags = {
    Name        = "node2ai-enterprise"
    Environment = "production"
    Team        = "engineering"
  }
}
```

## Deployment

1. **Initialize Terraform:**

   ```bash
   cd vpc/terraform/aws
   terraform init
   ```

2. **Create terraform.tfvars:**

   ```hcl
   instance_type = "t3.large"
   vpc_id        = "vpc-xxx"
   subnet_id     = "subnet-xxx"
   key_name      = "my-key"
   ```

3. **Plan deployment:**

   ```bash
   terraform plan
   ```

4. **Apply deployment:**
   ```bash
   terraform apply
   ```

## Outputs

After deployment:

```bash
# Get instance details
terraform output

# Access dashboard
open $(terraform output -raw dashboard_url)

# Get API endpoint
terraform output -raw api_url
```

## Variables

| Variable              | Description                        | Type        | Default                           |
| --------------------- | ---------------------------------- | ----------- | --------------------------------- |
| `instance_type`       | EC2 instance type                  | string      | `t3.large`                        |
| `vpc_id`              | VPC ID                             | string      | **required**                      |
| `subnet_id`           | Subnet ID                          | string      | **required**                      |
| `key_name`            | EC2 Key Pair name                  | string      | **required**                      |
| `installer_s3_bucket` | S3 bucket for installer (optional) | string      | `""`                              |
| `installer_s3_key`    | S3 key for installer (optional)    | string      | `"node2ai-enterprise-vpc.tar.gz"` |
| `tags`                | Resource tags                      | map(string) | `{Name = "node2ai-enterprise"}`   |

## Security

- Security group allows SSH (22), Dashboard (3000), API (3001), HTTPS (443)
- IAM role created for instance (includes S3 access if using S3 installer)
- Root volume encrypted by default
- Security group allows all inbound (adjust as needed for production)

## Customization

### Restrict Security Group Access

Edit `main.tf` to restrict SSH access:

```hcl
ingress {
  description = "SSH"
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["YOUR_IP/32"]  # Replace with your IP
}
```

### Change Instance Type

```hcl
instance_type = "t3.xlarge"  # For larger workloads
```

### Add Additional Storage

```hcl
resource "aws_ebs_volume" "data" {
  availability_zone = aws_instance.node2ai.availability_zone
  size              = 100
  type              = "gp3"
  encrypted         = true

  tags = var.tags
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.node2ai.id
}
```

## Troubleshooting

### Instance Not Accessible

1. Check security group rules
2. Verify key pair name
3. Check VPC/subnet configuration
4. Review CloudWatch logs

### Installation Fails

1. SSH into instance: `ssh -i key.pem ubuntu@<public-ip>`
2. Check logs: `sudo journalctl -u cloud-final`
3. Verify installer files: `ls -la /opt/node2ai/`

## Cleanup

```bash
terraform destroy
```

This will remove:

- EC2 instance
- Security group
- IAM role and policy
- IAM instance profile
