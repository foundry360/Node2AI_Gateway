# Node2AI Gateway Appliance

## Quick start

```bash
cd gateway
chmod +x install.sh
./install.sh
```

Or manually:

```bash
cp .env.example .env   # set secrets
docker compose --profile model-pull up --build -d
```

Air-gap:

```bash
./install.sh airgap
# or
docker compose -f docker-compose.yml -f docker-compose.airgap.yml up --build -d
```

- Gateway API: http://localhost:8080  
- Admin console: http://localhost:3080  
- Customer docs: [INSTALL](../docs/INSTALL.md) · [OPERATIONS](../docs/OPERATIONS.md) · [PILOT_ACCEPTANCE](../docs/PILOT_ACCEPTANCE.md)

## Local development (without Docker)

```bash
# terminal 1 — stub runtime for tests/dev
cd gateway && pnpm install && GATEWAY_LOCAL_RUNTIME=stub pnpm dev

# terminal 2
cd gateway/admin
cp .env.local.example .env.local
pnpm install && pnpm dev
```

## Persistence & inference

- `DATABASE_URL` set → Postgres identity, audit, policies, models
- `GATEWAY_LOCAL_RUNTIME=ollama` (appliance default) → real local inference
- `GATEWAY_LOCAL_RUNTIME=stub` → CI / unit tests
- `GATEWAY_VAULT_KEY` → encrypts token vault plaintext at rest

Demo API keys in seed data are for pilot scripts only — rotate admin key via `.env` for any customer install.
