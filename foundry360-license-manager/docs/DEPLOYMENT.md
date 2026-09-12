# Deployment

## Docker Compose (recommended)

From `foundry360-license-manager/`:

```bash
cp .env.example .env
# edit SESSION_SECRET, passwords, and mount signing key
docker compose up -d --build
```

Services:

| Service           | Port (host) | Notes |
|-------------------|-------------|-------|
| `license-manager` | 3085        | Next.js app |
| `postgres`        | 5434        | Persistent volume `license_manager_pg` |

Volumes:

- `license_manager_pg` — database
- `license_artifacts` — signed license files
- `./secrets` → `/run/secrets:ro` — private key directory

## Image

Multi-stage Dockerfile. Runtime image excludes:

- private signing keys
- `.env`
- local DB files
- test credentials
- development-only tooling beyond what is required for `prisma migrate` / seed

## Environment

See `.env.example`. Critical:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ENIGMA_LICENSE_PRIVATE_KEY_PATH`
- `ENIGMA_LICENSE_KEY_ID` (default `enigma-lic-2026-09`)
- `ARTIFACT_DIR`

## Do not deploy to customers

This application is for Foundry360 vendor workstations / internal networks only. Never ship it with Enigma customer packages or air-gap media.
