# Enigma First-Class Agent and Tool Governance — Architecture Design

**Nature:** Inspection and design only (no production code, schema, migration, test, UI, or configuration changes)  
**Date:** 2026-09-14  
**Primary inputs:** `docs/NEXT_PHASE_PRODUCT_READINESS_ASSESSMENT.md`; live code under `gateway/src`, `gateway/admin`, `gateway/db`  
**Evidence labels:** **Confirmed by code** · **Confirmed by database/schema** · **Confirmed by tests** · **Proposed architecture** · **Inferred** · **Not demonstrated**

**Invariant preserved:**

> Agent reasons. Policy decides. Gateway enforces. Evidence proves.  
> One Enterprise Policy Architecture. One PDP. One decision. One enforcement path.

**Role of this design:** Agents and Tools are **authorization substrates** (identity, status, relationships, grants). They are **not** a second PDP, policy engine, or Salesforce-specific model.

---

## 1. Sources and method

Reviewed:

| Source | Use |
|--------|-----|
| `docs/NEXT_PHASE_PRODUCT_READINESS_ASSESSMENT.md` | Highest-value next capability |
| Evidence / Phase 4 / 4.1 docs | Outcome compatibility constraints |
| `docs/architecture/ENIGMA_PRODUCT_DIFFERENTIATION.md` | Product object model / nav intent |
| `docs/connector-model.md` | MCP/connectors deferred |
| `gateway/src/api/orchestrator.ts`, `validation.ts` | Runtime request path |
| `gateway/src/policy/enterprise/**` | One PDP, pack facts, change-governance |
| `gateway/db/schema.sql`, `schema-epa.sql` | Persistence reality |
| `gateway/admin` SidebarNav / Applications / Models patterns | Admin conventions |

`docs/AGENT_TOOL_GOVERNANCE_DESIGN.md` did not previously exist; this document is the first design artifact.

---

## 2. Current-state verification

### Agents

| Assumption | Result | Evidence |
|------------|--------|----------|
| No authoritative `agents` table | **Confirmed** | `schema.sql` / EPA schema have no `agents` table |
| `agent_id` is request/evaluation context | **Confirmed by code** | `validation.ts` optional `agent_id`; orchestrator passes through to PDP; stored in `ai_context` / held_request / outcomes |
| Agent authorization can depend on client attestation | **Confirmed by code/tests** | `governance_context.agent_authorized`; HIPAA `agentAuthorizationState` in `packs/hipaa/pack-v2.ts` |
| Change-governance is not a durable agent registry | **Confirmed by code** | `InMemoryChangeGovernanceRepository`; baselines use `target_type: 'application' \| 'model' \| 'system'` — not `agent`; seed naming may use `agent_*` as `target_id` under `application` (**Confirmed** readiness assessment) |

### Tools

| Assumption | Result | Evidence |
|------------|--------|----------|
| No authoritative `tools` table | **Confirmed by database/schema** | No `tools` table; `tool_id` only on `action_outcomes` and request JSON |
| `tool_id` is request/action context | **Confirmed by code** | Completions + actions schemas; outcome binding |
| Tool authorization depends on request facts + packs | **Confirmed by code/tests** | `tool_authorized`; HIPAA requires explicit `tool_authorized=true` when `tool_id` present |
| No server-owned agent→tool grant graph | **Confirmed** | No grant tables; in-memory baseline `capabilities.tools` only |

**Correction to assumptions:** None material. One nuance: `authorization_context` (string) remains a separate client/regulatory fact channel from `agent_authorized`/`tool_authorized` booleans (**Confirmed by code**). Both are currently client-supplied.

---

## 3. Authoritative object model

### Recommended hierarchy

```text
Deployment
  └── Organization
        └── Application  (existing)
              └── AgentApplicationBinding
                    └── Agent
                          └── AgentToolGrant
                                └── Tool
                                      └── (declared operations JSON — not separate rows in MVP)
                                            └── Action request (existing action.kind / operation)
                                                  └── EPA Decision
```

### Object decisions

