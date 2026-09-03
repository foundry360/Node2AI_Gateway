# Node2AI Enterprise Firewall Rules

## Overview

This document provides firewall configuration templates for Node2AI Enterprise deployments.

## Linux Firewall (iptables)

### Allow Required Ports

```bash
# Allow HTTP
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Allow HTTPS
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow Web Dashboard (if not using reverse proxy)
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# Allow API Server (if not using reverse proxy)
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT

# Allow PostgreSQL (internal only - restrict source)
sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport 5432 -j ACCEPT
sudo iptables -A INPUT -p tcp -s 10.0.0.0/8 --dport 5432 -j ACCEPT

# Allow Redis (internal only - restrict source)
sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport 6379 -j ACCEPT
sudo iptables -A INPUT -p tcp -s 10.0.0.0/8 --dport 6379 -j ACCEPT

# Save rules
sudo iptables-save > /etc/iptables/rules.v4
```

### Firewalld (RHEL/CentOS)

```bash
# Allow HTTP/HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# Allow Web Dashboard
sudo firewall-cmd --permanent --add-port=3000/tcp

# Allow API Server
sudo firewall-cmd --permanent --add-port=3001/tcp

# Reload firewall
sudo firewall-cmd --reload
```

### UFW (Ubuntu/Debian)

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Web Dashboard
sudo ufw allow 3000/tcp

# Allow API Server
sudo ufw allow 3001/tcp

# Enable firewall
sudo ufw enable
```

## Windows Firewall

### PowerShell Configuration

```powershell
# Allow HTTP
New-NetFirewallRule -DisplayName "Node2AI HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# Allow HTTPS
New-NetFirewallRule -DisplayName "Node2AI HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Allow Web Dashboard
New-NetFirewallRule -DisplayName "Node2AI Web" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

# Allow API Server
New-NetFirewallRule -DisplayName "Node2AI API" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

## Docker Network Isolation

### Custom Network

```bash
# Create isolated network
docker network create --driver bridge node2ai-network

# Services communicate only within network
docker-compose up -d
```

### Restrict External Access

```yaml
# docker-compose.yml
services:
  postgres:
    ports: [] # Remove port mapping
  redis:
    ports: [] # Remove port mapping
```

## Cloud Provider Firewall

### AWS Security Groups

```json
{
  "Ingress": [
    {
      "IpProtocol": "tcp",
      "FromPort": 80,
      "ToPort": 80,
      "CidrIp": "0.0.0.0/0"
    },
    {
      "IpProtocol": "tcp",
      "FromPort": 443,
      "ToPort": 443,
      "CidrIp": "0.0.0.0/0"
    },
    {
      "IpProtocol": "tcp",
      "FromPort": 3000,
      "ToPort": 3000,
      "SourceSecurityGroupId": "sg-loadbalancer"
    },
    {
      "IpProtocol": "tcp",
      "FromPort": 3001,
      "ToPort": 3001,
      "SourceSecurityGroupId": "sg-loadbalancer"
    }
  ]
}
```

### Azure Network Security Groups

```json
{
  "securityRules": [
    {
      "name": "AllowHTTP",
      "protocol": "Tcp",
      "sourcePortRange": "*",
      "destinationPortRange": "80",
      "sourceAddressPrefix": "*",
      "destinationAddressPrefix": "*",
      "access": "Allow",
      "priority": 1000,
      "direction": "Inbound"
    },
    {
      "name": "AllowHTTPS",
      "protocol": "Tcp",
      "sourcePortRange": "*",
      "destinationPortRange": "443",
      "sourceAddressPrefix": "*",
      "destinationAddressPrefix": "*",
      "access": "Allow",
      "priority": 1001,
      "direction": "Inbound"
    }
  ]
}
```

### Google Cloud Firewall Rules

```bash
# Allow HTTP
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 \
  --source-ranges 0.0.0.0/0

# Allow HTTPS
gcloud compute firewall-rules create allow-https \
  --allow tcp:443 \
  --source-ranges 0.0.0.0/0
```

## Kubernetes Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: node2ai-network-policy
  namespace: node2ai
spec:
  podSelector:
    matchLabels:
      app: node2ai
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
        - protocol: TCP
          port: 3001
  egress:
    - to:
        - podSelector:
            matchLabels:
              component: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              component: redis
      ports:
        - protocol: TCP
          port: 6379
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443 # HTTPS for AI provider APIs
```

## Best Practices

1. **Principle of Least Privilege**: Only allow necessary ports
2. **Source IP Restrictions**: Limit database/cache access to application servers
3. **Regular Audits**: Review firewall rules periodically
4. **Documentation**: Document all firewall changes
5. **Testing**: Test firewall rules before production deployment

## Troubleshooting

### Test Firewall Rules

```bash
# From external machine
telnet your-server.com 3001

# From server
sudo netstat -tuln | grep LISTEN
```

### Check Blocked Connections

```bash
# Linux
sudo iptables -L -n -v

# Check logs
sudo tail -f /var/log/kern.log | grep DROPPED
```

## Support

For firewall configuration help:

- [Network Requirements](network-requirements.md)
- [Installation Guide](../INSTALL.md)
- [Troubleshooting](../docs/troubleshooting.md)
