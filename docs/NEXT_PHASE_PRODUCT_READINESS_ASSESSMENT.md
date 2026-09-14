# Enigma Next-Phase Product Readiness Assessment

**Nature:** Inspection-only (no code, schema, migration, test, UI, config, or documentation changes beyond this deliverable)  
**Date:** 2026-09-14  
**Inputs:** Architecture and evidence docs listed in the charter; live source under `gateway/src`, `gateway/admin`, `gateway/db`; unit/acceptance tests as proof artifacts  
**Evidence labels:** **Confirmed by code** · **Confirmed by database/schema** · **Confirmed by tests** · **Inferred** · **Not demonstrated**

**Closed workstreams (do not reopen):** Phase 1–3B audit integrity / checkpoint / anchoring; Phase 4 / 4.1 Enforcement → Execution → Outcome evidence (`PASS WITH MINOR FINDINGS`). The remaining multi-process Postgres race proof is a **proof gap**, not a product-blocking defect.

---

## Executive Answer

> **What is the highest-value capability still missing for Enigma to be a credible enterprise AI Governance Gateway?**

**First-class Agent and Tool governance** — durable, server-authoritative registration and authorization of agents and tools as runtime actors, bound to applications, models, and allowed actions — so Enigma no longer depends on **client-attested** `governance_context.agent_authorized` / `tool_authorized` for the core thesis *Agent reasons. Policy decides. Gateway enforces. Evidence proves.*

Evidence and outcome completeness are no longer the limiting product gap. **Agent/tool identity and server-side authorization binding are.**

---

## 1. Sources Reviewed

### Documentation (context; not sole authority)

| Document | Role |
|----------|------|
| `docs/EVIDENCE_ARCHITECTURE_REVIEW.md` | Pre–Phase 4 evidence gaps |
| `docs/PHASE_4_ENFORCEMENT_OUTCOME.md` | Outcome design |
| `docs/PHASE_4_1_HARDENING.md` | Claim-before-seal hardening |
| `docs/PHASE_4_1_FINAL_VALIDATION.md` | Workstream closed |
| `docs/enigma/audit-integrity.md` / `audit-evidence.md` / `audit-anchoring.md` | Integrity stack |
| `docs/customer-controlled-evidence-storage.md` | Customer evidence store |
| `docs/OPERATIONS.md` / `docs/SECURITY.md` | Ops / security posture |
| `docs/architecture/ENIGMA_PRODUCT_READINESS.md` | Earlier readiness baseline (partially stale: Outcome now built) |
| `docs/architecture/ENIGMA_PRODUCT_DIFFERENTIATION.md` | Product thesis / nav intent |
| `docs/connector-model.md` | Connectors planned, not MVP boundary |
| Healthcare domain / pack docs | Regulatory overlays on one EPA |

### Code / schema / tests (authority for this report)

- Runtime: `gateway/src/api/orchestrator.ts`, `server.ts`, `validation.ts`, `app-factory.ts`
- Policy: `gateway/src/policy/enterprise/**` (one `PackBackedEnterprisePdp`, packs, change-governance)
- Models: `gateway/src/models/**`
- Identity: `gateway/src/identity/**`
- Audit / outcome / checkpoint / anchor: `gateway/src/audit/**`
- Admin UI: `gateway/admin/src/**`
- Schema: `gateway/db/schema.sql`, `schema-epa.sql`, outcome/integrity migrations
- Tests: Phase 4.1, HIPAA/CMS pack, control-plane, AI actions, change-governance suites
- Salesforce: **reference client only** (`salesforce-healthcare-demo/.../EnigmaGatewayService.cls`)

---

## 2. Current Architecture Map

Canonical runtime paths **Confirmed by code** (`orchestrator.ts`):

```text
Completions:
  APPLICATION → IDENTITY → INTERROGATION → POLICY → TRANSFORM → MODEL
    → RESPONSE INSPECT → POLICY → TRANSFORM → (detokenize) → AUDIT

Actions (no model):
  APPLICATION → IDENTITY → POLICY → Decision/Consequence
    → commit_allowed | REVIEW hold → CLIENT EXECUTION → OUTCOME → AUDIT
    → CHECKPOINT → ANCHOR (optional)
```

