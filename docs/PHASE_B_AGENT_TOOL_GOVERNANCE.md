# Phase B — Agent & Tool Governance Operations

**Status:** Implemented  
**Date:** 2026-09-14  
**Depends on:** Phase A (`docs/PHASE_A_AGENT_TOOL_GOVERNANCE.md`)  
**Design:** `docs/AGENT_TOOL_GOVERNANCE_DESIGN.md`

---

## Architecture (unchanged)

```text
Application
    ↓
User
    ↓
Agent / Tool Registry
    ↓
RuntimeActorFacts
    ↓
EPA / PDP
    ↓
ONE Authoritative Decision
    ↓
Enforcement
    ↓
Review / Execution
    ↓
Outcome
    ↓
Evidence
```

**No second PDP.** Agent/Tool admin UI and grants manage the authorization substrate only.

---

## Shadow mode semantics

`GATEWAY_ACTOR_REGISTRY_MODE=shadow`:

- Server registry facts are **authoritative** for `governance_context.*_authorized`.
- Client attestation is retained under `client_attested` / `client_attested_actor` and `mismatch` for comparison/diagnostics.
- Client attestation never authorizes.

---

## Features

| Area | Capability |
|------|------------|
| Agents UI | `/agents`, `/agents/[id]` — register, lifecycle, bindings, grants |
| Tools UI | `/tools`, `/tools/[id]` — register, lifecycle, operations, agent grants |
| Grants | Create / update allowed operations / revoke via existing `PUT .../agents/:id/tools/:toolId` |
| Decisions | `DecisionRuntimeActorPanel` from historical `ai_context.runtime_actor` |
| Audit | Existing `recordAdminAudit` actions (`agent_created`, `tool_grant_*`, …) |
| Hardening | Enforce/shadow fail closed if registry deps missing; response eval uses server-resolved governance context |

---

## Navigation

```text
Console → Applications → Agents → Tools → Policies → Decisions → Models → Audit → System
```

---

## Legacy engine

`GATEWAY_ALLOW_LEGACY_ENGINE=true` remains an explicit operational compatibility switch. It is **not** the default production authorization posture. Phase B does not broaden the legacy bypass.

---

## Tests

- `gateway/tests/unit/agent-tool-governance-phase-a.test.ts` — Phase A regression
- `gateway/tests/unit/agent-tool-governance-phase-b.test.ts` — shadow, positive ALLOW, registry unavailable, admin enrichment
