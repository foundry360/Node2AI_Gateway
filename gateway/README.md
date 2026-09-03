# Node2AI Gateway Appliance

## Quick start

```bash
cd gateway
docker compose up --build
```

Air-gap profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.airgap.yml up --build
```

- Gateway API: http://localhost:8080  
- Admin console: http://localhost:3080  
- PostgreSQL: localhost:5433 (`node2ai` / `node2ai` / `node2ai_gateway`)

Admin API key (dev default): `n2ai_admin_dev_key`

## Local development (without Docker)

```bash
# terminal 1
cd gateway && pnpm install && pnpm dev

# terminal 2
cd gateway/admin
cp .env.local.example .env.local
pnpm install && pnpm dev
```

## Persistence

- Without `DATABASE_URL`: in-memory identity + audit (local/dev/tests)
- With `DATABASE_URL`: PostgreSQL identity + audit (`persistence=postgres`)

Docker Compose sets `DATABASE_URL` automatically.
