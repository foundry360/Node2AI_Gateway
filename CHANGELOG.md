# Changelog

## v0.1.1-rc.1 — Enigma Enterprise Policy Architecture (design)

### Added
- Product name **Enigma** for the AI Governance Gateway (`gateway/` appliance preserved)
- Architecture pack under `docs/enigma/`: ADR-011 (OPA/Cedar vs domain-native PDP), domain model, data model, evaluation contract, lifecycle, migration plan, policy threat model
- **M1 (Prototype):** `gateway/src/policy/enterprise/` contract types, `EnterprisePolicyAdapter`, `DelegatingEnterprisePdp`; `GATEWAY_POLICY_ENGINE=legacy|enterprise|compare` (default enterprise)
- **M2:** EPA schema/seed (`schema-epa.sql`, `seed-epa.sql`), `PackBackedEnterprisePdp` + Baseline/Response packs, TEST 001–005, compare-mode parity
- **M3:** EPA authoritative (`enterprise`/`shadow`), fail-closed PDP errors, admin validate/simulate/activate/suspend APIs
- **M4:** Admin pack lifecycle UX (Enigma branding), HIPAA/Financial/Legal pack frameworks, deprecate legacy rules JSON + `DeterministicPolicyEngine` (rollback retained)

## v0.1.1 — pre-release hardening

### Fixed / hardened
- Clear local-runtime reason codes: `LOCAL_RUNTIME_UNAVAILABLE`, `LOCAL_MODEL_NOT_READY`, `AIRGAP_LOCAL_RUNTIME_UNAVAILABLE` (no opaque Ollama `INTERNAL_ERROR`)
- Policy enable/disable enforced (`POLICY_DISABLED`); rule JSON remains metadata in v1
- Durable encrypted token vault in Postgres (`token_vault` + `GATEWAY_VAULT_KEY`)
- INSTALL/OPERATIONS: Docker-only guidance and port-conflict checks

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
