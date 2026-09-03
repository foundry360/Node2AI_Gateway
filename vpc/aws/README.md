# Node2AI Enterprise - AWS VPC Deployment

Complete guide for deploying Node2AI Enterprise on AWS EC2 instances.

## Quick Start

### Option 1: Launch with Cloud-Init (Automated)

1. **Upload installer package to S3 (optional):**

   ```bash
   aws s3 cp node2ai-enterprise-vpc.tar.gz s3://my-bucket/
   ```

2. **Create Launch Template:**

   ```bash
   aws ec2 create-launch-template \
     --launch-template-name node2ai-enterprise \
     --launch-template-data '{
       "ImageId": "ami-0c55b159cbfafe1f0",
       "InstanceType": "t3.large",
       "UserData": "'$(base64 -w 0 vpc/aws/cloud-init.yaml)'",
       "SecurityGroupIds": ["sg-xxx"],
       "KeyName": "my-key"
     }'
   ```

3. **Launch Instance:**

   ```bash
   aws ec2 run-instances \
     --launch-template LaunchTemplateName=node2ai-enterprise \
     --subnet-id subnet-xxx
   ```

4. **Wait for installation** (5-10 minutes)

5. **Access dashboard:**

   ```bash
   PUBLIC_IP=$(aws ec2 describe-instances \
     --instance-ids i-xxx \
     --query 'Reservations[0].Instances[0].PublicIpAddress' \
     --output text)

   echo "Dashboard: http://${PUBLIC_IP}:3000"
   ```

### Option 2: Manual Installation with ISO

1. **Create volume from ISO:**

   ```bash
   # Upload ISO to S3 first
   aws s3 cp node2ai-enterprise-vpc.iso s3://my-bucket/

   # Create snapshot from ISO (requires conversion process)
   # Or use AWS Import/Export service
   ```

2. **Attach volume to instance:**

   ```bash
   aws ec2 attach-volume \
     --volume-id vol-xxx \
     --instance-id i-xxx \
     --device /dev/sdf
   ```

3. **On instance, mount ISO:**

   ```bash
   sudo mkdir /mnt/iso
   sudo mount /dev/xvdf /mnt/iso
   ```

4. **Run installer:**
   ```bash
   cd /mnt/iso
   sudo ./install-vpc.sh
   ```

### Option 3: Archive Package

1. **Upload package to S3:**

   ```bash
   aws s3 cp node2ai-enterprise-vpc.tar.gz s3://my-bucket/
   ```

2. **Launch instance and download:**

   ```bash
   # SSH into instance
   ssh -i key.pem ubuntu@<public-ip>

   # Download and extract
   aws s3 cp s3://my-bucket/node2ai-enterprise-vpc.tar.gz /tmp/
   tar xzf /tmp/node2ai-enterprise-vpc.tar.gz -C /opt/node2ai
   ```

3. **Install:**
   ```bash
   cd /opt/node2ai
   sudo ./install-vpc.sh
   ```

## Security Groups

### Required Rules

**Inbound:**

- SSH (22) - From your IP or VPC
- HTTP (3000) - From VPC or public
- HTTP (3001) - From VPC or public
- HTTPS (443) - Optional

**Outbound:**

- HTTPS (443) - To AI provider APIs
- HTTPS (443) - To package repositories

### Create Security Group

```bash
# Create security group
aws ec2 create-security-group \
  --group-name node2ai-enterprise \
  --description "Node2AI Enterprise Security Group" \
  --vpc-id vpc-xxx

# Allow SSH (replace with your IP)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0

# Allow Web Dashboard
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0

# Allow API
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 3001 \
  --cidr 0.0.0.0/0
```

## IAM Roles

### Required Permissions

If using S3 installer, create IAM role with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-installer-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::my-installer-bucket"
    }
  ]
}
```

### Create IAM Role

```bash
# Create role
aws iam create-role \
  --role-name node2ai-enterprise-instance-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach policy
aws iam put-role-policy \
  --role-name node2ai-enterprise-instance-role \
  --policy-name s3-access \
  --policy-document file://policy.json

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name node2ai-enterprise-instance-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name node2ai-enterprise-instance-profile \
  --role-name node2ai-enterprise-instance-role
```

## Terraform Deployment

See `vpc/terraform/aws/` for complete Terraform module.

```bash
cd vpc/terraform/aws
terraform init
terraform plan
terraform apply
```

## Monitoring

### CloudWatch Logs

Installation logs are available in:

- `/var/log/cloud-init-output.log`
- `/var/log/cloud-init.log`

### Check Installation Status

```bash
# SSH into instance
ssh -i key.pem ubuntu@<public-ip>

# Check cloud-init status
sudo cloud-init status

# View logs
sudo tail -f /var/log/cloud-init-output.log

# Check Docker services
docker ps
docker-compose ps
```

## Troubleshooting

### Instance Not Starting

1. Check instance status: `aws ec2 describe-instances --instance-ids i-xxx`
2. Check security group rules
3. Verify VPC/subnet configuration
4. Review CloudWatch logs

### Installation Fails

1. SSH into instance
2. Check cloud-init logs: `sudo journalctl -u cloud-final`
3. Verify installer files: `ls -la /opt/node2ai/`
4. Check Docker: `docker ps` and `docker logs <container>`

### Services Not Accessible

1. Check security group rules (ports 3000, 3001)
2. Verify services are running: `docker ps`
3. Check firewall: `sudo ufw status`
4. Test locally: `curl http://localhost:3000`

## Support

- [Main Installation Guide](../../INSTALL.md)
- [VPC Deployment Guide](../../docs/VPC_DEPLOYMENT.md)
- [Configuration Reference](../../CONFIGURATION.md)
