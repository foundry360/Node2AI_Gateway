# Node2AI Docker Deployment Guide

This directory contains Docker configurations for deploying Node2AI Enterprise in containerized environments.

## Quick Start

### Production Deployment

```bash
# Copy environment variables
cp ../config/.env.example .env

# Edit .env with your configuration
nano .env

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Development Deployment

```bash
# Start with development configuration
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### Production with Nginx Proxy

```bash
# Start with Nginx reverse proxy
docker-compose --profile proxy up -d
```

## Images

Pre-built Docker images are available in the `images/` directory for offline installation:

- `node2ai-api-amd64.tar.gz` - API server (AMD64)
- `node2ai-api-arm64.tar.gz` - API server (ARM64)
- `node2ai-web-amd64.tar.gz` - Web dashboard (AMD64)
- `node2ai-web-arm64.tar.gz` - Web dashboard (ARM64)

### Loading Images (Offline Installation)

```bash
# Load all images
./images/load-images.sh

# Or load individually
docker load -i images/node2ai-api-amd64.tar.gz
docker load -i images/node2ai-web-amd64.tar.gz
```

## Configuration

### Environment Variables

Required environment variables (see `../config/.env.example`):

- `POSTGRES_PASSWORD` - PostgreSQL database password
- `REDIS_PASSWORD` - Redis cache password
- `JWT_SECRET` - JWT signing secret
- `ENCRYPTION_KEY` - Data encryption key
- `API_KEY_SECRET` - API key generation secret
- `LICENSE_KEY` - Node2AI license key

Optional environment variables:

- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic (Claude) API key
- `GOOGLE_API_KEY` - Google AI API key
- `PERPLEXITY_API_KEY` - Perplexity API key

### Resource Limits

Default resource limits are configured for small deployments. For production, adjust in `docker-compose.prod.yml`:

- **API**: 2GB RAM, 2 CPU cores
- **Web**: 1GB RAM, 1 CPU core
- **PostgreSQL**: 2GB RAM, 1 CPU core
- **Redis**: 512MB RAM, 0.25 CPU cores

## Services

### API Server (Port 3001)

- Health check: `http://localhost:3001/api/health`
- API documentation: `http://localhost:3001/api/docs`

### Web Dashboard (Port 3000)

- Admin dashboard: `http://localhost:3000`
- Control Center: `http://localhost:3000`

### PostgreSQL (Port 5432)

- Database: `node2ai`
- User: `node2ai` (configurable)
- Password: Set in `.env`

### Redis (Port 6379)

- Cache and session storage
- Password: Set in `.env`

## Maintenance

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
```

### Backup Database

```bash
docker-compose exec postgres pg_dump -U node2ai node2ai > backup.sql
```

### Restore Database

```bash
docker-compose exec -T postgres psql -U node2ai node2ai < backup.sql
```

### Update Images

```bash
# Pull latest images
docker-compose pull

# Rebuild and restart
docker-compose up -d --build
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes data)
docker-compose down -v
```

## Troubleshooting

### Services Won't Start

1. Check logs: `docker-compose logs`
2. Verify environment variables: `docker-compose config`
3. Check port availability: `netstat -tuln | grep -E '3000|3001|5432|6379'`

### Database Connection Issues

1. Verify PostgreSQL is healthy: `docker-compose ps postgres`
2. Check database credentials in `.env`
3. Test connection: `docker-compose exec postgres psql -U node2ai -d node2ai`

### High Memory Usage

1. Adjust resource limits in `docker-compose.prod.yml`
2. Monitor with: `docker stats`
3. Restart services: `docker-compose restart`

## Security

- All services run as non-root users
- Network isolation between services
- Secrets managed via environment variables
- SSL/TLS support via Nginx (when profile enabled)
- Health checks configured for all services

## Support

For additional help, see:

- [Main Installation Guide](../INSTALL.md)
- [Configuration Reference](../CONFIGURATION.md)
- [Troubleshooting Guide](../docs/troubleshooting.md)