### Stage inventory

| Stage | Exists? | Source files | API | DB / SoR | UI | Evidence |
|-------|---------|--------------|-----|----------|----|----------|
| **Applications** | Yes | `identity/store.ts`, admin routes, `Applications*` | `/v1/admin/applications*` | `applications` | Applications | audit `application_id` |
| **Identity / Actor** | Yes | `identity/service.ts` | Bearer `/v1/ai/*`; admin auth/users/keys | `organizations`, `users`, `api_keys`, `admin_users` | Login, Users | org/user/app on audit |
| **Agent** | **Partial** | request fields; HIPAA/CMS pack gates; change-governance baselines | On AI/action bodies only — **no** `/v1/admin/agents` | **No `agents` table**; `agent_id` on evaluations / `action_outcomes` | Request Context / panels only | evaluation + outcome fields |
| **Tool** | **Partial** | `tool_id` + pack gates; write tiers; baseline `capabilities.tools` | On action bodies only — **no** tool CRUD | **No `tools` table**; `tool_id` on outcomes | Decision/outcome panels | evaluation + outcome |
| **Action** | Yes | `validation.ts` `actionRequestSchema`; `orchestrator.actions` | `POST /v1/ai/actions` | Snapshot in `policy_evaluations` | Decision Review | `CLIENT_COMMIT_ALLOWED` / REVIEW hold |
| **Policy Evaluation** | Yes | `PackBackedEnterprisePdp`, packs, `pg-repository` | Runtime + `/v1/admin/policies*` | EPA: `policy_packs`, `epa_policies`, `policy_versions`, `policy_evaluations`, … | Policies | One evaluation record |
| **Decision** | Yes | `evaluation-record`, `decision-explanation`, `decision-resolution` | `/v1/admin/evaluations*` | `policy_evaluations` (machine `decision` immutable) | Decisions / evaluation detail | `decision_hash` binding |
| **Consequence** | Yes | `deriveDecisionConsequence` | Embedded in evaluation detail | Derived (not a table) | `DecisionConsequencePanel` | API projection |
| **Gateway Enforcement** | Yes | orchestrator; transforms; `models/gateway.ts`; `enforcement-projection` | Enforcement **is** the AI path | Projected from Decision + `audit_events` | Consequence / enforcement UI | operational audit |
| **Execution** | Split | Completions: gateway executes model. Actions: **client** executes | resume APIs; `commit_allowed` | `policy_evaluations.execution` | Review / resume | resume + commit audit |
| **Outcome** | Yes (Phase 4.1) | `outcome.ts`, `outcome-store.ts`, `reportActionOutcome` | `POST /v1/ai/actions/outcome` | `action_outcomes` + sealed receipt | Client Execution Outcome | `CLIENT_OUTCOME_RECEIPT` / CONFLICT |
| **Audit** | Yes | `audit/service.ts`, `pg-service.ts`, integrity | `/v1/admin/audit*` | `audit_events` append-only | Audit | chain / hashes |
| **Checkpoint** | Yes | `checkpoint.ts`, integrity-service | checkpoints / lifecycle admin APIs | `audit_checkpoints` | Audit status (mostly read-only) | signed roots |
| **External Evidence** | Yes | anchoring-service, S3 provider | anchors / evidence export APIs | `audit_evidence_anchors`, jobs | Audit status (read-only) | customer store |

**Evidence quality:** Applications through Decision/Consequence/Enforcement/Outcome/Audit/Checkpoint/Anchor are **Confirmed by code / schema / tests**. Agent and Tool stages are **Confirmed by code/tests as request facts + pack gates**; **Not demonstrated** as first-class registries.

---

## 3. Core Thesis Evaluation

> **Agent reasons. Policy decides. Gateway enforces. Evidence proves.**

