# Changelog

## v0.1.0-ship — 2026-09-03

First **pilot-shippable** Node2AI Gateway appliance release.

### Added
- Ollama service in Docker Compose; `GATEWAY_LOCAL_RUNTIME=ollama|auto|stub`
- Air-gap fail-closed health when local runtime is unavailable
- `install.sh`, `.env.example`, customer docs: INSTALL, OPERATIONS, PILOT_ACCEPTANCE
- GitHub Actions workflow `gateway.yml` (test + typecheck for gateway + admin)
- Postgres-backed admin CRUD: applications, API keys, policies, models
- Admin console create/edit/revoke/enable flows
- Token vault encryption via `GATEWAY_VAULT_KEY`
- Policy seed (`db/seed-policies.sql`)

### Notes
- Ship artifact is `gateway/` (legacy `apps/` is reference only)
- CI uses stub local runtime; appliance defaults to Ollama
- Demo seed API keys are for pilot scripts — rotate admin secrets on install
