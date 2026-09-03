# Node2AI Enterprise Network Requirements

## Port Requirements

### Required Ports

| Port | Service       | Protocol | Direction | Notes                     |
| ---- | ------------- | -------- | --------- | ------------------------- |
| 3000 | Web Dashboard | TCP      | Inbound   | Can be changed via config |
| 3001 | API Server    | TCP      | Inbound   | Can be changed via config |
| 5432 | PostgreSQL    | TCP      | Internal  | Database (internal only)  |
| 6379 | Redis         | TCP      | Internal  | Cache (internal only)     |
| 80   | HTTP          | TCP      | Inbound   | Optional (Nginx)          |
| 443  | HTTPS         | TCP      | Inbound   | Optional (Nginx)          |

### Optional Ports

| Port  | Service    | Protocol | Direction | Notes                  |
| ----- | ---------- | -------- | --------- | ---------------------- |
| 9090  | Prometheus | TCP      | Internal  | Monitoring             |
| 3001  | Grafana    | TCP      | Internal  | Monitoring             |
| 11434 | Ollama     | TCP      | Internal  | Local LLM (if enabled) |

## Network Architecture

```
Internet
    |
    | (HTTPS/443 or HTTP/80)
    |
[Load Balancer / Nginx] (Optional)
    |
    | (HTTP/3000, HTTP/3001)
    |
[Node2AI Services]
    |
    | (Internal)
    |
[PostgreSQL:5432] [Redis:6379]
```

## Firewall Configuration

### External Firewall (DMZ)

Allow inbound:

- Port 80 (HTTP) - Optional
- Port 443 (HTTPS) - Recommended
- Port 3000 (Web Dashboard) - If not using reverse proxy
- Port 3001 (API) - If not using reverse proxy

Block:

- All other ports from external networks
- Direct database access (5432)
- Direct cache access (6379)

### Internal Firewall (Application Layer)

Allow:

- Service-to-service communication
- Database access from application
- Cache access from application
- Monitoring tool access

### Database Firewall

Restrict:

- Only allow connections from application servers
- Block all external access
- Use strong authentication

## DNS Requirements

### Required DNS Records

- A record for web dashboard domain
- A record for API domain (if separate)
- CNAME for www subdomain (optional)

### Example Configuration

```
node2ai.company.com    A    192.168.1.100
api.node2ai.com       A    192.168.1.100
```

## SSL/TLS Requirements

### Certificate Requirements

- Valid SSL certificate (Let's Encrypt, commercial, or self-signed)
- Certificate must cover all domains
- Minimum TLS 1.2 (TLS 1.3 recommended)

### Certificate Locations

- Nginx: `/etc/nginx/ssl/`
- Application: Configured via environment variables

## Outbound Connections

### Required Outbound Access

- **AI Provider APIs:**
  - `api.openai.com` (OpenAI)
  - `api.anthropic.com` (Anthropic)
  - `generativelanguage.googleapis.com` (Google)
  - `api.perplexity.ai` (Perplexity)

- **Package Management:**
  - `registry.npmjs.org` (npm packages)
  - `github.com` (GitHub packages)

- **Container Registry:**
  - `ghcr.io` (GitHub Container Registry)

- **Update Servers:**
  - `updates.node2ai.com` (Auto-updates)

### Proxy Configuration

If behind a corporate proxy:

```bash
# Set proxy environment variables
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1
```

## Load Balancer Configuration

### Health Checks

Configure health check endpoints:

- API: `http://backend:3001/api/health`
- Web: `http://backend:3000/`

### Session Affinity

- Enable sticky sessions for web dashboard
- Not required for API (stateless)

### SSL Termination

- Terminate SSL at load balancer
- Use HTTP between load balancer and backend

## Network Security

### Best Practices

1. **Use HTTPS**: Always use SSL/TLS for external access
2. **VPN Access**: Require VPN for admin access
3. **Network Segmentation**: Isolate database and cache
4. **Rate Limiting**: Configure at network level
5. **DDoS Protection**: Use cloud provider DDoS protection
6. **Monitoring**: Monitor network traffic and anomalies

### Intrusion Detection

- Monitor for suspicious traffic patterns
- Alert on unusual connection attempts
- Log all network access

## Troubleshooting

### Connection Issues

1. **Verify port availability:**

   ```bash
   netstat -tuln | grep -E '3000|3001'
   ```

2. **Test connectivity:**

   ```bash
   curl http://localhost:3001/api/health
   ```

3. **Check firewall rules:**

   ```bash
   # Linux
   sudo iptables -L -n

   # Windows
   netsh advfirewall firewall show rule name=all
   ```

### DNS Issues

1. **Test DNS resolution:**

   ```bash
   nslookup node2ai.company.com
   ```

2. **Check DNS configuration:**
   ```bash
   cat /etc/resolv.conf
   ```

## Support

For network configuration help:

- [Firewall Rules](firewall-rules.md)
- [Installation Guide](../INSTALL.md)
- [Troubleshooting](../docs/troubleshooting.md)