| Capability | Rating | Notes |
|------------|--------|-------|
| Agent context | **Partial** | `agent_id` + purpose optional on requests; packs gate on **client-attested** authz. No registry. |
| Policy decision | **Strong** | One EPA / one PDP; multi-pack resolve; durable `policy_evaluations`. |
| Gateway enforcement | **Strong** | Model path blocks/controls; actions authorize-or-hold fail-closed. |
| Human approval | **Adequate** | REVIEW → resolve → resume/commit is real; approver identity claimed, not SSO. |
| Model authorization | **Strong** | Registry + EPA `eligible_models` + Model Gateway executes only eligible. |
| Tool authorization | **Partial** | Explicit `tool_authorized` gates in packs; no server tool allowlist SoR. |
| Action governance | **Strong** | Governed `/v1/ai/actions` with commit claim and REVIEW hold. |
| Execution evidence | **Adequate** | Completions: gateway-executed. Actions: client-executed after authz. |
| Outcome evidence | **Adequate** | Client-reported, claim-before-seal, append-only projection (Postgres). |
| Cryptographic evidence | **Strong** | Integrity chain, checkpoints, anchors; sufficient for product proposition. |
| Cross-domain governance | **Adequate** | Pack overlays (healthcare + framework packs) on one PDP; domain-extensible by design. |

### Partial / Weak explanations

- **Agent context (Partial):** Thesis leads with *Agent*, but the gateway authenticates **applications/API keys**, not agents. Agent presence is optional metadata. Authorization is largely `governance_context.agent_authorized` from the client (**Confirmed by code** HIPAA `agentAuthorizationState` in `packs/hipaa/pack-v2.ts`). Change-governance baselines that encode autonomy/tools are **in-memory only** (**Confirmed by code** `InMemoryChangeGovernanceRepository`; **Not demonstrated** durable SQL).
- **Tool authorization (Partial):** Same attestation pattern; HIPAA requires explicit `tool_authorized=true` when `tool_id` is present, but Enigma does not look up a registered tool grant graph (**Confirmed by code/tests**).
- No capability in the table is rated **Weak** after Phase 4.1; the material product hole is the Partial agent/tool layer, not evidence cryptography.

---

## 4. Agent Governance

### What exists today

| Concern | Status |
|---------|--------|
| Agent identity | Optional `agent_id` string on requests (**Confirmed by code** `validation.ts`) |
| Agent registration | **Missing** — no admin API, no `agents` table (**Confirmed by database/schema**) |
| Agent authorization | Pack evaluation of client `agent_authorized` / `authorization_context` (**Confirmed by code/tests**) |
| Agent↔application | Implicit via authenticated application + request field (**Inferred**); no FK graph |
| Agent↔tool | Request co-occurrence + pack gates; baseline `capabilities.tools` in memory (**Confirmed by code**) |
| Agent↔model | Via application allowlists + EPA eligibility on completions; not agent-scoped SoR |
| Purpose | Optional `purpose` on request (**Confirmed by code**) |
| Action scope | Policy packs + action `kind`/`target`/`attributes`; not agent-scoped registry |
| Autonomy | `AutonomyLevel` on change-governance baselines (**Confirmed by code** types); in-memory store |
| Environment | Application `environment` + deployment mode/airgap (**Confirmed by code/schema**) |
| Lifecycle | Change-governance evaluate/commit APIs; baselines not Postgres-backed |
| Provenance | Appears on evaluation/audit when supplied; not agent-entity history |

### Can Enigma answer the enterprise question?

> Which agent is attempting this action, on whose behalf, using which tool, against what target, for what purpose, and under what authorization?

| Clause | Answer today |
|--------|----------------|
| Which agent | Only if client sends `agent_id` — not registry-validated |
| On whose behalf | Application + optional user from API key — **Strong** |
| Which tool | Only if client sends `tool_id` |
| Against what target | Action target attributes when provided — **Adequate** |
| For what purpose | Optional purpose / pack facts — **Partial** |
| Under what authorization | **Client attestation** + policy decision — **not** gateway-owned agent grant |