| Object | First-class persist? | Why | Owns | Does NOT own | Lifecycle | Audit history |
|--------|----------------------|-----|------|--------------|-----------|---------------|
| **Agent** | **Yes** | Thesis runtime actor; closes attestation gap | Identity, status, org ownership, default autonomy, metadata | Policy decisions; user identity; application auth | ACTIVE / SUSPENDED / RETIRED | Admin mutations via admin audit; runtime via evaluation snapshot |
| **Tool** | **Yes** | Capability being invoked must be registry-real | Identity, status, declared operations, metadata | Action instances; policy; DML execution | ACTIVE / SUSPENDED / RETIRED | Same |
| **AgentApplicationBinding** | **Yes** | Prevents cross-app agent hijack | Which apps may present which agent | Tool grants; policy | ACTIVE / SUSPENDED | Yes (grant-like) |
| **AgentToolGrant** | **Yes** | Minimum authz graph | Agent may invoke Tool (± operation allowlist) | Regulatory allow/deny; resource ABAC beyond list | ACTIVE / REVOKED | Yes |
| **Tool operation (table)** | **No (MVP)** | Avoid duplicating Action architecture | — | — | — | Declared on Tool as `operations TEXT[]` / JSONB |
| **Agent action scope (table)** | **No (MVP)** | Scope via grant operations + existing Action + EPA | — | — | — | Optional later |
| **Agent model scope** | **Defer** | App + EPA eligibility already strong | — | — | — | Optional Phase C fact |
| **Agent autonomy level** | **Yes, as Agent field** | Already in change-governance types; feed as **fact** | Default autonomy label | Decisions (EPA still decides) | Changes are config, not decisions | Snapshot on evaluation |

**Principle:** Persist only what the Gateway must resolve **without trusting the client**. Do not invent a generic IAM catalog.

---

## 4. Agent identity

### Distinctions (must not collapse)

| Concept | Authority today | Authority after this design |
|---------|-----------------|----------------------------|
| **Application identity** | API key → `applications` | Unchanged |
| **User / Actor identity** | Optional `user.id` + identity store | Unchanged (not SSO in this phase) |
| **Agent identity** | Client string `agent_id` | **Registry row** matched by `(deployment_id, agent_id)` |
| **Agent authorization** | Client `agent_authorized` | **Server-derived** from registry status + application binding (+ later grants) |

### Trust questions Enigma must answer

| Question | Resolver |
|----------|----------|
| Is `agent_123` registered? | `agents` lookup by deployment + id |
| Is it active? | `status = ACTIVE` |
| Does it belong to this application? | `agent_application_bindings` ACTIVE for `(agent_id, application_id)` |
| Permitted in this deployment? | All rows scoped by `deployment_id` |
| May this request act as that agent? | Authenticated application must hold binding; optional future: agent credential — **out of MVP** (application key remains the network principal) |

**Proposed architecture:** The **application** remains the authenticated principal. The **agent** is a governed *acting identity* the application is allowed to assert. Clients **identify** (`agent_id`); they do **not** authorize.

---

## 5. Application → Agent binding

### Cardinality

| Relation | MVP recommendation |
|----------|-------------------|
| Application → Agents | **Many** (one app may run multiple agents) |
| Agent → Applications | **Many allowed**, but each binding is explicit (**Proposed**) |
| Ownership | Agent owned by `organization_id`; bindings constrain which apps may use it |

### Lifecycle

- Create agent (RETIRED not default; create as ACTIVE or SUSPENDED)
- Bind to application(s)
- Suspend agent → all bindings unusable for new authz (bindings remain historically)
- Suspend binding → that app cannot use agent; other apps unaffected
- Retire agent → permanent non-use; retain row for historical FK/snapshots

### Enforcement when Application A claims Agent B unbound

**Expected outcome:**

```text
Actor resolution: agent_registered=true|false, agent_bound_to_application=false
→ EPA facts → DENY (baseline/runtime actor rules)
→ Gateway enforces DENY / fail-closed
→ Evaluation persists with registry snapshot (historical)
```

Do **not** silently strip `agent_id` and continue as a non-agent request when the client asserted an agent — that would hide misuse (**Proposed** fail-closed).

---

## 6. Agent → Tool binding

### Minimum useful grant model

```text
Agent A → Tool X → operations[]   (optional allowlist)
```

