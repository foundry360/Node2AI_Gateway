#!/usr/bin/env bash
# Node2AI Gateway appliance installer
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="${1:-connected}" # connected | airgap
PULL_MODEL="${PULL_MODEL:-1}"

# Docker Desktop on macOS often installs the CLI outside default PATH.
export PATH="${HOME}/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:${PATH}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is required. Install Docker Desktop or Docker Engine, then retry."
  echo "If Docker Desktop is installed, open it once and ensure the CLI is available"
  echo "(Settings → General → “Enable default Docker CLI”)."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker CLI found but the engine is not running. Start Docker Desktop and retry."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose v2 is required (docker compose)."
  exit 1
fi

rand_hex() {
  # 32 bytes hex
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p -c 32
  fi
}

if [[ ! -f .env ]]; then
  echo "Creating .env from .env.example with generated secrets..."
  cp .env.example .env
  POSTGRES_PASSWORD="$(rand_hex)"
  GATEWAY_ADMIN_API_KEY="n2ai_admin_$(rand_hex | cut -c1-24)"
  GATEWAY_VAULT_KEY="$(rand_hex)"
  # portable in-place edit
  tmp="$(mktemp)"
  sed \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" \
    -e "s|^GATEWAY_ADMIN_API_KEY=.*|GATEWAY_ADMIN_API_KEY=${GATEWAY_ADMIN_API_KEY}|" \
    -e "s|^GATEWAY_VAULT_KEY=.*|GATEWAY_VAULT_KEY=${GATEWAY_VAULT_KEY}|" \
    .env >"$tmp" && mv "$tmp" .env
  echo "Wrote secrets to .env (keep this file private)."
  echo "  Admin API key: ${GATEWAY_ADMIN_API_KEY}"
else
  echo "Using existing .env"
  # shellcheck disable=SC1091
  set -a && source .env && set +a
  if [[ -z "${POSTGRES_PASSWORD:-}" || -z "${GATEWAY_ADMIN_API_KEY:-}" ]]; then
    echo "ERROR: .env must set POSTGRES_PASSWORD and GATEWAY_ADMIN_API_KEY"
    exit 1
  fi
fi

COMPOSE=(docker compose -f docker-compose.yml)
if [[ "$MODE" == "airgap" ]]; then
  COMPOSE+=(-f docker-compose.airgap.yml)
  echo "Starting in air-gap mode..."
else
  echo "Starting in connected mode..."
fi

if [[ "$PULL_MODEL" == "1" ]]; then
  COMPOSE+=(--profile model-pull)
fi

"${COMPOSE[@]}" up --build -d

echo "Waiting for gateway health..."
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${GATEWAY_PORT:-8080}/health" >/dev/null 2>&1; then
    echo "Gateway is healthy."
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "WARNING: Gateway health not ready yet. Check: docker compose logs gateway"
  fi
  sleep 2
done

echo ""
echo "Node2AI Gateway appliance is up."
echo "  API:   http://localhost:${GATEWAY_PORT:-8080}"
echo "  Admin: http://localhost:${ADMIN_PORT:-3080}"
echo "  Docs:  ../docs/INSTALL.md  ../docs/OPERATIONS.md  ../docs/PILOT_ACCEPTANCE.md"
if [[ "$PULL_MODEL" != "1" ]]; then
  echo "  Model: pull offline or run: docker compose --profile model-pull up ollama-init"
fi