**Largest gap:** Server-authoritative agent (and tool) identity and grants. Salesforce demo behavior must not be mistaken for platform architecture.

---

## 5. Tool Governance

| Concern | Status |
|---------|--------|
| Tool identity / registration | Request `tool_id` only; **no** tools registry |
| Tool authorization | Client `tool_authorized` + packs |
| Risk / scope / write restrictions | Write-field tiers and pack rules; baseline tool write flags in memory |
| Tool↔agent / app relationships | Not first-class |
| Invocation evidence | Evaluation + outcome `tool_id` when reported |

### Enforcement pattern desired

```text
Agent A → Tool X → Action Y → Resource Z   ALLOW
Agent A → Tool X → Action Y (prohibited)   DENY
```

**Today:** Policy can DENY/REVIEW based on attested facts and pack rules (**Confirmed by tests** CMS/HIPAA). Enigma **cannot** independently assert that Agent A is registered and granted Tool X for Action Y against Resource Z without trusting the client.

**Largest remaining tool gap:** Same as agents — **first-class registration + server-side grant evaluation** before pack overlays refine regulatory posture.

---

## 6. Model Governance

Architecture holds **Confirmed by code**:

> Models supply available models → EPA decides eligible models → Model Gateway executes only eligible models.

| Concern | Status |
|---------|--------|
| Identity / provider / version / status | `models` + `providers` tables; admin Models UI |
| Authorization / eligibility | `restrictions.eligible_models` on evaluation |
| Routing / local vs external / airgap | `DefaultModelGateway`; airgap local-only fence |
| Historical “why this model then?” | Eligibility snapshot on `policy_evaluations.restrictions` when recorded (**Confirmed by code**); older records may lack rich snapshot (**Inferred** / noted in UI as `not_recorded`) |
| Risk / environment | Application + deployment mode; not a separate model-risk SoR |

**Verdict:** Model governance is a **relative strength**. It is not the highest-value next build versus agent/tool first-classness.

---

## 7. Policy Architecture

**Confirmed by code/tests:** One Enterprise Policy Architecture — `PackBackedEnterprisePdp` composes baseline + regulatory/framework overlays into **one** `policy_evaluations` record. Legacy `DeterministicPolicyEngine` is rollback-only.

| Dimension | Coverage |
|-----------|----------|
| Definition / version / packs / obligations / restrictions | EPA schema + admin lifecycle |
| Precedence / conflicts | Explicit resolution taxonomy; unresolved → REVIEW |
| AI / subject / resource context | Mapped into evaluation |
| Knowledge access | Partial — datasets table exists; connector fetch path is architectural (**docs/connector-model.md**), not the live enforcement center |
| Model selection | Strong |
| Data access (in-request) | Transform TOKENIZE/REDACT/DENY on completions path |
| Tool invocation / agent actions / writes | Via actions path + packs; registry gap above |
| External transmission / outputs | Obligations + response policy + airgap |
| Human approval | REVIEW consequence — **Confirmed** |

**Significant missing policy dimension:** Not another regulatory pack — **authoritative runtime subjects for agents/tools** that packs can bind without client attestation. Architecture remains one EPA if agent/tool grants become inputs to the same PDP.

---

## 8. Healthcare Regulatory Architecture

Packs present under `gateway/src/policy/enterprise/packs/`: **HIPAA**, **42 CFR Part 2**, **ONC HTI-1**, **CMS**, plus framework packs (NIST, ISO, OWASP, EU AI Act, SOC2, …). All compose through the common overlay path (**Confirmed by code**).

**Regulatory policy coverage vs runtime enforcement:** Additional healthcare packs alone add less commercial value than closing the **runtime actor (agent/tool) enforcement** gap. Buyers already get multi-pack healthcare composition; they cannot yet treat agents as governed enterprise principals.

**Recommendation:** Do **not** prioritize new regulatory packs for next phase.

---

## 9. Cross-Domain Architecture

**Confirmed by design and code pattern:** Domain packs are overlays, not separate engines. Financial / Legal / Insurance / Life Sciences / Government can follow the same pack registration model.