| Model | Verdict |
|-------|---------|
| Agent→Tool only (any operation) | Too coarse for write tools |
| Agent→Tool→Operation | **MVP minimum** |
| Agent→Tool→Operation→Resource | **Defer** — resource/target remains on Action + EPA packs |

**Grant row (proposed):**

- `deployment_id`, `agent_id`, `tool_id`
- `allowed_operations` JSONB array (empty/null = **no operations** fail-closed, **or** explicit `*` only if admin sets `allow_all_declared_operations=true` — prefer **explicit list**, no implicit `*`)
- `status` ACTIVE | REVOKED
- Optional `write_permitted` boolean as a coarse fact for packs (**Proposed**, mirrors change-governance `tools[].write`)

**Resource/action scope** continues to live on existing `action.{kind,target_id,attributes}` and EPA — grants do not replace policy.

---

## 7. Tool identity

### Fields that matter for runtime governance

| Field | Required MVP | Purpose |
|-------|--------------|---------|
| `tool_id` | Yes | Stable identity |
| `deployment_id` | Yes | Isolation |
| `organization_id` | Yes | Tenancy |
| `name` | Yes | Operator UX |
| `status` | Yes | ACTIVE / SUSPENDED / RETIRED |
| `operations` | Yes | Declared capability vocabulary |
| `description` | Optional | UX |
| `provider` / `version` | Optional | Metadata only — not a software catalog |
| `environment` | Optional | Align with app env if needed; else omit |

**Purpose of Tool:** establish *what capability is invoked* and whether the agent is granted it — not a CMDB.

---

## 8. Tool operations vs Action architecture

**Preferred model (validated):**

```text
Tool
  → declares capabilities (operations[])

Action request
  → describes actual operation (existing operation / action.kind)

Grant
  → Agent may use Tool for subset of declared operations

EPA
  → decides whether that operation is allowed in context (regulatory, purpose, risk, …)
```

| Concept | Role |
|---------|------|
| `tools.operations` | Catalog of invocable operation ids for that tool |
| Request `operation` / `action.kind` | Concrete requested operation (**Confirmed** existing actions path) |
| Grant `allowed_operations` | Substrate: is this agent allowed to ask for that operation on that tool? |
| EPA | Policy: is this ask permitted *now* given purpose, data, packs, REVIEW, etc.? |

**Do not** create a parallel Action engine or replace `POST /v1/ai/actions`.

**Matching rule (proposed):** Normalize request operation key as `action.kind ?? operation`. It must be ∈ Tool.operations and ∈ Grant.allowed_operations for substrate grant success.

---

## 9. Agent autonomy

**Confirmed by code:** `AutonomyLevel = ASSISTIVE | HUMAN_APPROVED | AUTONOMOUS` on change-governance baseline capabilities (`change-governance/types.ts`).

### Where autonomy belongs

| Placement | Recommendation |
|-----------|-----------------|
| On **Agent** | **Yes** — default profile field |
| On AgentApplicationBinding | Optional override later; not MVP |
| On AgentToolGrant | No — too fragmented |
| As policy decision | **No** — autonomy is configuration **fact** |

```text
Agent.autonomy_level  →  runtime fact  →  EPA packs may REQUIRE REVIEW for AUTONOMOUS writes, etc.
```

Autonomy **must not** short-circuit EPA. Packs already pattern-match governance facts; autonomy becomes another server-derived fact.

**Change-governance interaction:** When baselines later persist, autonomy changes become lifecycle changes that may require REVIEW — **Phase C**, not MVP blocker.

---

## 10. Agent → Model relationship

**Current (Confirmed):** Models supply → EPA `eligible_models` → Model Gateway executes only eligible; application `allowed_models` participates.

**MVP recommendation:** **Do not** add agent-level model allowlists yet. Application + EPA remain sufficient.

**If added later:** Agent model allowlist is a **restriction fact** intersected into EPA eligibility inputs (same path as app allowlists) — never a second model gateway.

---

## 11. Server-side authorization resolution

### Runtime sequence (**Proposed architecture**)

