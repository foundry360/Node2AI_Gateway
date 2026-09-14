# Phase A — First-Class Agent and Tool Governance

**Status:** Implemented  
**Date:** 2026-09-14  
**Design:** `docs/AGENT_TOOL_GOVERNANCE_DESIGN.md`  
**Scope:** Phase A only (no Agents/Tools UI, no durable change-governance)

---

## Architecture

Agent and Tool registries are an **authorization substrate**, not a second PDP.

```text
Authenticate Application
  → Resolve User
  → ActorRegistry.resolve (when mode ≠ off and agent_id/tool_id present)
  → RuntimeActorFacts (server-authored)
  → Map into governance_context.*_authorized
  → PackBackedEnterprisePdp (ONE evaluation)
  → Consequence → Gateway enforcement
  → (actions) Execution → Outcome (Phase 4.1 unchanged)
```

**Invariant:** The client may identify an Agent/Tool. The client may not authorize them in `enforce` / `shadow` modes.

---

## Schema

Migration: `gateway/db/migrate-agent-tool-governance-phase-a.sql`  
Also reflected in `gateway/db/schema.sql`.

| Table | PK | Purpose |
|-------|-----|---------|
| `agents` | `(deployment_id, agent_id)` | Agent identity, status, autonomy |
| `tools` | `(deployment_id, tool_id)` | Tool identity, status, declared `operations` |
| `agent_application_bindings` | `(deployment_id, agent_id, application_id)` | App may present Agent |
| `agent_tool_grants` | `(deployment_id, agent_id, tool_id)` | Explicit `allowed_operations` (empty ≠ allow-all) |

Lifecycle: Agent/Tool `ACTIVE|SUSPENDED|RETIRED`; Binding `ACTIVE|SUSPENDED`; Grant `ACTIVE|REVOKED`.

---

## Runtime resolution

**Confirmed by code / Implemented:**

- Module: `gateway/src/actors/`
- Wired in `GatewayOrchestrator.resolveRuntimeActors` before `policy.evaluateRequest`
- Stores: `InMemoryActorRegistry`, `PostgresActorRegistry`
- Operation key: `action.kind ?? operation` (`normalizeRequestedOperation`)
- Tool auth requires agent auth + ACTIVE tool + ACTIVE grant + declared + granted operation

---

## Compatibility modes

Config: `GATEWAY_ACTOR_REGISTRY_MODE` → `GatewayConfig.actorRegistryMode`

| Mode | Behavior |
|------|----------|
| `off` | Legacy: client `agent_authorized` / `tool_authorized` unchanged. **createPhase1Gateway defaults to `off`** so existing unit fixtures keep working. |
| `shadow` | Resolve registry; server facts authoritative; client values retained under `client_attested` / mismatch flag for migration visibility. |
| `enforce` | Production default in `loadConfig`. Server facts authoritative; client booleans never elevate authorization. |

Clients never choose the mode.

---

## Failure behavior

| Condition | Result |
|-----------|--------|
| Registry error / DB failure during resolve | `registry_error` + unauthorized facts → EPA **DENY** (fail-closed) |
| `enforce`/`shadow` + agent/tool IDs + missing `actorRegistry` / `resolveDeploymentId` | Unauthorized facts with `REGISTRY_UNAVAILABLE` → **DENY** (never client fallback) |
| Unknown agent/tool | `registered=false`, `authorized=false` → **DENY** |
| Cross-app / cross-deployment | Unauthorized → **DENY** |
| Suspended/retired | Unauthorized → **DENY** |

Unknown authorization is never treated as authorized.

---

## Policy integration

Shared baseline rules in `interpretBaselineInput`:

- `agent_id` present + `governance_context.agent_authorized === false` → **DENY** (`AGENT_UNAUTHORIZED`)
- `tool_id` present + `governance_context.tool_authorized === false` → **DENY** (`TOOL_UNAUTHORIZED`)

Packs (HIPAA, CMS, …) continue to read `governance_context.*_authorized`; those values are **server-derived** in enforce/shadow. No pack-specific registries. No second PDP.

---

## Evidence snapshot

When resolution runs, `RuntimeActorFacts` are:

1. Embedded in `governance_context.runtime_actor`
2. Persisted on `policy_evaluations.ai_context.runtime_actor` via `toInputEvaluationRequest`

Historical evaluations keep the snapshot even if the Agent is later suspended.

---

## Admin mutation audit

Minimal administrator APIs (not Phase B UI):

- `GET/POST /v1/admin/agents`, suspend/resume/retire
- `PUT /v1/admin/agents/:id/applications/:applicationId`
- `GET/POST /v1/admin/tools`, suspend
- `PUT /v1/admin/agents/:id/tools/:toolId` (grant upsert/revoke)

Mutations call `recordAdminAudit` with actions such as `agent_created`, `agent_suspended`, `tool_grant_upserted`, etc. Same audit ledger — not a second evidence system.

---

## Deployment isolation

All registry rows and resolve queries are scoped by installation `deployment_id` from `DeploymentIdentityStore`. Client-supplied deployment IDs are never used as authority.

---

## Migration approach

1. Apply SQL migration on appliance volumes.
2. Run with `shadow` or register Agents/Tools/bindings/grants via admin API.
3. Set `GATEWAY_ACTOR_REGISTRY_MODE=enforce`.
4. Update clients to identify registered `agent_id` / `tool_id`; stop relying on attestation for authority.

Non-agentic requests (no `agent_id` / `tool_id`) are unchanged.

---

## Test results

| Suite | Result |
|-------|--------|
| Phase A unit (`agent-tool-governance-phase-a.test.ts`) | **14/14** |
| Full gateway unit + acceptance | **1053/1053** |
| Phase 4 / Phase 4.1 | Included in full suite — **pass** |
| Gateway `tsc` | **pass** |
| Gateway `npm run build` | **pass** |
| Admin `tsc` | **pass** |

Regression note: tests that previously asserted only HIPAA/CMS-specific unauthorized reason codes now assert shared `AGENT_UNAUTHORIZED` / `TOOL_UNAUTHORIZED` from the Enterprise baseline (packs may still reinforce when they evaluate).

---

## Known limitations (Deferred)

| Item | Status |
|------|--------|
| Agents/Tools admin UI / nav | Phase B |
| Decision Review panel enrichment UX | Phase B (snapshot already on evaluation) |
| Durable Postgres change-governance baselines | Phase C |
| Agent-level model allowlists | Deferred |
| Resource-level grant ABAC | Deferred |
| SSO / agent credentials | Deferred |
| MCP | Deferred |
| Forcing every write to name an Agent | Deferred |
| Process-local registry cache | Not implemented (correctness via DB/memory store) |

---

## Evidence labels

| Claim | Label |
|-------|-------|
| Schema + repositories | **Implemented** / **Confirmed by database/schema** |
| Resolve-before-PDP | **Confirmed by code** |
| Modes off/shadow/enforce | **Implemented** |
| Baseline substrate DENY | **Confirmed by code** / **Confirmed by tests** |
| Phase 4.1 intact | **Confirmed by tests** |
| UI | **Deferred** |
