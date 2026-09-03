# Node2AI Configuration Guide

This guide covers the configuration options for Node2AI Enterprise Platform.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Deployment Modes](#deployment-modes)
- [Security Configuration](#security-configuration)
- [Database Configuration](#database-configuration)
- [AI Model Configuration](#ai-model-configuration)
- [Compliance Configuration](#compliance-configuration)
- [Monitoring Configuration](#monitoring-configuration)
- [Backup Configuration](#backup-configuration)

## Environment Variables

### Core Configuration

| Variable                 | Description     | Default       | Required |
| ------------------------ | --------------- | ------------- | -------- |
| `DEPLOYMENT_MODE`        | Deployment mode | `self-hosted` | Yes      |
| `SUPERNOVA_LICENSE_KEY`  | License key     | -             | Yes      |
| `SUPERNOVA_LICENSE_TYPE` | License type    | `enterprise`  | Yes      |

### API Configuration

| Variable         | Description     | Default   | Required |
| ---------------- | --------------- | --------- | -------- |
| `API_PORT`       | API server port | `3001`    | No       |
| `API_HOST`       | API server host | `0.0.0.0` | No       |
| `API_SECRET_KEY` | API secret key  | -         | Yes      |

### Web Dashboard Configuration

| Variable   | Description     | Default   | Required |
| ---------- | --------------- | --------- | -------- |
| `WEB_PORT` | Web server port | `3000`    | No       |
| `WEB_HOST` | Web server host | `0.0.0.0` | No       |

### Database Configuration

| Variable             | Description             | Default | Required |
| -------------------- | ----------------------- | ------- | -------- |
| `DATABASE_URL`       | Database connection URL | -       | Yes      |
| `DATABASE_SSL`       | Enable SSL for database | `false` | No       |
| `DATABASE_POOL_SIZE` | Connection pool size    | `10`    | No       |

### Redis Configuration

| Variable         | Description           | Default | Required |
| ---------------- | --------------------- | ------- | -------- |
| `REDIS_URL`      | Redis connection URL  | -       | Yes      |
| `REDIS_PASSWORD` | Redis password        | -       | No       |
| `REDIS_DB`       | Redis database number | `0`     | No       |

## Deployment Modes

### Cloud Deployment

For cloud-based deployments with external AI services:

```bash
# Environment variables
DEPLOYMENT_MODE=cloud
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_ENDPOINT=your-azure-endpoint
```

**Features**:

- External AI service integration
- Real-time model updates
- Scalable processing
- Pay-per-use pricing

### Self-Hosted Deployment

For on-premises deployment with local AI models:

```bash
# Environment variables
DEPLOYMENT_MODE=self-hosted
LOCAL_MODEL_PATH=/models
LOCAL_MODEL_TYPE=llama2
LOCAL_MODEL_CONFIG=/models/config.yaml
```

**Features**:

- Complete data control
- No external dependencies
- Custom model support
- Offline operation

### Air-Gapped Deployment

For completely offline deployment:

```bash
# Environment variables
DEPLOYMENT_MODE=airgap
AIRGAP_MODE=true
OFFLINE_MODELS_PATH=/models/offline
FEATURE_OFFLINE_MODE=true
```

**Features**:

- Complete offline operation
- No internet connectivity required
- Enhanced security
- Government compliance

## Security Configuration

### Authentication

```bash
# JWT Configuration
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Session Configuration
SESSION_SECRET=your-session-secret
SESSION_TIMEOUT=3600
```

### Encryption

```bash
# Data Encryption
ENCRYPTION_KEY=your-encryption-key-here
ENCRYPTION_ALGORITHM=aes-256-gcm
ENCRYPTION_IV_LENGTH=16
```

### CORS Configuration

```bash
# CORS Settings
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_HEADERS=Content-Type,Authorization,X-API-Key
CORS_CREDENTIALS=true
```

### Rate Limiting

```bash
# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false
RATE_LIMIT_SKIP_FAILED_REQUESTS=false
```

## Database Configuration

### PostgreSQL Settings

```bash
# Connection Settings
DATABASE_URL=postgresql://user:password@host:port/database
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false

# Pool Settings
DATABASE_POOL_SIZE=10
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20
DATABASE_POOL_IDLE_TIMEOUT=30000
DATABASE_POOL_ACQUIRE_TIMEOUT=60000
```

### Performance Tuning

```sql
-- PostgreSQL configuration
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
```

## AI Model Configuration

### External AI Services

#### OpenAI Configuration

```bash
# OpenAI Settings
OPENAI_API_KEY=your-openai-key
OPENAI_ORGANIZATION=your-org-id
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TIMEOUT=30000
OPENAI_MAX_RETRIES=3
```

#### Anthropic Configuration

```bash
# Anthropic Settings
ANTHROPIC_API_KEY=your-anthropic-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_TIMEOUT=30000
ANTHROPIC_MAX_RETRIES=3
```

#### Azure OpenAI Configuration

```bash
# Azure OpenAI Settings
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_VERSION=2023-12-01-preview
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment
```

### Local AI Models

#### Ollama Configuration

```bash
# Ollama Settings
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama2:7b
OLLAMA_TIMEOUT=30000
OLLAMA_MAX_RETRIES=3
```

#### Local Model Settings

```bash
# Local Model Configuration
LOCAL_MODEL_PATH=/models
LOCAL_MODEL_TYPE=llama2
LOCAL_MODEL_CONFIG=/models/config.yaml
LOCAL_MODEL_CACHE_SIZE=1000
LOCAL_MODEL_CACHE_TTL=3600
```

### Model Configuration File

```yaml
# models/config.yaml
models:
  llama-2-7b-chat:
    path: '/models/llama-2-7b-chat.gguf'
    type: 'gguf'
    size: '7B'
    context_length: 4096
    temperature: 0.7
    top_p: 0.9
    max_tokens: 2048
    enabled: true
    priority: 1

  mistral-7b-instruct:
    path: '/models/mistral-7b-instruct.gguf'
    type: 'gguf'
    size: '7B'
    context_length: 8192
    temperature: 0.7
    top_p: 0.9
    max_tokens: 2048
    enabled: true
    priority: 2
```

## Compliance Configuration

### GDPR Compliance

```bash
# GDPR Settings
GDPR_ENABLED=true
GDPR_DATA_RETENTION_DAYS=2555
GDPR_RIGHT_TO_BE_FORGOTTEN=true
GDPR_DATA_PORTABILITY=true
GDPR_CONSENT_MANAGEMENT=true
```

### HIPAA Compliance

```bash
# HIPAA Settings
HIPAA_ENABLED=true
HIPAA_AUDIT_LOGGING=true
HIPAA_ENCRYPTION_AT_REST=true
HIPAA_ENCRYPTION_IN_TRANSIT=true
HIPAA_ACCESS_CONTROLS=true
HIPAA_BREACH_NOTIFICATION=true
```

### SOX Compliance

```bash
# SOX Settings
SOX_ENABLED=true
SOX_AUDIT_TRAIL=true
SOX_INTERNAL_CONTROLS=true
SOX_FINANCIAL_REPORTING=true
SOX_DATA_INTEGRITY=true
```

### Compliance Reporting

```bash
# Compliance Reporting
COMPLIANCE_REPORTING_ENABLED=true
COMPLIANCE_REPORT_SCHEDULE=0 2 * * *
COMPLIANCE_REPORT_RETENTION_DAYS=2555
COMPLIANCE_AUDIT_LOG_RETENTION_DAYS=2555
```

## Monitoring Configuration

### Health Checks

```bash
# Health Check Settings
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_INTERVAL=30
HEALTH_CHECK_TIMEOUT=10
HEALTH_CHECK_RETRIES=3
```

### Metrics

```bash
# Metrics Settings
METRICS_ENABLED=true
METRICS_PORT=9090
METRICS_PATH=/metrics
METRICS_INTERVAL=60
```

### Logging

```bash
# Logging Settings
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=/var/log/supernova/supernova.log
LOG_MAX_SIZE=100MB
LOG_MAX_FILES=10
LOG_COMPRESS=true
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'supernova-api'
    static_configs:
      - targets: ['api:3001']
    metrics_path: '/api/metrics'
    scrape_interval: 30s

  - job_name: 'supernova-web'
    static_configs:
      - targets: ['web:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

## Backup Configuration

### Database Backup

```bash
# Database Backup Settings
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION=true
BACKUP_ENCRYPTION=true
```

### File Backup

```bash
# File Backup Settings
FILE_BACKUP_ENABLED=true
FILE_BACKUP_SCHEDULE=0 3 * * *
FILE_BACKUP_RETENTION_DAYS=30
FILE_BACKUP_INCLUDE=/models,/config
FILE_BACKUP_EXCLUDE=/tmp,/cache
```

### Backup Storage

```bash
# Backup Storage Settings
BACKUP_STORAGE_TYPE=local
BACKUP_STORAGE_PATH=/backups
BACKUP_STORAGE_S3_BUCKET=your-bucket
BACKUP_STORAGE_S3_REGION=us-east-1
BACKUP_STORAGE_S3_ACCESS_KEY=your-access-key
BACKUP_STORAGE_S3_SECRET_KEY=your-secret-key
```

## Advanced Configuration

### Load Balancing

```bash
# Load Balancer Settings
LOAD_BALANCER_ENABLED=true
LOAD_BALANCER_ALGORITHM=round_robin
LOAD_BALANCER_HEALTH_CHECK=true
LOAD_BALANCER_STICKY_SESSIONS=false
```

### Caching

```bash
# Cache Settings
CACHE_ENABLED=true
CACHE_TYPE=redis
CACHE_TTL=3600
CACHE_MAX_SIZE=1000
CACHE_CLEANUP_INTERVAL=300
```

### Queue Configuration

```bash
# Queue Settings
QUEUE_ENABLED=true
QUEUE_TYPE=redis
QUEUE_CONCURRENCY=5
QUEUE_MAX_ATTEMPTS=3
QUEUE_RETRY_DELAY=5000
```

## Configuration Validation

### Validate Configuration

```bash
# Validate environment variables
./scripts/validate-config.sh

# Check configuration syntax
./scripts/check-config.sh

# Test configuration
./scripts/test-config.sh
```

### Configuration Testing

```bash
# Test database connection
./scripts/test-database.sh

# Test Redis connection
./scripts/test-redis.sh

# Test AI model connection
./scripts/test-models.sh
```

## Configuration Management

### Environment-Specific Configuration

```bash
# Development
cp .env.development .env

# Staging
cp .env.staging .env

# Production
cp .env.production .env
```

### Configuration Templates

```bash
# Generate configuration template
./scripts/generate-config.sh

# Validate configuration template
./scripts/validate-template.sh

# Apply configuration template
./scripts/apply-template.sh
```

## Troubleshooting Configuration

### Common Configuration Issues

1. **Invalid Environment Variables**: Check variable names and values
2. **Database Connection Issues**: Verify connection string and credentials
3. **Redis Connection Issues**: Check Redis URL and authentication
4. **AI Model Issues**: Verify model configuration and paths
5. **SSL/TLS Issues**: Check certificate paths and permissions

### Configuration Debugging

```bash
# Debug environment variables
env | grep SUPERNOVA

# Debug configuration loading
./scripts/debug-config.sh

# Debug service configuration
./scripts/debug-services.sh
```

### Configuration Recovery

```bash
# Restore default configuration
./scripts/restore-default-config.sh

# Reset configuration
./scripts/reset-config.sh

# Backup configuration
./scripts/backup-config.sh
```

## Best Practices

### Security Best Practices

1. **Use strong passwords** for all services
2. **Enable SSL/TLS** for all connections
3. **Regularly rotate secrets** and keys
4. **Use environment-specific configurations**
5. **Monitor configuration changes**

### Performance Best Practices

1. **Optimize database settings** for your workload
2. **Configure appropriate cache sizes**
3. **Set up monitoring and alerting**
4. **Regularly review and update configurations**
5. **Test configuration changes** in staging first

### Maintenance Best Practices

1. **Document all configuration changes**
2. **Use version control** for configuration files
3. **Regularly backup configurations**
4. **Test configuration changes** before applying
5. **Monitor system performance** after changes