```text
1. Authenticate Application (API key)           [existing]
2. Resolve User/Actor if present               [existing]
3. If agent_id or tool_id present (or actions path with tool):
     ActorRegistry.resolve(deployment, app, agent_id?, tool_id?, operation?)
4. Produce RuntimeActorFacts (server-authored)
5. Merge into PDP request context
     - overwrite/ignore client agent_authorized/tool_authorized as authority
6. PackBackedEnterprisePdp.evaluate → ONE policy_evaluations row
7. Consequence → Gateway Enforcement
8. (Actions) client execution → Outcome → Audit → Checkpoint → Anchor
```

### Where resolution occurs

**Confirmed insertion point:** `GatewayOrchestrator` immediately after principal resolution and **before** `policy.evaluate*` — same layer that already attaches `allowed_models` / `governance_context` (**Confirmed by code** `orchestrator.ts`).

### Critical invariant

> The client may identify the Agent and Tool. The client may not grant authorization to the Agent or Tool.

---

## 12. Client-attested fields

| Field | Recommendation |
|-------|----------------|
| `agent_id` / `tool_id` | **Retain** as client **identification** |
| `agent_authorized` / `tool_authorized` | **Retain for wire compatibility** but **never authoritative** when registry enforce mode is on; server sets derived booleans |
| `authorization_context` | **Retain** as purpose/regulatory attestation channel (treatment, consent tokens, etc.) — distinct from agent/tool grants; packs continue to interpret; **not** a substitute for registry |

### Compatibility modes (**Proposed**)

| Mode | Behavior |
|------|----------|
| `off` | Legacy: packs use client flags (current behavior) — **dev/test only** |
| `shadow` | Resolve registry; log/compare; still evaluate with **server facts** when resolvable, else legacy — **migration** |
| `enforce` | Registry authoritative; client `*_authorized` ignored for authority; missing/invalid registry → unauthorized facts → DENY |

**Default for production appliances:** `enforce` once MVP ships. Do not weaken enforce mode to preserve broken clients.

---

## 13. EPA integration

### Forbidden

```text
Agent PDP / Tool PDP / Agent Policy Engine / Tool Policy Engine
```

### Required pattern

```text
ActorRegistry
  → RuntimeActorFacts (authoritative)
  → PackBackedEnterprisePdp (unchanged engine)
  → applyRegulatoryOverlays
  → single policy_evaluations record
```

### Facts injected into PDP context (**Proposed**)

Persist under evaluation `ai_context` and/or `context.runtime_actor` (name TBD in implementation) — structure example:

```json
{
  "runtime_actor": {
    "mode": "enforce",
    "agent": {
      "id": "agent_123",
      "registered": true,
      "status": "ACTIVE",
      "bound_to_application": true,
      "autonomy_level": "HUMAN_APPROVED",
      "authorized": true
    },
    "tool": {
      "id": "tool_x",
      "registered": true,
      "status": "ACTIVE",
      "granted_to_agent": true,
      "operation": "update_patient",
      "operation_declared": true,
      "operation_granted": true,
      "authorized": true
    },
    "substrate": {
      "agent_authorized": true,
      "tool_authorized": true,
      "reason_codes": []
    }
  }
}
```

Packs read **server** `substrate.agent_authorized` / `tool_authorized` (mapped into existing `governance_context` fields after resolution) so HIPAA/CMS continue to work with minimal pack churn:

**Proposed mapping:** After resolution, orchestrator sets:

```text
governance_context.agent_authorized = facts.substrate.agent_authorized
governance_context.tool_authorized  = facts.substrate.tool_authorized
```

and stores full `runtime_actor` snapshot for evidence. Client-supplied booleans are discarded or moved to `client_attested` for forensics only.

### What `policy_evaluations` must retain

- Full `runtime_actor` snapshot (not live joins)
- Effective `governance_context` as evaluated
- Existing explanation / provenance / restrictions

---

## 14. Regulatory pack integration

**Confirmed by code:** HIPAA/CMS derive agent/tool gates from `agent_id`/`tool_id` + `governance_context.*_authorized` (+ CMS interop flags).

**Design:**

- **No** pack-specific registries
- **No** healthcare-only agent authz
- Packs consume the **same** `RuntimeActorFacts` via mapped `governance_context` flags + optional richer `runtime_actor` fields later
- Domain packs may still DENY/REVIEW based on purpose, Part 2, CMS interop, etc., **after** substrate grants succeed