**Caveat (Inferred):** Without first-class agents/tools, every domain re-inherits the same attestation trust model. Domain extensibility of **policy** is strong; domain extensibility of **runtime actor governance** inherits the agent/tool gap.

---

## 10. Human Approval

**Confirmed by code/tests:** Human review is a **policy consequence** (`REVIEW`), not an action type.

```text
Machine Decision REVIEW
  → safety hold (fail-closed wire)
  → Human Resolution AUTHORIZE | DENY
  → RESUME / client resume_evaluation_id
  → CLIENT_COMMIT_ALLOWED
  → Client Execution
  → Outcome
```

### Approver context

| Context | Available? |
|---------|------------|
| Subject / application / action / policy / reason / consequence | Yes (Decision UI) |
| Requested vs authorized model | Yes (`DecisionModelGovernancePanel`) |
| Agent / tool | Only if present on request — no registry enrichment |
| Target / execution context | Action review presentation + held request |
| Evidence / outcome | Consequence + outcome panels; outcome often NOT_REPORTED until client posts |

**Material approval-quality gap:** Approver cannot see **gateway-validated** agent/tool grants, risk class, or approved scope — only client-supplied IDs and attested flags. Approver identity remains a claimed string, not SSO (**Confirmed by earlier product docs + resolve API**).

---

## 11. Runtime Decision Quality

Operators **can** understand why Enigma allowed, controlled, reviewed, or denied an action when evaluation records are complete: explanation, pack contributions, obligations, restrictions, human resolution, enforcement projection, outcome (**Confirmed by UI + APIs**).

Friction:

- Console attention/triage surfaces partially gated off (**Confirmed by admin code**).
- Agent/tool denials lack a first-class narrative beyond pack reason codes.
- Audit verify/checkpoint/anchor/export are **API-ahead of UI** (read-only status).

UI shows the **authoritative decision** (`policy_evaluations`), not merely logs — **Strong** for decision investigation.

---

## 12. Audit and Evidence

Phase 1–4.1 chain is complete for the intended appliance:

```text
Policy Evaluation → Decision → Consequence → Enforcement
  → Execution → Outcome → Audit → Checkpoint → Anchor
```

**Genuine remaining gaps (non-blocking for next product capability):**

1. Multi-process Postgres outcome race **Not demonstrated** by integration test (proof gap).
2. Outcome remains **client-reported** (by design).
3. Operator-driven verify/export UX incomplete.

**Do not** recommend more cryptography, blockchain, Merkle trees, KMS/HSM, or additional storage providers as the next product move.

---

## 13. Outcome Limitations

> Outcome is client-reported execution evidence, not independent downstream verification.

**Would independent verification materially improve commercial value?**  
**Yes, selectively** — for regulated write paths where the buyer must prove EHR/system-of-record mutation matched authorization (healthcare write-back, financial posting).

| Question | Assessment |
|----------|------------|
| Who verifies? | Downstream system of record or a connector adapter — **not** generic crypto on Enigma alone |
| Generic vs optional? | **Optional**, connector/domain-specific |
| Belong in Enigma or client? | **Shared contract**: Enigma defines verification receipt schema; connected systems or Enigma connectors perform verification |
| Now? | **Defer** until agent/tool governance and connector strategy are clearer |

Independent verification is **not** the single highest-value next capability versus closing client-attested agent/tool authz.

---

## 14. Control Plane Differentiation

| Conventional AI Control Plane | Enigma today |
|-------------------------------|--------------|
| Inventory / catalogs | Partial (apps, models; not agents/tools) |
| Observability / scoring / GRC dashboards | Present but secondary; some Console cards smell GRC |
| Policy management | Strong — **executable** packs |
| Runtime allow/deny | **Strong** — gateway is on the path |

**What Enigma does at runtime that inventory/GRC does not:**

> **Can this AI action happen right now?** — Policy evaluates → Gateway blocks or authorizes → Evidence records decision, enforcement, and (for actions) client outcome.

