# Install Node2AI Gateway Appliance

Pilot-ready Docker Compose appliance. Ship artifact is **`gateway/`** only.

## Prerequisites

- Docker Engine or Docker Desktop with Compose v2
- ~8 GB RAM recommended (Ollama + Postgres + gateway)
- Network for first image pull (air-gap hosts need pre-loaded images/models)

## Quick install

```bash
git clone https://github.com/foundry360/Node2AI_Gateway.git
cd Node2AI_Gateway/gateway
chmod +x install.sh
./install.sh              # connected mode
# ./install.sh airgap     # air-gap mode (local models only)
```

`install.sh` will:

1. Verify Docker / Compose
2. Create `.env` from `.env.example` with generated `POSTGRES_PASSWORD`, `GATEWAY_ADMIN_API_KEY`, and `GATEWAY_VAULT_KEY`
3. Start Postgres, Ollama, gateway, and admin console
4. Optionally pull the recommended local model (`llama3.2`) via Compose profile `model-pull`

## Manual install

```bash
cd gateway
cp .env.example .env
# edit .env — set POSTGRES_PASSWORD, GATEWAY_ADMIN_API_KEY, GATEWAY_VAULT_KEY
docker compose --profile model-pull up --build -d
```

Air-gap:

```bash
docker compose -f docker-compose.yml -f docker-compose.airgap.yml up --build -d
```

## Endpoints

| Service | URL |
|---------|-----|
| Gateway API | http://localhost:8080 |
| Admin console | http://localhost:3080 |
| Postgres (host) | localhost:5433 |
| Ollama (host) | localhost:11434 |

Admin console authenticates to the gateway with `GATEWAY_ADMIN_API_KEY` (printed by `install.sh` on first run).

## Recommended local model

Default: **`llama3.2`** (`GATEWAY_OLLAMA_MODEL`).

Online pull:

```bash
docker compose --profile model-pull up ollama-init
# or
docker exec -it $(docker compose ps -q ollama) ollama pull llama3.2
```

Offline / air-gap import:

1. On a networked machine: `ollama pull llama3.2` then copy `~/.ollama` (or the Compose volume `gateway_ollama_data`).
2. Restore that volume onto the appliance host before starting Compose.
3. Confirm: `curl http://127.0.0.1:11434/api/tags`

Air-gap mode **fail-closes** if Ollama is unreachable (`/health` → 503).

## TLS termination

Terminate TLS in front of the appliance (do not expose 8080/3080 publicly without TLS):

- **Caddy** / **nginx** reverse proxy to `gateway:8080` and `admin:3080`
- Or host firewall + VPN only

Example Caddy snippet:

```
gateway.example.com {
  reverse_proxy 127.0.0.1:8080
}
admin.example.com {
  reverse_proxy 127.0.0.1:3080
}
```

## Verify

```bash
curl -s http://127.0.0.1:8080/health
curl -s -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  http://127.0.0.1:8080/v1/admin/system
```

Then run [PILOT_ACCEPTANCE.md](./PILOT_ACCEPTANCE.md).

## Secrets

- Never commit `.env`
- Rotate `GATEWAY_ADMIN_API_KEY` and DB password for production pilots
- `GATEWAY_VAULT_KEY` encrypts token vault payloads at rest — back it up with Postgres dumps
- `GATEWAY_AUDIT_KEY` (optional; defaults to vault/admin key) HMAC-signs the audit hash chain — back it up with dumps

## Audit immutability (v1)

Released model responses are **SHA-256 hashed**. Audit events are **hash-chained**, **HMAC-signed**, and **append-only** in Postgres. Response plaintext is not stored in the audit table.

This is **tamper-evident cryptographic immutability**, not a multi-party blockchain. See [security-model.md](./security-model.md#audit-immutability-v1).