---

## 15. Decision semantics

Registry/substrate establishes **facts**. EPA produces **decision**.

| Case | Substrate facts | EPA outcome (expected) |
|------|-----------------|------------------------|
| 1 Registered agent + granted tool + op + policy allows | authorized | **ALLOW** (or APPLY_CONTROLS) |
| 2 Tool not granted to agent | `tool_authorized=false` | **DENY** |
| 3 Agent not registered | `agent_authorized=false` | **DENY** |
| 4 Agent suspended | unauthorized | **DENY** |
| 5 Tool suspended | unauthorized | **DENY** |
| 6 Grants OK; policy prohibits | authorized substrate | **DENY** |
| 7 Grants OK; policy needs human | authorized substrate | **REVIEW** |

**Baseline rule (proposed):** If `agent_id` present and `agent_authorized=false` → DENY. If `tool_id` present and `tool_authorized=false` → DENY. Absence of both agent and tool → no actor substrate requirement (non-agentic traffic unchanged).

Completions with only `agent_id` (no tool): resolve agent binding only; tool facts `n/a`.

---

## 16. Human approval

Approver must see registry-backed vs client-claimed clearly.

| Field | Source |
|-------|--------|
| Application, User | Identity (existing) |
| Agent id/name/status/autonomy/bound | **Registry snapshot** on evaluation |
| Tool id/name/status/operation/grant | **Registry snapshot** |
| Requested Action / Target / Purpose | **Request** (held_request / ai_context) |
| Authorization context | Request (regulatory attestation) |
| Policy / Decision / Consequence | EPA + projection (existing) |
| Client attested `*_authorized` | Show only as **non-authoritative** if retained |

**UI label requirement:** “Registered & authorized” vs “Client claimed (ignored)” when enforce mode.

---

## 17. Evidence model

### Snapshots (must not depend on live registry)

| Store | New / enriched content |
|-------|------------------------|
| `policy_evaluations.ai_context` / `context` | `runtime_actor` full snapshot at decision time |
| `held_request` | Include resolved actor facts used for REVIEW hold |
| `audit_events.metadata` | agent_id, tool_id, substrate reason codes, evaluation_id (existing patterns) |
| `action_outcomes` | Continue server-derived agent_id/tool_id from authz (**Confirmed** Phase 4.1) — enrich with optional snapshot hash later if needed |

Historical question answered:

> Which registered Agent used which registered Tool for which Action, under what substrate authorization, and what did EPA decide?

**Without** re-reading current agent/tool rows.

---

## 18. Lifecycle

### States

| State | Agent | Tool | Binding | Grant |
|-------|-------|------|---------|-------|
| ACTIVE | Usable | Usable | Usable | Usable |
| SUSPENDED | Not usable | Not usable | Not usable | — |
| RETIRED | Permanent | Permanent | — | — |
| REVOKED | — | — | — | Grant end |

Align naming with applications (`active`/`suspended`) or uppercase enums — implementation choice; semantics above matter.

### History rule

Suspending an agent **must not** mutate past `policy_evaluations`. Past decisions remain valid historical records with their snapshots.

---

## 19. Change governance

**Confirmed:** In-memory baselines; types already include TOOL_ADDED, AUTONOMY_LEVEL, AGENT_INSTRUCTION, etc.

| Change type | Govern via change-governance? | Phase |
|-------------|------------------------------|-------|
| Create agent/tool | Admin RBAC sufficient for MVP | A/B |
| Grant/revoke tool | Admin RBAC + admin audit MVP; lifecycle REVIEW later | A/B → C |
| Autonomy change | Should eventually require materiality/REVIEW | **C** |
| Durable Postgres baselines | P1 from readiness assessment | **C** (after registry exists) |

**Recommendation:** Durable change-governance is **subsequent** to Agent/Tool MVP, not a blocker for registry enforce mode. MVP records admin audit events for register/suspend/grant/revoke.

---

## 20. Security model (adversarial)

