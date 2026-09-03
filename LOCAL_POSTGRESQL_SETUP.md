# Local PostgreSQL Setup Guide

This guide will help you set up a local PostgreSQL database for Node2AI development.

## Quick Start

### 1. Start PostgreSQL with Docker

```bash
docker-compose -f docker-compose.postgres.yml up -d
```

This will start:

- **PostgreSQL** on port `5432`
- **pgAdmin** on port `5050` (optional web UI)

### 2. Connection Details

**Database Credentials:**

- Host: `localhost`
- Port: `5432`
- Database: `node2ai`
- Username: `node2`
- Password: `node2_dev_password`

**pgAdmin Access:**

- URL: http://localhost:5050
- Email: `admin@node2ai.com`
- Password: `admin`

### 3. Update Environment Variables

Add these variables to `apps/api/.env`:

```env
# PostgreSQL Connection
DATABASE_URL=postgresql://node2:node2_dev_password@localhost:5432/node2ai
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=node2ai
POSTGRES_USER=node2
POSTGRES_PASSWORD=node2_dev_password
```

## Useful Commands

### Start PostgreSQL

```bash
docker-compose -f docker-compose.postgres.yml up -d
```

### Stop PostgreSQL

```bash
docker-compose -f docker-compose.postgres.yml down
```

### View Logs

```bash
docker-compose -f docker-compose.postgres.yml logs -f
```

### Reset Database (⚠️ Deletes all data)

```bash
docker-compose -f docker-compose.postgres.yml down -v
docker-compose -f docker-compose.postgres.yml up -d
```

### Connect with psql

```bash
docker exec -it node2-postgres psql -U node2 -d node2ai
```

### Backup Database

```bash
docker exec node2-postgres pg_dump -U node2 node2ai > backup.sql
```

### Restore Database

```bash
docker exec -i node2-postgres psql -U node2 -d node2ai < backup.sql
```

## Running Migrations

After starting PostgreSQL, run the database migrations:

```bash
cd apps/api
pnpm run db:migrate
```

## Troubleshooting

### Port Already in Use

If port 5432 is already in use, you can change it in `docker-compose.postgres.yml`:

```yaml
ports:
  - '5433:5432' # Use port 5433 instead
```

### Can't Connect

Check if PostgreSQL is running:

```bash
docker ps | grep node2-postgres
```

### Reset Everything

```bash
docker-compose -f docker-compose.postgres.yml down -v
rm -rf postgres_data
docker-compose -f docker-compose.postgres.yml up -d
```

## pgAdmin Web UI

1. Open http://localhost:5050
2. Login with `admin@node2ai.com` / `admin`
3. Right-click "Servers" → "Create" → "Server"
4. Name: `Node2 Local`
5. Connection tab:
   - Host: `postgres` (container name)
   - Port: `5432`
   - Database: `node2ai`
   - Username: `node2`
   - Password: `node2_dev_password`

## Data Persistence

Database data is stored in a Docker volume named `postgres_data`. This means:

- Data persists even when containers are stopped
- Data persists across container recreations
- To completely remove data, run `docker-compose down -v`

## Production Warning

⚠️ These credentials are for development only. Never use them in production!

For production, use:

- Strong, randomly generated passwords
- Environment-specific configuration
- Secret management (e.g., HashiCorp Vault, AWS Secrets Manager)
- SSL/TLS connections
