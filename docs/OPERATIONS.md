# Operate Node2AI Gateway Appliance

Day-2 operations for the Docker Compose appliance under `gateway/`.

## Health

```bash
curl -s http://127.0.0.1:8080/health
docker compose -f gateway/docker-compose.yml ps
```

Air-gap: if Ollama is down, `/health` returns **503** and completions fail closed.

Admin overview: http://localhost:3080 (System page shows DB + local runtime).

## Logs

```bash
cd gateway
docker compose logs -f gateway
docker compose logs -f ollama
docker compose logs -f postgres
```

## Backup

### PostgreSQL

```bash
cd gateway
source .env
docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%Y%m%d).sql
```

### Vault key

Back up `GATEWAY_VAULT_KEY` from `.env` alongside the dump. Without it, tokenized values cannot be recovered.

### Ollama models

```bash
docker run --rm -v gateway_ollama_data:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/ollama-backup.tgz -C /data .
```

## Restore

1. Stop gateway: `docker compose down`
2. Restore Postgres (new volume or `psql < backup.sql` into running postgres)
3. Restore `.env` including `GATEWAY_VAULT_KEY`
4. Restore Ollama volume if needed
5. `docker compose up -d`

## Rotate secrets

1. Generate new `GATEWAY_ADMIN_API_KEY` / `POSTGRES_PASSWORD`
2. Update `.env` and admin container build args / env
3. `docker compose up -d --force-recreate gateway admin`
4. For DB password: update Postgres user password then recreate services

Rotating `GATEWAY_VAULT_KEY` invalidates existing vault ciphertext — re-tokenize after rotation or migrate ciphertext with a dual-key procedure (not shipped in v1).

## Mode switch

- Connected: default Compose
- Air-gap: `docker compose -f docker-compose.yml -f docker-compose.airgap.yml up -d`

Air-gap strips non-local providers and requires Ollama.

## Upgrades

```bash
git pull
cd gateway
docker compose up --build -d
```

Review `CHANGELOG` / release notes before upgrading pilots.

## Fail-closed reminders

- No ungoverned provider passthrough
- Policy / transform / audit failures block responses
- Air-gap refuses cloud models and refuses execution without local runtime