| # | Attack | Prevention |
|---|--------|------------|
| 1 | Invent Agent ID | Lookup miss → unauthorized → DENY |
| 2 | Claim authz for unregistered Tool | Tool not registered / not granted → DENY; client `tool_authorized` ignored |
| 3 | Use Agent bound to another App | Binding check fails → DENY |
| 4 | Valid Tool not granted to Agent | Grant miss → DENY |
| 5 | Change Tool ID after authorization | Outcome/resume context binding (**Confirmed** Phase 4.1) + held_request match; mismatch fails |
| 6 | Change Agent ID after authorization | Same binding checks on resume/outcome |
| 7 | Change operation after authorization | held_request / outcome operation binding (**Confirmed**) |
| 8 | Replay across deployments | `deployment_id` on all registry rows + audit/outcome isolation (**Confirmed** pattern) |
| 9 | Suspended Agent executes | Status ≠ ACTIVE → unauthorized |
| 10 | Suspended Tool executes | Status ≠ ACTIVE → unauthorized |

---

## 21. Deployment isolation

**Confirmed pattern:** `deployment_id` on audit chain, checkpoints, anchors, `action_outcomes` PK.

**Proposed:** Every `agents`, `tools`, bindings, grants row includes `deployment_id`. Primary keys include deployment (or unique `(deployment_id, agent_id)`). Resolution always uses installation deployment identity from `DeploymentIdentityStore`.

No cross-deployment grant, list, or evaluate.

---

## 22. API design

Follow Applications/Models conventions (**Confirmed** `/v1/admin/applications`, `/v1/admin/models`).

### Recommended surface

```text
# Agents
GET    /v1/admin/agents
POST   /v1/admin/agents
GET    /v1/admin/agents/:agentId
PATCH  /v1/admin/agents/:agentId          # metadata, autonomy; not status shortcuts alone
POST   /v1/admin/agents/:agentId/suspend
POST   /v1/admin/agents/:agentId/resume     # SUSPENDED → ACTIVE
POST   /v1/admin/agents/:agentId/retire

# Application bindings
GET    /v1/admin/agents/:agentId/applications
PUT    /v1/admin/agents/:agentId/applications/:applicationId
DELETE /v1/admin/agents/:agentId/applications/:applicationId   # suspend/remove binding

# Tools
GET    /v1/admin/tools
POST   /v1/admin/tools
GET    /v1/admin/tools/:toolId
PATCH  /v1/admin/tools/:toolId
POST   /v1/admin/tools/:toolId/suspend|resume|retire

# Grants
GET    /v1/admin/agents/:agentId/tools
PUT    /v1/admin/agents/:agentId/tools/:toolId    # set allowed_operations
DELETE /v1/admin/agents/:agentId/tools/:toolId    # revoke
```

All **administrator** (or existing admin capability roles) — not application API-key callable.

Nested under applications (`/v1/admin/applications/:id/agents`) is acceptable **additionally** for UX, but agents should remain addressable as first-class IDs.

---

## 23. UI design

### Navigation recommendation

```text
Console
Applications
Agents          ← first-class
Tools           ← first-class
Policies
Decisions
Models
Audit
Administration
```

**Why first-class (validated):** Readiness assessment P0; operators must manage actor inventory independently of a single application; Decisions already show agent/tool as request attributes — management needs a home. Nesting only under Applications would hide shared tools and multi-app agents.

**MVP screens:**

1. Agents directory + detail (bindings, grants, status)
2. Tools directory + detail (operations, status)
3. Application detail: linked agents (read + deep link)
4. Decision / Review: runtime_actor panel (registered vs claimed)

---

## 24. Migration / compatibility

| Client type | Behavior in `enforce` |
|-------------|------------------------|
| Sends no agent_id/tool_id | Unchanged non-agentic path |
| Sends ids + attested true without registry | **DENY** (ids present but unauthorized) |
| Registers then sends ids | Works |
| Legacy attested-only without ids | Unchanged |

**Migration path:**

1. Ship schema + admin APIs; mode `shadow`
2. Register agents/tools used by reference clients (incl. Salesforce demo as **example**, not architecture)
3. Flip `enforce`
4. Update reference client to stop relying on attestation for authority

