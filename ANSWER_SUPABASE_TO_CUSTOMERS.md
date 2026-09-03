# Answer: Shipping to Customers Without Supabase

## Your Question

> "We used to depend on Supabase. If a customer deploys on AWS (RDS) or their own infrastructure, do we still need code changes?"

## Short Answer

**No additional code changes are required.** Node2AI now ships with native PostgreSQL authentication and storage.

## Current Architecture

- ✅ Native PostgreSQL authentication (bcrypt + JWT)
- ✅ `DATABASE_URL` drives all persistence (works with RDS/Aurora/Postgres containers)
- ✅ Redis handles sessions/rate limiting
- ✅ Docker/ECS deployments bundle everything needed
- ❌ Supabase SDK, auth, and RLS have been removed

## Deployment Scenarios

### Scenario 1: Customer Uses Included Docker Compose (Default)

- Provide `.env` with `DATABASE_URL` pointing at bundled Postgres container
- Run `docker compose up -d`
- No external services required

### Scenario 2: Customer Uses AWS RDS PostgreSQL

- Set `DATABASE_URL=postgresql://<user>:<pass>@<rds-endpoint>:5432/<db>`
- Optionally set `JWT_SECRET`, `API_KEY_SECRET`, and Redis creds
- Deploy API/Web containers unchanged

### Scenario 3: Customer Uses Another SQL Provider (Azure Postgres, GCP Cloud SQL)

- Same as RDS: supply correct `DATABASE_URL`
- Ensure required extensions (`uuid-ossp`, `pgvector`, `pg_trgm`) are available

### Scenario 4: Customer Requests MongoDB or Non-SQL

- ❌ Not supported. The platform is built around PostgreSQL features.
- Recommend standing up managed PostgreSQL (Aurora, RDS, Cloud SQL) instead.

## What to Communicate to Customers

1. **Supabase is no longer required.** The application bundles its own auth/session system.
2. **PostgreSQL is mandatory.** Provide minimum requirements (v15+, pgvector extension).
3. **Environment variables to set:**
   - `DATABASE_URL`
   - `JWT_SECRET` (unique per environment)
   - `API_KEY_SECRET`
   - Optional: `REDIS_URL`, blockchain keys, provider API keys
4. **Deployment targets supported:** Docker Compose, ECS/Fargate, Kubernetes, bare metal with systemd.

## TL;DR

- ✅ Customers on AWS, Azure, GCP can deploy immediately using native PostgreSQL
- ✅ No Supabase credentials or code paths remain
- ❌ MongoDB / document stores are not supported without a major rewrite

Your packaging story is now "bring a PostgreSQL instance (or use the bundled one) and set `DATABASE_URL`."