That question is demonstrable for **applications + models + completions/actions**. It is **not** yet demonstrable as *“Can this registered agent use this registered tool for this action right now?”* without trusting the client.

---

## 15. Gateway Differentiation — Enforcement Reality

| Plane | Enforcing? |
|-------|------------|
| Model invocation | **Yes** — DENY / empty eligibility / airgap fence |
| In-request data / transforms | **Yes** — TOKENIZE/REDACT/DENY |
| Outputs | **Yes** — response policy BLOCK/RELEASE |
| Tool calls / writes | **Authorize-or-hold**; does **not** execute customer DML |
| External transmission | Obligations + local-only / airgap |

**Major enforcement gap:** Not observe-only — but **agent/tool authorization is not gateway-owned**, so enforcement of agent scope is only as strong as client honesty + pack reactions to attested flags.

---

## 16. Zero-Trust / Boundary Model

> Applications cannot use AI except through the Enigma Gateway.

| Aspect | Reality |
|--------|---------|
| Technical choke point | Real for traffic that calls Enigma (**Confirmed by code**) |
| Network compulsion | **Inferred** customer VPC routing / firewall — not enforced in application code |
| Air-gapped / local models | **Confirmed** deployment mode + local runtime health |
| Agents / tools / data providers | Boundary is **integration**, not universal interception of all enterprise AI |

Enigma is a **strong enforcement boundary when integrated**, not a magical network-wide AI interceptor. Product honesty should keep that framing.

---

## 17. Customer Deployment Readiness

| Capability | Status |
|------------|--------|
| Deployment ID | **Confirmed** `deployment-identity` / `system_config` |
| Licensing | **Confirmed** signed license install; AI routes gated |
| Customer VPC | Packaging/docs exist; topology outside app (**Inferred**) |
| Air-gapped | **Confirmed** config + fences |
| Evidence storage | Customer-controlled S3 path **Confirmed by code** when configured |
| Ops monitoring | Health, DB stats, audit lifecycle APIs; UI partial |
| Ordinary admin without Foundry360 | Apps, policies, models, decisions, users, license — **Adequate**; agent/tool lifecycle and evidence operator actions still thin |
| Change-governance baselines | **Not** durable across restart without Postgres store — ops risk (**Confirmed by code**) |

**VPC:** Realistic for a prepared customer with runbooks. **Air-gap:** Supported technically; ordinary ops still need polished evidence/admin journeys.

---

## 18. Product UI Assessment

Navigation (**Confirmed** `SidebarNav.tsx`): Console, Applications, Policies, Decisions, Models, Audit; Administration → Users/System.

| Journey | Assessment |
|---------|------------|
| 1 Governance posture | Partial — Insights on; triage/attention often gated |
| 2 Investigate decision | Strong |
| 3 Approve action | Adequate — path clear; queue not first-class |
| 4 Why denied | Strong for policy; weaker for agent/tool narrative |
| 5 Execution / outcome | Adequate — honest `client_reported` labeling |
| 6 Verify evidence integrity | Weak UX — APIs exist, UI mostly passive |
| 7 Model authorization | Strong on decision detail |
| 8 Manage deployment | Adequate under Administration |

Nav accurately represents an **application- and policy-centric** product. Missing **Agents/Tools** is a product gap, not a cosmetic rename issue.

---

## 19. Commercial Product Readiness (Buyer Lens)

| Buyer | Answer today | Unanswered / weak |
|-------|--------------|-------------------|
| **CIO** | Governed AI gateway appliance with policy→enforce→prove | “How do we govern our agent fleet?” |
| **CISO** | Fail-closed AI egress/actions; integrity evidence | Trust in client-attested agent/tool authz |
| **CDAO** | Executable multi-pack governance | Agent purpose/scope as managed objects |
| **Compliance / Legal** | Decision provenance + audit/checkpoint/anchor + outcome receipts | Independent SoR verification (deferred); agent accountability chain |
| **AI Platform** | Sits in front of models; EPA + Model Gateway | Agent/tool registry integration points |
| **Application teams** | API key + `/v1/ai/completions` / `/v1/ai/actions` / outcome | Must self-attest agent/tool authorization |
| **Operations** | Docker/VPC/airgap + license + System UI | Baseline durability; evidence operator actions |