Optional: if `agent_id` omitted on `/v1/ai/actions` write path, keep current policy behavior — do **not** require agents for all actions on day one (**Proposed**: require registry only when client supplies `agent_id` and/or `tool_id`). Stricter “all writes must name an agent” can be a later policy pack rule.

---

## 25. Data migration

- **Do not** invent historical Agent/Tool rows for past evaluations
- Existing `agent_id`/`tool_id` strings in evaluations/outcomes remain opaque historical labels
- New evaluations add `runtime_actor` snapshots when resolution runs
- Coexistence: string ids remain the join key to new tables for **new** traffic only

---

## 26. Performance

**Proposed:**

- Resolve agent + binding + tool + grant in **one DB round-trip** (JOIN) or ≤2 queries per request
- Process-local LRU cache keyed by `(deployment_id, agent_id, application_id, tool_id)` with short TTL and **invalidate on admin mutate**
- No per-pack registry calls
- Memory mode: in-memory registry store parallel to other stores (**tests**)

Target overhead: sub-millisecond cache hit; single-digit ms cache miss on local Postgres — acceptable before PDP (**Inferred**).

---

## 27. Failure behavior

| Failure | Behavior |
|---------|----------|
| Registry DB error / unavailable | **Fail-closed**: do not authorize; DENY or 503 with DENY-equivalent enforcement; never ALLOW |
| Grant lookup fails | Unauthorized facts → DENY |
| Status indeterminate | Treat as unauthorized |
| Mode `off` + DB down | Existing behavior (legacy) — not for production |

> Unknown authorization must not silently become authorized.

---

## 28. Evidence and outcome compatibility

**Must not break:** Phase 4 / 4.1 claim-before-seal, `execution_id`, outcome context binding, audit chain, checkpoints, anchors.

**Enrichment only:**

- Authz audit / held_request / evaluation already carry agent_id/tool_id — keep server-derived
- Outcome continues to bind from authorization evidence (**Confirmed** `deriveAuthorizedOutcomeContext`)
- Optional: include `runtime_actor.snapshot_hash` in outcome metadata later — not required for MVP

No separate evidence system.

---

## 29. Salesforce

Reference client only. Demo may register Enigma Clinical Agent + tools via admin APIs and send ids. **No** Salesforce object model in Gateway schema.

Same model for EHR, custom apps, future connectors.

---

## 30. MCP (architectural only)

MCP tools can later map to Enigma `tools` rows (`provider: mcp`, operations = MCP tool methods). Agents remain Enigma agents. **No MCP work in this phase**; object model does not preclude it.

---

## 31. Minimum viable implementation

### Schema (required)

```text
agents (
  deployment_id, agent_id, organization_id,
  name, status, autonomy_level, metadata, created_at, updated_at
)
tools (
  deployment_id, tool_id, organization_id,
  name, status, operations JSONB, metadata, created_at, updated_at
)
agent_application_bindings (
  deployment_id, agent_id, application_id, status, created_at, updated_at
  PK (deployment_id, agent_id, application_id)
)
agent_tool_grants (
  deployment_id, agent_id, tool_id,
  allowed_operations JSONB, status, created_at, updated_at
  PK (deployment_id, agent_id, tool_id)
)
```

### Runtime

- `ActorRegistry.resolve` before PDP on completions/actions when agent_id/tool_id present
- Map substrate → `governance_context.*_authorized`
- Persist `runtime_actor` on evaluation

### Policy

- Baseline (or small shared runtime-actor rules): unauthorized agent/tool → DENY
- Existing packs continue using mapped flags

### Evidence

- Snapshot `runtime_actor` on `policy_evaluations`
- Admin audit for registry mutations

### Admin

- CRUD/suspend/retire agents & tools; bind apps; grant/revoke tools

### UI

- Agents + Tools nav; Decision runtime actor panel

### Tests (invariants)

1. Client cannot invent agent authorization  
2. Cross-application agent denied  
3. Ungranted tool denied  
4. Suspended agent/tool denied  
5. Cross-deployment isolation  
6. Policy can still DENY/REVIEW when substrate allows  
7. Historical evaluation retains snapshot after suspend  
8. Outcome binding still works (Phase 4.1 regression)  
9. One evaluation record; no second PDP  

