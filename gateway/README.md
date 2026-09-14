# Enigma AI Action Governance Gateway

Self-contained appliance under `gateway/`: policy enforcement API, Postgres, optional local models, and admin console.

> Enigma governs AI actions from policy to proof.

**Category:** AI Action Governance  
**Role:** AI Governance Gateway  

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
- Product: [ENIGMA_PRODUCT_1_0](../docs/ENIGMA_PRODUCT_1_0.md) · [Integration contract](../docs/ENIGMA_INTEGRATION_CONTRACT.md)

## Local development (without Docker)

```bash
# terminal 1 — stub runtime for tests/dev
cd gateway && pnpm install && GATEWAY_LOCAL_RUNTIME=stub pnpm dev

# terminal 2
cd gateway/admin
cp .env.local.example .env.local
pnpm install && pnpm dev
```

## Persistence, inference & audit integrity

- `DATABASE_URL` set → Postgres identity, audit, policies, models, encrypted token vault
- `GATEWAY_LOCAL_RUNTIME=ollama` (appliance default) → real local inference; failures surface as `LOCAL_*` reason codes
- `GATEWAY_LOCAL_RUNTIME=stub` → CI / unit tests
- `GATEWAY_VAULT_KEY` → encrypts token vault plaintext at rest (Postgres `token_vault` on appliance)
- Policy admin: enable/disable is enforced (`POLICY_DISABLED`); rule JSON is metadata in v1
- Released responses are SHA-256 hashed; audit events are hash-chained, HMAC-signed, and append-only (tamper-evident immutability — not blockchain). See [security-model.md](../docs/security-model.md#audit-immutability-v1).

Demo API keys in seed data are for pilot scripts only — rotate admin key via `.env` for any customer install.

## Enforcement honesty

- **Gateway-enforced** paths (typical completions): Enigma controls model/transform/block on the path it executes.
- **Client-commit-required** (actions): Enigma issues `commit_allowed`; the client/system performs the external side effect and should report Outcome. Enigma does not claim to have executed that DML.

## Compatibility note

Some package names, default DB users, and internal service identifiers retain the historical `node2ai` namespace for compatibility. The **product** is Enigma. See [ENIGMA_IDENTITY_AND_MIGRATION.md](../docs/ENIGMA_IDENTITY_AND_MIGRATION.md).
