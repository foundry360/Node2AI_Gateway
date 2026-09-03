# Node2AI Docker Deployment

Docker deployment configurations for Node2AI enterprise platform.

## Overview

This directory contains Docker deployment configurations for different environments:

- **Standard Deployment**: `docker-compose.yml` - Basic development and testing
- **Production Deployment**: `docker-compose.prod.yml` - Production with monitoring
- **Air-gapped Deployment**: `docker-compose.airgap.yml` - Offline/air-gapped environments

## Quick Start

### Standard Deployment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Deployment

```bash
# Start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
```

### Air-gapped Deployment

```bash
# Start air-gapped services
docker-compose -f docker-compose.yml -f docker-compose.airgap.yml up -d

# View logs
docker-compose -f docker-compose.yml -f docker-compose.airgap.yml logs -f

# Stop services
docker-compose -f docker-compose.yml -f docker-compose.airgap.yml down
```

## Services

### Core Services

- **postgres**: PostgreSQL database
- **redis**: Redis cache and session store
- **api**: Node2AI API gateway
- **web**: Node2AI web dashboard
- **nginx**: Reverse proxy and load balancer

### Production Services

- **prometheus**: Metrics collection
- **grafana**: Monitoring dashboard

### Air-gapped Services

- **ollama**: Local LLM server
- **model-manager**: Model management service
- **backup**: Automated backup service

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Database
POSTGRES_PASSWORD=your-secure-password

# Redis
REDIS_PASSWORD=your-redis-password

# Security
JWT_SECRET=your-jwt-secret
API_SECRET_KEY=your-api-secret

# License
SUPERNOVA_LICENSE_KEY=your-license-key

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Deployment
DEPLOYMENT_MODE=self-hosted

# Monitoring (Production only)
GRAFANA_PASSWORD=your-grafana-password
```

### SSL Configuration

For production deployments with SSL:

1. Place SSL certificates in `./ssl/` directory
2. Update `nginx.prod.conf` with SSL configuration
3. Use `docker-compose.prod.yml` for SSL-enabled deployment

## Ports

### Standard Deployment

- **80**: Nginx (HTTP)
- **3000**: Web Dashboard
- **3001**: API Gateway
- **5432**: PostgreSQL
- **6379**: Redis

### Production Deployment

- **80**: Nginx (HTTP)
- **443**: Nginx (HTTPS)
- **3000**: Web Dashboard
- **3001**: API Gateway
- **5432**: PostgreSQL
- **6379**: Redis
- **9090**: Prometheus
- **3001**: Grafana (conflicts with API, use different port)

### Air-gapped Deployment

- **80**: Nginx (HTTP)
- **3000**: Web Dashboard
- **3001**: API Gateway
- **5432**: PostgreSQL
- **6379**: Redis
- **11434**: Ollama (Local LLM)

## Volumes

### Data Persistence

- `postgres_data`: Database data
- `redis_data`: Redis data
- `model_cache`: Model cache (air-gapped)
- `ollama_data`: Ollama data (air-gapped)
- `backup_data`: Backup data (air-gapped)

### Model Storage (Air-gapped)

- `../../models`: Local model files (read-only)
- `model_cache`: Model cache directory

## Health Checks

All services include health checks:

```bash
# Check service health
docker-compose ps

# Check specific service
docker-compose exec api curl -f http://localhost:3001/api/health
```

## Monitoring

### Production Monitoring

Access monitoring dashboards:

- **Grafana**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090

### Health Endpoints

- **API Health**: http://localhost:3001/api/health
- **Web Health**: http://localhost:3000

## Backup and Recovery

### Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U supernova supernova > backup.sql

# Restore backup
docker-compose exec -T postgres psql -U supernova supernova < backup.sql
```

### Air-gapped Backup

Automated backups are configured in air-gapped deployment:

```bash
# View backup logs
docker-compose logs backup

# Access backup files
docker-compose exec backup ls -la /backups
```

## Security

### Network Security

- All services run in isolated Docker network
- Air-gapped deployment has no external network access
- Nginx provides rate limiting and security headers

### Data Security

- Database connections use authentication
- Redis requires password authentication
- All sensitive data is encrypted at rest

### Access Control

- API endpoints require authentication
- Metrics endpoints are restricted to internal networks
- Admin interfaces require proper authentication

## Troubleshooting

### Common Issues

1. **Port Conflicts**: Ensure ports are available
2. **Permission Issues**: Check Docker volume permissions
3. **Memory Issues**: Increase Docker memory limits
4. **Network Issues**: Check Docker network configuration

### Logs

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs api
docker-compose logs web

# Follow logs in real-time
docker-compose logs -f api
```

### Debugging

```bash
# Access service shell
docker-compose exec api sh
docker-compose exec postgres psql -U supernova supernova

# Check service status
docker-compose exec api curl -f http://localhost:3001/api/health
```

## Development

### Local Development

```bash
# Start development environment
docker-compose up -d postgres redis

# Run API in development mode
cd ../../apps/api
pnpm dev

# Run Web in development mode
cd ../../apps/web
pnpm dev
```

### Building Images

```bash
# Build API image
docker build -f Dockerfile.api -t supernova-api .

# Build Web image
docker build -f Dockerfile.web -t supernova-web .
```

## License

Proprietary - Node2AI Enterprise License