---

## 32. Explicit non-scope

- New regulatory packs · GRC scorecards · blockchain · extra crypto/evidence providers  
- Independent downstream verification · full MCP · generic IAM / service catalog  
- Salesforce-specific governance · broad connectors · SSO · agent marketplace  
- Agent-level model allowlists (defer) · resource-level grant ABAC (defer)  
- Durable change-governance Postgres (Phase C) · forcing agents on all non-agentic traffic  

---

## 33. Implementation sequence

### Phase A — Substrate + runtime + EPA facts

Schema, registry stores (PG + memory), resolve-before-PDP, fact mapping, baseline DENY rules, unit tests, config mode `off|shadow|enforce`. **Shipable as enforcement capability even before rich UI.**

### Phase B — Admin API + UI + Decision/Review enrichment

Admin routes, Agents/Tools pages, application linkage, runtime_actor on Decision/Human Review, reference-client registration guide.

### Phase C — Lifecycle hardening

Postgres-backed change-governance baselines; autonomy/grant change materiality → REVIEW; optional agent model restrictions; stricter “writes require registered agent” pack rule if desired.

**Rationale vs splitting EPA to Phase B:** Without EPA fact injection, a registry is inert. Phase A must include evaluation integration.

---

## 34. Success criteria

Demonstrate end-to-end:

```text
Registered Agent → Registered Tool → Authorized Grant
  → Requested Action → EPA Evaluation → Decision
  → Gateway Enforcement → Execution → Outcome → Evidence
```

And prove:

- Client cannot invent or expand authorization  
- Client cannot bypass registry status  
- Client cannot cross deployment or application bindings  
- Historical evidence is self-contained  
- **One EPA** remains authoritative  

---

## 35. Final recommendation

## Architecture Decision

Introduce deployment-scoped **Agent** and **Tool** registries with **Agent↔Application bindings** and **Agent↔Tool grants** (operation allowlists). Resolve these **server-side before** `PackBackedEnterprisePdp`, inject authoritative substrate facts into the existing governance context, and let the **single EPA** decide ALLOW / DENY / REVIEW. Client `agent_authorized` / `tool_authorized` become non-authoritative compatibility fields. No second PDP, no Salesforce-specific model, no parallel evidence system.

## Object Model

```text
Deployment
  └─ Organization
       ├─ Application ──binding── Agent ──grant── Tool
       │                              │             └─ operations[]
       │                              └─ autonomy_level (fact)
       ├─ Models (existing)
       └─ Policy packs → one PDP → policy_evaluations
```

## Runtime Flow

```text
API key → Application (+ User)
  → ActorRegistry.resolve(agent_id?, tool_id?, operation?)
  → RuntimeActorFacts (server)
  → PackBackedEnterprisePdp → policy_evaluations
  → Consequence → Gateway enforce
  → [actions] commit_allowed → client execution → Outcome → Audit → Checkpoint → Anchor
```

## Policy Boundary

| Registry decides (substrate) | EPA decides (policy) |
|------------------------------|----------------------|
| Registered? Active? Bound to app? Tool granted for operation? | Given those facts + purpose/data/regulatory context: ALLOW / DENY / REVIEW / obligations / model eligibility |

## Evidence Boundary

Snapshot at evaluation time: agent/tool ids, statuses, binding/grant results, autonomy, operation, mode, reason codes. Do not rely on live registry for historical explanation.

## MVP

Four tables (agents, tools, bindings, grants); resolve-before-PDP; fact mapping; enforce mode; admin APIs; Agents/Tools UI; Decision enrichment; invariant tests; Phase 4.1 regression.

## Deferred

Change-governance durability; agent model scopes; resource-level grants; SSO; MCP; connectors; independent verification; new packs; forcing agents on all traffic.

## Risks

1. **Compatibility shock** if `enforce` lands before customers register actors — mitigate with `shadow` then `enforce`.  
2. **Pack drift** if some packs bypass mapped flags — mitigate with shared baseline substrate DENY + pack tests.  
3. **Overbuilding IAM** (resource ABAC, catalogs) — mitigate by strict MVP scope and non-scope list.

## Recommendation

**READY FOR IMPLEMENTATION**
