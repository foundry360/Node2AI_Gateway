# Node2AI Enterprise Configuration Reference

Complete reference for all configuration options in Node2AI Enterprise.

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Application Configuration](#application-configuration)
3. [Database Configuration](#database-configuration)
4. [AI Provider Configuration](#ai-provider-configuration)
5. [Security Configuration](#security-configuration)
6. [License Configuration](#license-configuration)

## Environment Variables

All configuration is done via environment variables. See `config/.env.example` for a template.

### Application Variables

| Variable          | Description         | Default       | Required |
| ----------------- | ------------------- | ------------- | -------- |
| `NODE_ENV`        | Environment mode    | `production`  | No       |
| `DEPLOYMENT_MODE` | Deployment type     | `self-hosted` | No       |
| `VERSION`         | Application version | `1.0.0`       | No       |
| `LOG_LEVEL`       | Logging level       | `info`        | No       |

### Database Configuration

| Variable            | Description            | Default        | Required |
| ------------------- | ---------------------- | -------------- | -------- |
| `POSTGRES_HOST`     | PostgreSQL host        | `localhost`    | Yes      |
| `POSTGRES_PORT`     | PostgreSQL port        | `5432`         | No       |
| `POSTGRES_USER`     | Database user          | `node2ai`      | Yes      |
| `POSTGRES_PASSWORD` | Database password      | -              | Yes      |
| `POSTGRES_DB`       | Database name          | `node2ai`      | Yes      |
| `DATABASE_URL`      | Full connection string | Auto-generated | Yes      |

### Redis Configuration

| Variable         | Description            | Default        | Required |
| ---------------- | ---------------------- | -------------- | -------- |
| `REDIS_HOST`     | Redis host             | `localhost`    | Yes      |
| `REDIS_PORT`     | Redis port             | `6379`         | No       |
| `REDIS_PASSWORD` | Redis password         | -              | Yes      |
| `REDIS_URL`      | Full connection string | Auto-generated | Yes      |

### Security Secrets

**⚠️ Never commit these to version control!**

| Variable         | Description                           | Required |
| ---------------- | ------------------------------------- | -------- |
| `JWT_SECRET`     | JWT signing secret (32+ bytes)        | Yes      |
| `ENCRYPTION_KEY` | Data encryption key (32+ bytes)       | Yes      |
| `API_KEY_SECRET` | API key generation secret (32+ bytes) | Yes      |

Generate with: `scripts/utils/generate-secrets.sh`

### AI Provider Configuration

At least one AI provider must be configured:

| Variable             | Description                    | Required |
| -------------------- | ------------------------------ | -------- |
| `OPENAI_API_KEY`     | OpenAI API key (sk-...)        | No       |
| `ANTHROPIC_API_KEY`  | Anthropic API key (sk-ant-...) | No       |
| `GOOGLE_API_KEY`     | Google AI API key              | No       |
| `PERPLEXITY_API_KEY` | Perplexity API key             | No       |

### License Configuration

| Variable       | Description         | Default      | Required |
| -------------- | ------------------- | ------------ | -------- |
| `LICENSE_KEY`  | Node2AI license key | -            | Yes      |
| `LICENSE_TIER` | License tier        | `enterprise` | No       |

### Application URLs

| Variable                  | Description         | Default                 | Required |
| ------------------------- | ------------------- | ----------------------- | -------- |
| `NEXT_PUBLIC_API_URL`     | Public API URL      | `http://localhost:3001` | Yes      |
| `NEXT_PUBLIC_APP_NAME`    | Application name    | `Node2AI`               | No       |
| `NEXT_PUBLIC_APP_VERSION` | Application version | `1.0.0`                 | No       |

### CORS Configuration

| Variable       | Description                       | Default                                       | Required |
| -------------- | --------------------------------- | --------------------------------------------- | -------- |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `http://localhost:3000,http://localhost:3001` | No       |

### Feature Flags

| Variable                    | Description                   | Default                  | Required |
| --------------------------- | ----------------------------- | ------------------------ | -------- |
| `DATA_SANITIZATION_ENABLED` | Enable PII/PHI sanitization   | `true`                   | No       |
| `EXTERNAL_AI_ENABLED`       | Enable external AI providers  | `true`                   | No       |
| `LOCAL_LLM_ENABLED`         | Enable local LLM (Ollama)     | `false`                  | No       |
| `LOCAL_LLM_URL`             | Local LLM URL                 | `http://localhost:11434` | No       |
| `BLOCKCHAIN_ENABLED`        | Enable blockchain audit trail | `true`                   | No       |

## Configuration Files

### Docker Deployment

Edit `docker/.env`:

```bash
cd docker
cp ../config/.env.example .env
nano .env
```

### Standalone Deployment

Edit `/etc/node2ai/.env`:

```bash
sudo nano /etc/node2ai/.env
```

### Kubernetes Deployment

Edit `kubernetes/configmap.yaml` and `kubernetes/secrets-template.yaml`:

```bash
cd kubernetes
cp secrets-template.yaml secrets.yaml
nano secrets.yaml
kubectl create secret generic node2ai-secrets --from-file=secrets.yaml -n node2ai
```

## Validation

After configuration, validate your setup:

```bash
# Check configuration
./scripts/validate.sh

# Health check
curl http://localhost:3001/api/health
```

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use strong passwords** (32+ characters)
3. **Rotate secrets regularly** (quarterly recommended)
4. **Use environment-specific configs** (dev, staging, prod)
5. **Restrict file permissions** (`.env` files should be 600)
6. **Use secret management** (Kubernetes secrets, Docker secrets, etc.)

## Support

For configuration help:

- See [Installation Guide](INSTALL.md)
- Check [Troubleshooting](docs/troubleshooting.md)
- Contact support: [Support](support/contact-support.md)
