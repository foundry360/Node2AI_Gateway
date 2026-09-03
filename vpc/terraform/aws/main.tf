# Node2AI Enterprise - AWS Terraform Module

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.large"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID"
  type        = string
}

variable "key_name" {
  description = "EC2 Key Pair name"
  type        = string
}

variable "installer_s3_bucket" {
  description = "S3 bucket containing installer package (optional)"
  type        = string
  default     = ""
}

variable "installer_s3_key" {
  description = "S3 key for installer package (optional)"
  type        = string
  default     = "node2ai-enterprise-vpc.tar.gz"
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default = {
    Name        = "node2ai-enterprise"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# Data source for Ubuntu AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security Group
resource "aws_security_group" "node2ai" {
  name        = "${var.tags.Name}-sg"
  description = "Security group for Node2AI Enterprise"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Web Dashboard"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "API Server"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

# IAM Role for instance
resource "aws_iam_role" "node2ai" {
  name = "${var.tags.Name}-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# IAM Policy for S3 access (if using S3 installer)
resource "aws_iam_role_policy" "node2ai_s3" {
  count = var.installer_s3_bucket != "" ? 1 : 0
  name  = "${var.tags.Name}-s3-policy"
  role  = aws_iam_role.node2ai.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "arn:aws:s3:::${var.installer_s3_bucket}/${var.installer_s3_key}"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::${var.installer_s3_bucket}"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "node2ai" {
  name = "${var.tags.Name}-instance-profile"
  role = aws_iam_role.node2ai.name

  tags = var.tags
}

# Read cloud-init user data
locals {
  cloud_init_content = file("${path.module}/../aws/cloud-init.yaml")
  
  # If S3 bucket is provided, add download command to user data
  user_data = var.installer_s3_bucket != "" ? <<-EOF
    ${local.cloud_init_content}
    
    # Download installer from S3
    - |
      if [ -n "${var.installer_s3_bucket}" ]; then
        aws s3 cp s3://${var.installer_s3_bucket}/${var.installer_s3_key} /tmp/installer.tar.gz
        mkdir -p /tmp/node2ai-installer
        tar xzf /tmp/installer.tar.gz -C /tmp/node2ai-installer
        cp -r /tmp/node2ai-installer/* /opt/node2ai/ 2>/dev/null || true
      fi
  EOF
  : local.cloud_init_content
}

# EC2 Instance
resource "aws_instance" "node2ai" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  subnet_id     = var.subnet_id
  key_name      = var.key_name

  vpc_security_group_ids = [aws_security_group.node2ai.id]
  iam_instance_profile   = aws_iam_instance_profile.node2ai.name

  user_data = base64encode(local.user_data)

  root_block_device {
    volume_size = 50
    volume_type = "gp3"
    encrypted   = true
  }

  tags = var.tags
}

# Outputs
output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.node2ai.id
}

output "public_ip" {
  description = "Public IP address"
  value       = aws_instance.node2ai.public_ip
}

output "private_ip" {
  description = "Private IP address"
  value       = aws_instance.node2ai.private_ip
}

output "dashboard_url" {
  description = "Dashboard URL"
  value       = "http://${aws_instance.node2ai.public_ip}:3000"
}

output "api_url" {
  description = "API URL"
  value       = "http://${aws_instance.node2ai.public_ip}:3001"
}

output "security_group_id" {
  description = "Security Group ID"
  value       = aws_security_group.node2ai.id
}

