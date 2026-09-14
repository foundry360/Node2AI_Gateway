# Operate Enigma Gateway Appliance

Day-2 operations for the Docker Compose appliance under `gateway/`.

**Product:** Enigma. Historical `node2ai` identifiers in env/DB defaults are compatibility only — see [ENIGMA_IDENTITY_AND_MIGRATION.md](./ENIGMA_IDENTITY_AND_MIGRATION.md).

## Health

```bash
curl -s http://127.0.0.1:8080/health
docker compose -f gateway/docker-compose.yml ps
```

Air-gap: if Ollama is down, `/health` returns **503** and completions fail closed.

Postgres appliance: `/health` returns **503** with `reason_code=DATABASE_UNAVAILABLE` when Postgres is unreachable, or `reason_code=SCHEMA_NOT_READY` when the database is reachable but required Product 1.0 tables/columns are missing (for example `action_outcomes`). Connectivity alone is not readiness. Apply operator migrations on existing volumes — see Outcome / Agent-Tool / EPA sections below — or recreate from `db/schema.sql` + `db/schema-epa.sql` on a fresh Compose volume.

Admin overview: http://localhost:3080 (System page shows DB + local runtime).

### Deployment identity

Each installation has a persistent `deployment_id` (UUID) stored in `system_config`.
Created automatically on first Gateway boot (Postgres appliance).

**Foundry360 retrieval** (after Gateway healthy):

```bash
curl -s -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  http://127.0.0.1:8080/v1/admin/system \
  | jq -r .deployment.deployment_id
```

See [enigma/deployment-identity.md](./enigma/deployment-identity.md).

### Foundry360 license provisioning

Commercial installs are Foundry360-led (not customer self-service).

Canonical flow: install → retrieve Deployment ID → vendor-sign license →
install via Admin **System → License** (or `POST /v1/admin/license/install`) →
verify `license.status=ACTIVE` → hand off Admin to customer.

Full VPC / Air-Gapped / renewal runbooks:
[enigma/signed-offline-licensing.md](./enigma/signed-offline-licensing.md).

Compose defaults: `ENIGMA_LICENSE_MODE=production`, mount `./licenses` →
`/etc/enigma/license` (writable for Admin install). Vendor private signing keys
never enter the customer VPC.

Backup/restore: restore DB + matching license file together.

### Port conflicts / wrong process