**Real product gap for buyers:** *Governed agents and tools as first-class enterprise objects*, not more evidence math.

---

## 20. Competitive Differentiation (Architectural)

Without web research, architectural contrast:

| Category | Typical center | Enigma center |
|----------|----------------|---------------|
| AI Control Plane | Inventory + risk | Runtime decision + enforce |
| AI Gateway | Routing / keys | Policy-backed allow/deny |
| Guardrails | Content filters | Multi-pack EPA + obligations |
| API Gateway | HTTP policy | AI-specific decision + evidence |
| GRC | Assessments | Executable packs + decisions (avoid drifting to scorecards) |
| Observability | Telemetry | Decision SoR + integrity chain |
| Model governance platforms | Model catalog | Catalog **plus** per-request eligibility enforcement |
| Agent governance platforms | Often inventory/graph | Enigma has the **enforcement plane** but lacks the **agent/tool SoR** |

Differentiation is strongest when Enigma owns **Decide + Enforce + Prove** for agentic actions. That requires first-class agents/tools.

---

## 21. Top Remaining Gaps (≤10)

| Priority | Gap | Business impact | Technical impact | Differentiation impact | Recommended? |
|----------|-----|-----------------|------------------|------------------------|--------------|
| **P0** | Server-authoritative **Agent & Tool** registry + grant evaluation (replace client attestation as sole authz) | Blocks credible agentic enterprise sale | Touches identity, PDP inputs, actions path, schema, admin UI | Highest — completes the thesis | **Yes — next** |
| **P1** | Durable change-governance baselines (Postgres) | Lifecycle claims don’t survive restart | Repository swap + migration | Medium — supports agent lifecycle | Yes (with P0 or immediately after) |
| **P1** | Approver context enrichment from registry (agent/tool scope, grants) | Better human REVIEW quality | Decision UI + resolve inputs | Medium | Yes (depends on P0) |
| **P2** | Operator evidence actions (verify / checkpoint / export) in Audit UI | Ops/compliance self-serve | Admin UI over existing APIs | Low–medium | Yes, small |
| **P2** | Console posture / pending REVIEW queue as first-class | Faster operator response | Enable gated Console surfaces | Low–medium | Yes, small |
| **P2** | SSO-bound human resolution actor | Auditability of approvers | IdP integration | Medium for enterprises | Later |
| **P3** | Independent execution verification (optional connectors) | Stronger write-path proof | Connector/SoR adapters | High in niches | Defer |
| **P3** | Enterprise data connectors as governed fetch path | Broader data-plane control | New subsystem | Medium | Defer (per connector-model) |
| **P3** | Additional regulatory packs | Sales checkbox | Pack authoring | Low vs runtime gaps | Defer |
| **P3** | Multi-process Postgres outcome race integration test | Proof completeness | Test only | None product | Optional later; **not** Phase 4.1 reopen |

No P0 security defect found in Phase 4.1 that warrants reopening evidence hardening.

---

## 22. Single Highest-Value Next Capability

### Capability

**First-class Agent and Tool Governance** — durable registration of Agents and Tools as governed runtime objects; server-side authorization binding to Applications (and optionally Models); PDP evaluation that **derives** agent/tool authorization from gateway state rather than trusting client `governance_context.*_authorized` as the sole grant; admin surfaces and decision/approval enrichment.

### Why now

1. Evidence workstream is **closed**.  
2. Model path is already strong.  
3. Thesis and buyer language lead with **Agent**, but code still treats agents as optional strings + attestations.  
4. Healthcare packs already assume agent/tool concepts — they need a substrate.  
5. Highest differentiation vs inventory control planes and vs “AI gateway as proxy.”

### Product value

Unlocks: *Governed agentic actions* — “Agent A may use Tool X for Action Y on Resource Z under Policy P, now,” with evidence that names registered principals.

### Architectural fit

```text
Applications
  → Agents (registered)
      → Tools (registered grants)
          → Action
              → PackBackedEnterprisePdp (same one EPA)
              → Gateway Enforcement
              → Execution / Outcome / Audit …
```

Fits **before** PDP as authoritative facts; does **not** create a second PDP.

### Differentiation

Moves Enigma from “policy gateway for apps/models” to “runtime governance for **agentic** enterprise AI.”

### Scope (minimum meaningful)

1. Schema: `agents`, `tools`, agent↔app, agent↔tool (± action/operation scope) grants; deployment isolation.  
2. Admin API + UI: register/suspend agents and tools; bind to applications.  
3. Runtime: on `/v1/ai/actions` (and completions when `agent_id`/`tool_id` present), **resolve grants server-side**; treat client `*_authorized` as optional hints or deprecate as sole authority.  
4. Persist resolved agent/tool authorization facts on `policy_evaluations`.  
5. Decision/Review UI shows registry-backed agent/tool context.  
6. Tests: allow/deny grant matrix; attestation cannot invent grants.

### Explicit non-scope

- New regulatory packs  
- Phase 4.1 / outcome concurrency reopen  
- Blockchain / Merkle / extra crypto  
- Independent SoR verification  
- Salesforce-specific agent model  
- Full MCP platform  
- GRC assessment scorecards  
- Renaming nav for cosmetics  

---

## 23. Hardening Cycle Guardrail

**No genuine architectural defect found** that justifies another Phase 4.1 / evidence cryptography cycle. Minor proof gaps remain documented and accepted.

---

## 24. Final Recommendation

## Current State

Enigma is a real AI Governance Gateway: one EPA, strong model eligibility enforcement, fail-closed actions with human REVIEW, and a completed decision→enforcement→outcome→integrity evidence chain on Postgres. The platform is **ready to advance product capability**. The limiting credibility gap for enterprise **agent** governance is not evidence depth — it is the absence of first-class, server-authoritative Agents and Tools.

## Strongest Capabilities

1. One Enterprise Policy Architecture with multi-pack resolution and durable decisions  
2. Model supply → EPA eligibility → Model Gateway enforcement  
3. Gateway fail-closed enforcement on completions and governed actions  
4. Human REVIEW as consequence with immutable machine decision  
5. Phase 1–4.1 audit integrity, checkpoints, anchors, and client outcome receipts  

## Material Remaining Gaps

1. First-class Agent & Tool registry and server-side grants  
2. Durable (Postgres) change-governance baselines for agent/tool lifecycle  
3. Approval context lacking registry-validated agent/tool scope  
4. Operator evidence verify/export UX lagging APIs  
5. Optional independent execution verification (future, connector-scoped)  

## Highest-Value Next Capability

**First-class Agent and Tool Governance (server-authoritative).**

## Why This Capability

It is the missing half of the product thesis: without it, Enigma governs applications and models well, but **agentic** runtime authority remains client-attested — exactly where enterprise buyers and CISOs will probe next.

## Recommended Implementation Sequence

1. **Registry + grants + runtime resolution** (schema, API, PDP inputs, actions path, tests)  
2. **Admin UI + Decision/Review enrichment** (operators manage and understand agents/tools)  
3. **Durable lifecycle baselines** (persist change-governance; bind autonomy/tool changes to registered agents)

## Explicitly Defer

- Further Phase 4.1 / outcome concurrency / audit crypto / blockchain / Merkle / new anchor providers  
- Additional healthcare or framework packs as the primary bet  
- Independent SoR verification platform  
- Broad enterprise connector suite / MCP-as-boundary  
- SSO (until after agent/tool SoR, unless a specific enterprise deal blocks)  
- Salesforce-specific architecture  

## Final Assessment

**READY FOR NEXT PRODUCT CAPABILITY**

> **Phase 4.1 and the Enforcement → Execution → Outcome evidence workstream should remain closed. The next engineering effort should address the highest-value product capability identified by this assessment — First-class Agent and Tool Governance — rather than additional evidence hardening.**