If health or completions look wrong while Compose is “Up”, check that **Docker** owns `:8080` / `:3080` — not a local `pnpm dev`. See [INSTALL.md](./INSTALL.md#docker-only-runtime-important).

### Production configuration safety

Appliance / production-shaped startups refuse:

- `GATEWAY_ACTOR_REGISTRY_MODE=off`
- `GATEWAY_FAIL_CLOSED_AUDIT=false`
- the built-in development `GATEWAY_ADMIN_API_KEY`

when `ENIGMA_LICENSE_MODE=production`, `NODE_ENV=production`, or `DATABASE_URL` is set.  
Lab/emergency bypass only: `GATEWAY_ALLOW_INSECURE_CONFIG=true`.

### Local runtime errors

Completions return distinct reason codes (not opaque `INTERNAL_ERROR`) when:

| Code | Meaning |
|------|---------|
| `LOCAL_RUNTIME_UNAVAILABLE` | Ollama unreachable or request failed |
| `LOCAL_MODEL_NOT_READY` | Model not pulled yet (pull `llama3.2` / `GATEWAY_OLLAMA_MODEL`) |
| `AIRGAP_LOCAL_RUNTIME_UNAVAILABLE` | Air-gap mode requires Ollama |
| `POLICY_DISABLED` | Core request/response policy disabled in admin |

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

Back up `GATEWAY_VAULT_KEY` and `GATEWAY_AUDIT_KEY` (if set) from `.env` alongside the dump. Without the vault key, tokenized values cannot be recovered. Without the audit key, integrity signatures cannot be re-verified after a key rotation.

### Audit integrity (tamper-evident ledger)

**Claim:** Responses are cryptographically hashed; audit history is hash-chained, HMAC-signed, sequenced, append-only (including TRUNCATE prohibited), with optional Ed25519 signed checkpoints. **Not** a distributed blockchain. Cryptographic verification ≠ legal certification.

Each audit event stores `response_hash`, `event_hash`, `integrity_signature` (HMAC), and (Phase 1) `deployment_id` / `sequence_number` / `audit_canonical_version`. Response plaintext is not stored.

Verify:

```bash
curl -s -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  http://127.0.0.1:8080/v1/admin/audit/integrity

curl -s -X POST -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  http://127.0.0.1:8080/v1/admin/audit/verify
```

Checkpoint signing (optional, recommended for production):

```bash
# Ed25519 private JWK file (never commit; mount as secret)
export GATEWAY_AUDIT_CHECKPOINT_PRIVATE_JWK=/run/secrets/enigma-audit-checkpoint.private.jwk
export GATEWAY_AUDIT_CHECKPOINT_PUBLIC_JWKS=/run/secrets/enigma-audit-checkpoint.public.jwks
# Event threshold (default 500; 0 disables event trigger)
export GATEWAY_AUDIT_CHECKPOINT_EVERY_EVENTS=500
# Time threshold seconds (default 900 = 15 minutes; 0 disables)
export GATEWAY_AUDIT_CHECKPOINT_INTERVAL_SECONDS=900
# export GATEWAY_AUDIT_CHECKPOINTING_ENABLED=true
```

Manual checkpoint: `POST /v1/admin/audit/checkpoints` (returns `checkpoint_created` + `anchor_pending`).  
Lifecycle/metrics: `GET /v1/admin/audit/lifecycle`.

On existing Postgres volumes, apply:

```bash
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-audit-integrity.sql

docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-audit-integrity-phase1.sql

docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-audit-checkpoint-lifecycle-phase3b.sql
```

Evidence export: `GET /v1/admin/audit/evidence/export` — see [enigma/audit-evidence.md](./enigma/audit-evidence.md).

### External evidence anchoring (Phase 2 + 3A)

Optional. Does not affect policy decisions or AI request success.

```bash
export GATEWAY_AUDIT_ANCHORING_ENABLED=true
export GATEWAY_AUDIT_ANCHOR_PROVIDER=filesystem   # or s3
export GATEWAY_AUDIT_ANCHOR_LOCATION=/var/lib/enigma/audit-anchors
# Auto-anchor after checkpoint (default true when enabled)
# export GATEWAY_AUDIT_ANCHOR_ON_CHECKPOINT=true

# S3 (customer Object Lock bucket; prefer IAM role — no secrets in DB/UI)
# export GATEWAY_AUDIT_ANCHOR_PROVIDER=s3
# export GATEWAY_AUDIT_ANCHOR_S3_BUCKET=customer-enigma-evidence
# export GATEWAY_AUDIT_ANCHOR_S3_REGION=us-east-1
# export GATEWAY_AUDIT_ANCHOR_S3_PREFIX=prod
```

Apply migrations on existing volumes:

```bash
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-audit-anchoring-phase2.sql
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-audit-anchoring-phase3a.sql
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-action-outcome-phase4.sql
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-action-outcome-phase4.1.sql
```

Manual: `POST /v1/admin/audit/anchors`. Status: `GET /v1/admin/audit/anchors`.  
Retry: `POST /v1/admin/audit/anchors/retry` with `{ "checkpoint_id": "..." }`.

See [enigma/audit-anchoring.md](./enigma/audit-anchoring.md) and [customer-controlled-evidence-storage.md](./customer-controlled-evidence-storage.md).

### Client Outcome receipts (Phase 4 / 4.1)

Authorized clients report downstream execution results via `POST /v1/ai/actions/outcome` after `commit_allowed`. Phase 4.1 claims `(deployment_id, execution_id)` before sealing the authoritative receipt. See [PHASE_4_ENFORCEMENT_OUTCOME.md](./PHASE_4_ENFORCEMENT_OUTCOME.md) and [PHASE_4_1_HARDENING.md](./PHASE_4_1_HARDENING.md).

Apply on existing volumes:

```bash
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-action-outcome-phase4.sql
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-action-outcome-phase4.1.sql
```

Gateway readiness requires `action_outcomes` (with `deployment_id`). Missing Outcome schema yields `/health` **503** `SCHEMA_NOT_READY`.

### Agent/Tool registry (Phase A)

New installs get actor tables from `schema.sql`. On existing volumes:

```bash
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-agent-tool-governance-phase-a.sql
```

### Application BYOK provider credentials

Customer model API keys (OpenAI-compatible) are stored per application, encrypted with `GATEWAY_VAULT_KEY`. New installs get the table from `schema.sql`. On existing volumes:

```bash
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/migrate-provider-credentials.sql
```

Configure in Admin → Applications → application detail (or at create). Appliance env `GATEWAY_EXTERNAL_PROVIDER_API_KEY` remains an optional fallback only.

### Enigma EPA tables (M2)

New installs load `schema-epa.sql` / `seed-epa.sql` via Compose init. On existing volumes:

```bash
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/schema-epa.sql
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/seed-epa.sql
```

Runtime evaluation uses the in-memory Baseline pack interpreters in M2; Postgres tables support administration and future repository loading.

Postgres triggers reject UPDATE/DELETE on `audit_events` (append-only).

Back up `GATEWAY_AUDIT_KEY` with the database; rotation invalidates re-verification of old signatures unless dual-key migration is performed.

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
