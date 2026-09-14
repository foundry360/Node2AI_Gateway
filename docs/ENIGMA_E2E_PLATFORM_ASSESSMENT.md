# Enigma End-to-End Platform Assessment

**Nature:** Inspection and assessment only (no implementation)  
**Date:** 2026-09-14  
**Authority:** Repository implementation (`gateway/`), schema, APIs, admin UI, tests, and docs — not roadmap aspiration  
**Test baseline at assessment:** Gateway **1072 / 1072** tests passing (87 files)

---

## 1. Executive Summary

Enigma began as **Node2AI** — a self-hosted, regulated-industry AI stack centered on sanitization and on-prem deployment. The durable product that emerged is the **`gateway/` appliance**: an **AI Governance Gateway** that intercepts AI and tool-mediated attempts, establishes server-side facts, runs **one Enterprise Policy Authority (EPA) / Pack-Backed PDP evaluation**, produces one authoritative **Decision** in `policy_evaluations`, enforces what the Gateway controls, routes REVIEW to a distinct approver, and seals Evidence through Audit / Outcome / Checkpoint / Anchor.

**What Enigma is becoming:** a control plane for **AI Action Governance** — governing consequential AI-mediated attempts from policy to proof — not IAM, not DLP, not SIEM, not generic GRC, and not a universal execution fabric.

**Alignment:** The *implemented* architecture is largely coherent with that purpose. The largest misalignments are commercial and boundary honesty: (1) root monorepo messaging still describes a broader “Node2AI Enterprise Platform”; (2) Overview Insights retain GRC/assessment smells; (3) on the actions path, Decision authority is strong but **execution side effects remain client-dependent**; (4) regulatory pack breadth risks looking like a compliance suite rather than a governance gateway.

**Verdict (preview):** **B — Architecturally strong but requiring foundational Product 1.0 work** before commercial hard-sell. Architecture does **not** require redesign. Scope discipline and enforcement honesty do.

---

## 2. Original Product Intent

### 2.1 What problem was Enigma originally designed to solve?

From root `README.md` and early gateway contracts:

- Enable enterprises in **regulated industries** (healthcare, finance, government) to use AI **without uncontrolled data egress**.
- Provide **self-hosted / air-gapped** deployment rather than SaaS-only AI.
- Put a **mandatory choke point** between applications and models: *ALL AI inputs and responses must pass through the gateway*.

Early framing emphasized **data sanitization**, HIPAA/SOX readiness, and compliance reporting — closer to a regulated AI *platform* than today’s Decision-centric gateway.

### 2.2 Original architectural thesis

From `docs/architecture.md` and the implementation plan:

> **Agent reasons. Policy decides. Gateway enforces.**

Canonical path:

```text
APPLICATION → GATEWAY → IDENTITY → INTERROGATION → POLICY → TRANSFORM
  → MODEL → RESPONSE INSPECTION → POLICY → TRANSFORM → APPLICATION
```

Assumptions:

1. The Gateway is the **sole AI execution boundary**.
2. Policy is **authoritative**; Interrogation and Model Gateway never authorize.
3. Modular monolith is sufficient for Product 1.0.
4. Connectors and rich agent ecosystems are later.
5. Healthcare is an early proving ground, not the only industry.

### 2.3 Assumptions — survived / changed / abandoned

| Assumption | Status | Notes |
|------------|--------|-------|
| Sole AI choke point for governed paths | **Survived** | Completions + actions; no production bypass routes in gateway |
| One policy authority | **Strengthened** | Legacy engine → EPA Pack PDP (default `enterprise`) |
| Interrogation never authorizes | **Survived** | Classification is evidence |
| Gateway executes all side effects | **Changed / weakened** | Completions: yes. Actions: **client commits** after `commit_allowed` |
| Sanitization-as-product | **Narrowed** | TOKENIZE/REDACT remain; product center moved to Decision/Evidence |
| Agent is future/optional | **Changed** | Agent/Tool registries now substrate facts (Phases A/B) |
| Action is implicit (operation + model) | **Changed** | Phase D makes Action an explicit governance context |
| Broad compliance reporting / GRC | **Partially abandoned in architecture; partially retained in UI** | Insights/compliance score still smell like assessment |
| Connectors as core | **Deferred** | Documented; not Product 1.0 spine |
| Root Node2AI apps/packages as product | **Abandoned for Enigma product path** | `gateway/` is the appliance; root README is stale relative to Enigma |

### 2.4 What strengthened vs what introduced risk

**Strengthened the thesis**

- Domain-native EPA (ADR-011) over OPA-as-architecture.
- Durable `policy_evaluations` as Decision SoR.
- Tamper-evident audit, checkpoints, optional external anchoring.
- Explicit REVIEW ≠ requester approval; machine decision immutable.
- Server-authoritative Agent/Tool facts (fail-closed enforce mode).
- Action governance facts without a second PDP.
- Honest documentation of client-commit enforcement boundary.

**Introduced complexity / scope risk**

- Many regulatory/framework packs (healthcare + NIST/ISO/EU/SOC2/…).
- Dual policy stores (`policies` legacy JSON + EPA tables).
- Dual run modes (`shadow`/`legacy`/`compare`) for engines and actor registry.
- Overview Insights heuristics competing with Decision-centric product story.
- Monorepo dual identity (Node2AI platform README vs Enigma gateway).
- Client-reported Outcome necessary but easy to oversell as “proved execution.”

---

## 3. Platform Evolution

| Era | Problem | Capability | Architecture impact | Product impact | Thesis effect |
|-----|---------|------------|---------------------|----------------|---------------|
| **FOUNDATION** (import → appliance ship) | Uncontrolled AI egress | Completions choke point, auth, stub/local model, audit | Modular monolith `gateway/` | Appliance vs cloud SaaS | Strengthened |
| **POLICY v1** | Need deterministic allow/block | `DeterministicPolicyEngine` | Single engine | Pilot ACCEPT/BLOCK | Strengthened |
| **INTERROGATION + TRANSFORM** | Sensitive data to models | Classification, TOKENIZE/REDACT, vault | Evidence → policy → transform | Sanitization as control | Strengthened |
| **AIR-GAP + LOCAL AI** | Regulated offline use | Ollama, airgap compose, outbound fence | Deployment modes | Differentiator | Strengthened |
| **EPA** | Enterprise policy lifecycle & packs | PackBackedEnterprisePdp, `policy_evaluations` | One authoritative PDP | Decision console | Strengthened |
| **HEALTHCARE** | Vertical proof | HIPAA, Part 2, ONC HTI-1, CMS packs | Overlays on same EPA | Credibility + coupling risk | Strengthened with risk |
| **DECISION UX / REVIEW** | Explain & resolve | Decisions UI, resolve/resume, RBAC | Human additive to machine | Control-plane UX | Strengthened |
| **EVIDENCE STACK** | Prove integrity | Hash chain, HMAC, checkpoint, anchor, outcome | Audit as proof layer | Regulated buyer story | Strengthened |
| **AGENT GOVERNANCE** | Client-attested actor auth | Agents registry, bindings | Facts → EPA | Actor substrate | Strengthened |
| **TOOL GOVERNANCE** | Ungoverned tool use | Tools, grants, operations | Facts → EPA | Actor substrate | Strengthened |
| **ACTION GOVERNANCE** | Govern *what* is attempted | `action_governance` snapshot | Context → EPA | Category framing | Strengthened |
| **CURRENT STATE** | Product definition | All of the above coexist | Coherent spine + scope pressure | Must freeze Product 1.0 | — |

**Concise evolution table**

```text
FOUNDATION → POLICY → INTERROGATION/TRANSFORM → AIR-GAP
  → EPA → HEALTHCARE PACKS → DECISION/REVIEW UX → EVIDENCE/OUTCOME
  → AGENT → TOOL → ACTION → CURRENT
```

---

## 4. Current Architecture (from implementation)

### 4.1 Actual runtime architecture (authoritative)

```text
Authenticated Application + User
        ↓
Optional Agent / Tool IDs
        ↓
Actor Registry resolution (off | shadow | enforce)
  → RuntimeActorFacts (facts only)
        ↓
Interrogation (completions) / declared action context (actions)
        ↓
Server-derived RuntimeActionFacts (Phase D)
        ↓
PackBackedEnterprisePdp  ← ONE evaluation
  baseline + applicable pack overlays
        ↓
policy_evaluations (machine Decision immutable)
        ↓
Gateway Enforcement projection
        ├── Completions: transform → model → response policy → release/block
        └── Actions: DENY/REVIEW hold OR commit_allowed (client DML)
        ↓
REVIEW → Approver (ADMINISTRATOR | GOVERNANCE_REVIEWER) → resolve → resume
        ↓
Execution (gateway model OR client system)
        ↓
Outcome (actions: client-reported) → Audit seal → Checkpoint → optional Anchor
```

This is **close to** the intended Application→…→Evidence chain, with two important realities:

1. **Agent/Tool/Action are optional** on ordinary completions.
2. **Execution is split:** Gateway-controlled for model inference; **client-dependent** for external action side effects.

### 4.2 Logical modules (`gateway/src/`)

| Module | Role | Authorizes? |
|--------|------|-------------|
| `api/` | Auth boundary, orchestration, enforcement | Enforces only |
| `identity/` | Org/app/user/API keys | Authenticates |
| `actors/` | Agent/Tool registry facts | **No** (facts) |
| `interrogation/` | Classification evidence | **No** |
| `policy/` | EPA + legacy engine | **Yes** (EPA default) |
| `transform/` | Tokenize/redact/vault | No |
| `models/` | Providers, Ollama, eligibility gate | Never authorizes policy |
| `response/` | Output inspection evidence | No |
| `audit/` | Ledger, integrity, outcome, anchor | No |
| `admin/` | Console RBAC, license, deployment identity | Console authz only |

### 4.3 Intended vs actual

| Claim | Actual |
|-------|--------|
| One EPA/PDP | **Yes** in default `GATEWAY_POLICY_ENGINE=enterprise` |
| Registries not PDPs | **Yes** |
| Gateway enforces all actions | **No** — actions ALLOW is client-commit |
| Action is always present | **No** — optional; completions often operation-only |
| Healthcare is architecture | **No** — packs on common EPA |

---

## 5. Governance Object Model

| Object | Classification | Notes |
|--------|----------------|-------|
| Application | Registry / identity context | Caller of Gateway |
| User | Identity context | Request subject |
| Agent | Registry object → runtime context | Substrate; not Decision |
| Tool | Registry object → runtime context | Substrate; not Decision |
| Operation | Capability / request verb | Grant matching + EPA input |
| Action | **Governance subject / context** | Phase D snapshot; not authority |
| Model | Registry / eligibility substrate | EPA selects eligible set |
| Policy / Pack | Policy source | Feeds EPA |
| Decision | **Authoritative decision artifact** | `policy_evaluations` |
| Review | Governance consequence | Additive human resolution |
| Outcome | Evidence of execution result | Client-reported on actions |
| Evidence / Audit | Proof | Chain / checkpoint / anchor |
| System / Data | Not first-class governance products | May appear as context later |

### True primary object being governed

**Enigma governs AI-mediated attempts (Actions), recorded and controlled through authoritative Decisions.**

- **Primary governance subject:** the Action (completion attempt or tool/write attempt).
- **Primary product/control artifact:** the Decision (`policy_evaluations`).
- Agents, Tools, Models, Applications are **context and substrate**, not the product’s center of gravity.

Proof from use cases:

1. Completions exist to govern whether a model may run on classified content.
2. Actions exist to govern whether an agent may cause a write/side effect.
3. Admin UX centers on **Decisions**, not Action catalogs or Agent PDP screens.
4. Evidence binds to evaluations, not to live registry state.

**Action is therefore:** commercially the category framing (**AI Action Governance**), and architecturally **(B) a critical governance context dimension** whose subject matter is the attempt — while **Decision** remains the durable governed *record*. Not a separate authority (not A as a parallel object system); not merely a capability keyword (not C alone).

---

## 6. Policy Architecture

### Source of truth

- **Runtime authority:** `PackBackedEnterprisePdp` (`gateway/src/policy/enterprise/pack-pdp.ts`).
- **Durable Decision SoR:** `policy_evaluations` (`schema-epa.sql`).
- **Policy definitions:** EPA tables (`policy_packs`, `epa_policies`, `policy_versions`, …).
- **Legacy:** `policies` JSON + `DeterministicPolicyEngine` retained for dual-run/rollback only.

### Combination and conflict

- Baseline interpreter first; overlays contribute; `resolvePackContributions` applies consequence precedence.
- **DENY / CONSEQUENCE_DENY is authoritative** and is not weakened by ALLOW overlays (covered by cross-domain tests).

### Modes

| Mode | Authority |
|------|-----------|
| `enterprise` (default) | EPA |
| `shadow` | EPA authoritative; legacy compared |
| `legacy` / `compare` | Gated by `GATEWAY_ALLOW_LEGACY_ENGINE` |

### Extensibility

New regulatory packs can be added as overlays **without** new engines — confirmed by healthcare + framework pack registration in `packs/regulatory.ts`.

### Risks

- Pack sprawl can make Enigma appear as a GRC content library.
- Legacy path still exists; must remain gated and non-default.
- Client-supplied `governance_context` fields are attestation/evidence for packs — **must never elevate** Agent/Tool authorization (enforce mode strips client authz).

**Determinism:** High for identical inputs + frozen packs; fail-closed on incomplete resource attributes and evaluation failure paths.

---

## 7. Agent Governance

**Problem solved:** Remove dependence on client-attested `agent_authorized` for the thesis *Agent reasons → Policy decides*.

**Implementation:** `agents`, bindings, `RuntimeActorFacts`, modes `off|shadow|enforce`, historical snapshot on Decision.

| Question | Answer |
|----------|--------|
| Overlap with IAM? | Partial — identity of *AI actors*, not enterprise workforce IAM |
| Subject vs context? | **Context / substrate** |
| Second authorization architecture? | **No** — facts feed EPA; baseline DENY uses those facts |
| Historical explainability? | **Yes** — snapshot on evaluation |
| Security? | Strong in `enforce`; weak if left `off` in production |

---

## 8. Tool Governance

**Contribution:** Bind Agent→Tool grants and declared operations so tools cannot be invented at request time.

| Question | Answer |
|----------|--------|
| Core or supporting? | **Supporting substrate** (necessary for agentic actions) |
| IAM overlap? | Capability grant store for AI tools — not enterprise IAM |
| Separate authz system? | **No** |
| Operation-level sufficient? | **For Product 1.0 yes**; richer Action context is additive (Phase D) |

---

## 9. Action Governance

### Technical meaning

Server-authored `ai_context.action_governance`: category, operation, kind, target_id, sanitized attributes, write class, enforcement boundary, client_commit.

### Commercial meaning

The promise that Enigma decides about **what the AI is trying to do**, not only whether a user/app may call a model.

### Evaluation of “Enigma governs AI actions, not merely access”

**Supported with qualification.**

- Supported: Action context enters EPA; Decisions show action panels; write tiers distinguish consequence; unauthorized ops deny; sensitive payloads stripped.
- Qualified: On ALLOW actions, Enigma governs **authorization to commit**, not the external DML itself. Access/eligibility (models, apps) remains a large share of completions traffic.

**Classification:** **B — important governance context dimension** that enables the commercial category **AI Action Governance**, without making Action a second control plane.

---

## 10. Model Governance

Models are a **registration and eligibility substrate**.

- Why: Policy must select *which* models may run; air-gap needs local runtimes.
- EPA produces `eligible_models` / restrictions; Model Gateway is defense-in-depth.
- Not a model marketplace or MLOps platform.

**Classification:** **SUPPORTING / CORE-for-completions** (required for the completions path; not the product category).

---

## 11. Application and User Governance

Enigma **consumes identity** and binds API keys to Applications. It is **not** becoming full IAM.

**Preserve boundaries**

- Workforce SSO/IdP remains external.
- Application is the governed *caller*, not an enterprise app catalog product.
- Admin users/RBAC are console authorization, orthogonal to request EPA.

**Combination:** Governance consuming identity + thin application registry + console RBAC.

---

## 12. Runtime Governance Context

| Fact | Client? | Server? | Trusted? | Snapshotted? | Spoofable? | Necessary? |
|------|---------|---------|----------|--------------|------------|------------|
| Application | Claimed + key-bound | Key wins | Yes | Yes | Cross-app rejected | Yes |
| User id | Client | Bound to request | Medium | Yes | Limited | Yes |
| Agent/Tool authz | Attestation only | Registry in enforce | Yes (enforce) | Yes | No (enforce) | When agentic |
| Operation/kind | Client | Normalized | Declared | Yes | Can claim wrong kind → deny if ungranted | Yes |
| Action category/class/boundary | No | Derived | Yes | Yes | Schema reject / ignored | Yes |
| Purpose / authz context | Client | Passed as evidence | Pack-dependent | Yes | Can lie → policy may REVIEW/DENY | Vertical-dependent |
| Classification | — | Interrogation | Yes | Via evidence | N/A | Completions |
| Model eligibility | — | EPA | Yes | restrictions | No | Completions |
| Deployment id | — | Server | Yes | Context | Isolation enforced | Yes |
| Write field tokens | Client names | Class derived | Names declared | Sanitized | Value stripped | Writes |
| Healthcare gates | Tags / gov context | Pack gates | Mixed | Yes | Over-claim may increase restriction | Vertical |

**Unnecessary expansion risk:** Broad `governance_context` evidence trees (ISO/NIST checkboxes) are useful for packs but can become a **pseudo-GRC questionnaire** if treated as Product 1.0 UX.

---

## 13. Decision Architecture

**`policy_evaluations` is genuinely authoritative** for machine decisions.

Preserved causal chain (with honesty notes):

```text
REQUEST → CONTEXT → POLICY → DECISION → ENFORCEMENT
  → REVIEW (optional) → EXECUTION → OUTCOME → EVIDENCE
```

| Link | Integrity |
|------|-----------|
| Machine decision | Immutable; human resolution additive |
| Historical context | Frozen (`ai_context`, restrictions, explanation) |
| Enforcement | Projected + audited; not always Gateway-executed |
| Outcome | Bound to evaluation; client-reported for actions |
| Evidence | Hash/HMAC chain; checkpoints; optional anchors |

---

## 14. Human Review

**Requester is not the Approver.**

- REVIEW eligibility limited; DENY not “approved away” via review APIs.
- Resolve/resume require `governance_resolve` (**ADMINISTRATOR** or **GOVERNANCE_REVIEWER**).
- Machine decision preserved; final disposition recorded separately.
- Resume is single Decision continuation, not standing write permission.

**Assessment:** Review is a **governance consequence**, not a generic workflow engine. No accidental end-user approval mechanism found on admin resolve path. Clients cannot self-AUTHORIZE via AI APIs.

---

## 15. Enforcement Assessment

### Matrix

| Path | Intercept | Decide | Enforce | Side effect performer | Bypass if client skips Gateway? |
|------|-----------|--------|---------|----------------------|----------------------------------|
| Completions ALLOW | Gateway | EPA | Gateway runs model | Gateway | Yes if app calls model directly |
| Completions DENY/BLOCK | Gateway | EPA | Gateway blocks | None | Same |
| Completions TRANSFORM | Gateway | EPA | Gateway tokenize | Gateway | Same |
| Completions REVIEW | Gateway | EPA | Hold (as BLOCK path) | None until resolve | Same |
| Actions DENY | Gateway | EPA | No commit_allowed | None | Client could still mutate if noncompliant |
| Actions REVIEW | Gateway | EPA | Hold | None until AUTHORIZE+resume | Same |
| Actions ALLOW | Gateway | EPA | Stamp commit_allowed | **Client system** | Noncompliant client can ignore |
| Outcome | Gateway | N/A (evidence) | Seal/conflict detect | Client reports | Client can omit report |

### Classification

| Concern | Class |
|---------|-------|
| Model invocation | **GATEWAY CONTROLLED** |
| Transforms / response release | **GATEWAY CONTROLLED** |
| Actor registry enforce deny | **GATEWAY CONTROLLED** |
| Action ALLOW external DML | **CLIENT DEPENDENT** |
| Outcome truthfulness | **CLIENT DEPENDENT** |
| Direct model/API bypass of Gateway | **NOT ENFORCED** (enterprise architecture control) |
| Registry unavailable (enforce) | **Fail closed** |
| Policy evaluation failure | **Fail closed** |
| Shadow actor mode | Server facts authoritative; compare metadata |
| Legacy engine | Gated; must not be production default |

### Enforcement honesty

Enigma **does** document client-commit. Product and sales risk remains if language equates `commit_allowed` with “Gateway executed the write.”

**Air-gap / Gateway unavailable:** Local apps cannot get governed completions through Enigma; unmanaged direct model use is outside Enigma’s control plane by definition.

---

## 16. Outcomes and Evidence

| Layer | What Enigma knows | Limits |
|-------|-------------------|--------|
| Decision | Full evaluation snapshot | — |
| Enforcement stamp | commit_allowed / blocks / model selection | Not external DML |
| Outcome | Client-reported EXECUTED/FAILED/… | Can be wrong or omitted |
| Audit chain | Append-only hashed events + HMAC | Integrity ≠ completeness of world |
| Checkpoint | Signed roots | — |
| Anchor | Optional external object store | Config/ops dependent |

**Sufficient for regulated buyers?** Credible for **decision + gateway enforcement + receipt-of-outcome** proof. Not sufficient alone as **absolute proof of external system mutation** without client/system trust or tighter integration.

---

## 17. Observability vs Governance

| Lens | Question | Enigma role |
|------|----------|-------------|
| Governance | What should happen? | **Core** — EPA Decision |
| Enforcement | Was it applied (at Gateway)? | **Core** |
| Evidence | Can we prove Decision/result? | **Core** |
| Observability | What happened operationally? | **Supporting** — Audit/Overview |

**Risk:** Overview Insights (compliance score, risk donut, action items) pull Enigma toward **observability/GRC dashboard**. Necessary triage is fine; assessment scoring is not the product.

---

## 18. Healthcare Assessment

| Pack | Plugs into same EPA? | Second PDP? |
|------|----------------------|-------------|
| HIPAA | Yes | No |
| 42 CFR Part 2 | Yes | No |
| ONC HTI-1 | Yes | No |
| CMS | Yes | No |

Healthcare is **(B) the first vertical** and **(C) a proving ground**. It is **not** the core architecture (A), and coupling is **manageable** if packs remain overlays. Risk of **(D) over-coupling** appears if Product 1.0 messaging becomes “HIPAA product” rather than “AI Action Governance with healthcare packs.”

**Must not exist:** HIPAA Action PDP, CMS decision store, healthcare-only approval engine — **none found** as separate authorities.

---

## 19. Security Assessment

### Invariants (supported)

1. One authoritative PDP path (default).
2. Registries = facts.
3. Client claims cannot elevate actor authz in enforce.
4. Deployment isolation on registries/evaluations.
5. Fail closed on registry/policy/audit critical paths (configurable audit fail-closed).
6. Historical snapshots frozen.
7. Requester ≠ approver.
8. Human resolution does not overwrite machine decision.
9. Forbidden security override keys rejected.
10. Strict request schemas.

### Findings

| Severity | Finding |
|----------|---------|
| **HIGH** | Actions ALLOW execution is client-dependent; noncompliant clients can mutate systems while ignoring Gateway. Mitigated only by enterprise integration discipline + Outcome evidence — not Gateway DML control. |
| **HIGH** | Any production use of `GATEWAY_ACTOR_REGISTRY_MODE=off` re-enables client attestation elevation risk for agent/tool paths. |
| **MEDIUM** | Legacy/compare engine modes if enabled incorrectly become dual authority risk. |
| **MEDIUM** | Client-reported Outcome can lie; conflict detection helps but cannot invent ground truth. |
| **MEDIUM** | Broad client `governance_context` evidence can influence pack outcomes if packs trust overstated controls — needs pack discipline. |
| **LOW** | Root README / dual product identity may cause mis-deployment assumptions. |
| **LOW** | Insights heuristics are not security controls but can create false compliance confidence. |

**CRITICAL:** None identified as broken fail-open in default appliance configuration for the governed path itself. The **HIGH** client-commit issue is architectural boundary honesty, not a silent fail-open in Gateway code.

---

## 20. Database / Data Model

### Authoritative

- `policy_evaluations` — Decisions
- EPA policy tables — policy definitions
- `audit_events` (+ counters/checkpoints/anchors) — evidence ledger
- `action_outcomes` — outcome receipts
- `agents` / `tools` / bindings / grants — actor substrate
- `applications` / `api_keys` / `users` / `organizations` — identity
- `models` / `providers` — model substrate

### Derived / dual

- Legacy `policies` table alongside EPA — **duplicate representation risk** (mitigated by default engine mode).
- Consequence/enforcement UI projections — derived, not SoR.

### Mutable historical?

Machine `decision` designed immutable; human_resolution/execution additive. Live registries must not rewrite historical `ai_context` snapshots (architecture + tests assert this).

**No schema change recommended by this assessment** absent Product 1.0 packaging needs.

---

## 21. API Architecture

| Surface | Role |
|---------|------|
| `POST /v1/ai/completions` | Governed model path |
| `POST /v1/ai/actions` | Governed action authorization |
| `POST /v1/ai/actions/outcome` | Outcome evidence |
| `/v1/admin/evaluations*` | Decision, resolve, resume |
| `/v1/admin/agents*` `/tools*` | Substrate admin |
| `/v1/admin/policies*` | Policy lifecycle |
| `/v1/admin/audit*` | Evidence ops |
| `/v1/admin/models*` | Model registry |
| Change-governance evaluate | Admin materiality; uses same PDP |

**Coherence for Product 1.0:** Good. No parallel Action Decision API. Main risks: Insights/admin sprawl, and ensuring public docs emphasize Decision → Enforcement honesty.

---

## 22. UI / UX Assessment

**Nav:** Overview, Applications, Agents, Tools, Policies, Decisions, Models, Audit, Administration.

**Decision detail** can communicate WHO/WHAT/WHY/Review/Enforcement/Outcome via panels (request context, runtime actor, action governance, consequence, model governance, review). This is aligned with **AI Action Governance** when users live in Decisions.

**Still looks partly like generic AI governance/GRC** when Overview Insights lead with compliance scores and action items.

**Biggest UX issue:** Product story is clearest on **Decision detail** and weakest on **Overview** — first impression ≠ category claim.

---

## 23. Deployment Architecture

- Docker Compose: Postgres, Ollama, Gateway, Admin.
- Air-gap overlay: local-only inference, outbound fence, health fails if Ollama down.
- Secrets: vault key, audit key, admin keys, optional license.
- Token vault for transforms.
- Signed offline licensing (Foundry360).

**Readiness**

| Bar | Status |
|-----|--------|
| Pilot / appliance demo | Strong |
| Enterprise production | Strong with ops discipline |
| Regulated industry claim | Strong on Decision/Evidence; qualified on external action execution proof |
| Architectural risks | Dual identity docs; pack sprawl; client-commit dependence |

---

## 24. Testing and Quality

- **~87** test files; **1072** tests green at assessment.
- Buckets: unit, acceptance (phases 1–7), scenarios, healthcare, actor/action adversarial, audit/outcome, resume/review.

**Invariants protected well:** fail-closed, spoof rejection, single PDP, REVIEW rules, historical restrictions, actor enforce, action sanitization, DENY precedence.

**Gaps / weaker proof**

- Multi-process Postgres races (known proof gap).
- Real external system DML noncompliance (by design unenforceable without proxy).
- Full UI E2E browser coverage not the center of the suite.
- Production misconfiguration of `off`/`legacy` modes — config tests exist conceptually; ops still human-dependent.

---

## 25. Architectural Invariants (retained)

Retain all of the following as permanent:

1. One authoritative policy decision path (default EPA).
2. One EPA/PDP for AI evaluations.
3. Registries provide facts, not decisions.
4. Governance through common Decision architecture.
5. Client claims cannot elevate authority.
6. Historical governance context frozen.
7. Requester ≠ approver.
8. Human resolution does not overwrite machine decision.
9. Policy packs contribute to common EPA.
10. Enforcement claims must match actual control.
11. Evidence follows the Decision.
12. Enigma does not become generic IAM.
13. Enigma does not become generic Data Governance.
14. Enigma does not become generic Observability/GRC.
15. Enigma does not become a generic workflow engine.
16. Enigma does not become a universal integration/execution platform.

---

## 26. Scope Creep Analysis

| Capability | Class | Why |
|------------|-------|-----|
| AI Action Decision + Enforcement (Gateway-controlled) | **CORE** | Product spine |
| EPA + packs | **CORE** | Authority |
| Agent/Tool substrate | **SUPPORTING** | Needed for agentic actions |
| Action context facts | **SUPPORTING** | Consequence discrimination |
| Models registry | **SUPPORTING** | Completions path |
| Audit/Outcome/Checkpoint/Anchor | **CORE** (proof) | Regulated proof |
| Interrogation/Transform | **SUPPORTING** | Sensitive completions |
| Air-gap/Ollama | **SUPPORTING** | Deployment differentiator |
| Healthcare packs | **SUPPORTING** (vertical) | Proof + revenue wedge |
| Extra framework packs (ISO/NIST/EU…) | **OPTIONAL** → thin for 1.0 | Content sprawl risk |
| Overview compliance scoring | **DEFER / reduce** | GRC smell |
| Data Catalog / DLP platform | **DO NOT BUILD** | Wrong category |
| System inventory | **DO NOT BUILD** | Wrong category |
| Universal connectors / execution proxy | **DEFER** (integration later) | Boundary explosion |
| Action workflow engine | **DO NOT BUILD** | Review is enough |
| SIEM / observability platform | **DO NOT BUILD** | Audit is supporting |
| Full IAM | **DO NOT BUILD** | Consume IdP |
| Expanded ML model governance suite | **OPTIONAL** | Not moat |
| Enterprise GRC assessments | **DO NOT BUILD** | Contradicts thesis |
| Generic authorization product | **DO NOT BUILD** | Stay AI-action scoped |

---

## 27. Product Category

**Most accurate category today:** **AI Governance Gateway** with an emerging specialty in **AI Action Governance**.

**Can “AI Action Governance” become the primary category?**  
**YES — with conditions.**

Why yes:

- Differentiates from IAM, API gateways, model catalogs, and GRC tools.
- Matches Decision + Action context + Review + Evidence chain.
- Matches thesis: *governs AI actions from policy to proof*.

Conditions:

1. Lead with Decisions about attempts, not compliance scores.
2. State enforcement boundary honestly.
3. Keep Agent/Tool as substrate, not the category.
4. Keep healthcare as pack vertical, not the category.

**Better fallback if honesty fails:** remain “AI Governance Gateway” rather than overclaim “Action Governance” while execution is client-dependent.

---

## 28. Executive Buyer Assessment

| Buyer | Concern | Existing tools | Gap | Enigma value | Objection | Answer |
|-------|---------|----------------|-----|--------------|-----------|--------|
| CISO | AI data egress & abuse | IAM, SWG, DLP, SIEM | No AI-attempt Decision authority | Choke point + Decision + Evidence | “We have DLP/SIEM” | Those see traffic/events; Enigma **decides and can block model/tool attempts** with policy packs |
| CIO | Control AI sprawl | API GW, platforms | App→model shadow IT | Appliance governance boundary | “Another gateway?” | Specialized AI PEP with policy+evidence, not general API GW |
| CDO | Sensitive data in prompts | DLP, catalogs | Runtime AI path control | Interrogation+transform+policy | “Data governance tool?” | No — runtime AI path only |
| CAIO | Safe agent rollout | Model gov, evals | Agent/tool/action runtime control | Actor substrate + Action Decision | “Model registry enough?” | Models ≠ permission to act |
| Ent. AI Leader | Ship agents safely | Orchestrators | Policy+proof | Govern→Decide→Enforce→Prove | Latency/complexity | Inline path; fail-closed |
| Healthcare Compliance | HIPAA/Part2/CMS AI use | GRC, EHR controls | AI-specific decision evidence | Healthcare packs on one EPA | “Is this GRC?” | Executable runtime policy, not assessments |
| Security Architect | Authority boundaries | PDP/PEP patterns | AI-specific PEP | One EPA, registries as facts | Dual engines? | Default single EPA; legacy gated |
| App Owner | Break my app? | App IAM | Clear commit contract | Explicit commit_allowed + REVIEW | Client commit burden | Documented boundary; integrate Outcome |

### If I already have IAM, API gateways, DLP, SIEM, GRC, model governance, and an AI control plane — why Enigma?

Because none of those typically provide **a single authoritative, historically frozen Decision about a specific AI-mediated attempt** (including agent/tool/action context), **enforced at the AI gateway**, with **REVIEW by a distinct approver**, and **tamper-evident evidence** binding Decision → Gateway enforcement → Outcome receipt — especially for **air-gapped / local model** deployments. Enigma is the **PEP + PDP for AI actions**, not a replacement for those systems.

---

## 29. Competitive Differentiation

| Differentiator | Strength |
|----------------|----------|
| One Decision SoR for AI attempts + explainable multi-pack resolution | **Strong / moat candidate** |
| Appliance + air-gap local inference governance | **Strong** |
| Agent/Tool facts → same EPA (no Agent PDP) | **Strong architectural** |
| REVIEW ≠ requester; machine decision immutable | **Strong** |
| Tamper-evident audit + optional customer-controlled anchors | **Strong** |
| Healthcare packs as overlays | Feature + credibility (not exclusive moat) |
| Tokenization vault | Supporting feature |
| Admin Insights scores | Not differentiated (GRC-like) |

**Strongest defensible differentiator:**  
**Authoritative AI Action Decisioning with Gateway Enforcement and Proof** — *policy → one Decision → enforce what you control → evidence* — without fragmenting into per-domain PDPs.

---

## 30. Product 1.0 Definition

Validated capability set (refined from Govern/Identify/Decide/Enforce/Prove):

| Capability | Customer problem | Enigma capability | Implementation | Maturity | Missing | Priority | 1.0? |
|------------|------------------|-------------------|----------------|----------|---------|----------|------|
| **Bound** | Who/what is attempting | App/User + Agent/Tool substrate | identity + actors | High | IdP federation polish | P0 | Yes |
| **Decide** | May this attempt proceed? | EPA Decision | Pack PDP + evaluations | High | Pack scope discipline | P0 | Yes |
| **Enforce** | Stop disallowed attempts | Gateway PEP | Orchestrator | High (model) / Medium (actions) | Honest UX + customer integration guide | P0 | Yes |
| **Review** | Exception handling | Approver resolve/resume | Admin RBAC | High | — | P0 | Yes |
| **Prove** | Auditability | Audit/Outcome/Checkpoint | audit/* | High | Multi-node race proof | P0 | Yes |
| **Specialize** | Regulated AI | Healthcare packs | overlays | High | Keep optional | P1 | Yes (thin) |

**Product 1.0 is not “everything implemented.”**  
**Product 1.0 = Bound → Decide → Enforce (honestly) → Review → Prove**, with Agent/Tool/Action as context, Models as substrate, one vertical pack set (healthcare) as optional accelerator.

---

## 31. Product 1.0 Gaps

| Gap | Severity |
|-----|----------|
| Commercial messaging vs client-commit enforcement | **CRITICAL** (trust) |
| Overview GRC/compliance-score first impression | **HIGH** |
| Root Node2AI vs Enigma dual identity | **HIGH** |
| Pack sprawl vs focused 1.0 SKU | **HIGH** |
| Customer integration playbook for commit_allowed + Outcome | **HIGH** |
| Legacy engine / actor `off` footguns in ops | **MEDIUM** |
| Multi-process ledger race proof | **MEDIUM** |
| IdP/SSO enterprise packaging | **MEDIUM** |
| UI still registry-heavy vs Decision-led storytelling | **MEDIUM** |
| Performance/scale published targets | **LOW** |
| Universal execution proxy | **NOT A GAP** (correctly absent) |

---

## 32. Architecture to Freeze

| Element | Freeze? | Why |
|---------|---------|-----|
| One EPA/PDP | **Yes** | Core authority |
| `policy_evaluations` as Decision SoR | **Yes** | Product spine |
| Registries as facts-only | **Yes** | Prevents PDP fragmentation |
| Historical snapshots | **Yes** | Explainability/compliance |
| Review/approver model | **Yes** | Security + accountability |
| Action as context (not Action PDP) | **Yes** | Scope discipline |
| Policy pack overlay architecture | **Yes** | Extensibility without new engines |
| Decision→Evidence chain | **Yes** | Proof story |
| Client-commit actions path | **Freeze as honest boundary** | Changing requires new product (execution proxy) — defer deliberately |

---

## 33. Recommended Changes (no implementation in this assessment)

### FOUNDATIONAL

- Define Product 1.0 SKU boundary (core + healthcare option).
- Freeze architecture invariants in commercial contracts.

### SECURITY

- Production defaults checklist: actor `enforce`, policy `enterprise`, legacy gate off.
- Threat guidance: Gateway bypass and client noncompliance are customer residual risks.

### PRODUCT

- Lead category: AI Action Governance / AI Governance Gateway.
- Publish enforcement boundary matrix as customer-facing truth.

### UX

- Re-center Overview on Decisions/triage; demote or remove compliance-score aesthetics.
- Ensure Decision detail is the hero narrative.

### OPERATIONAL

- Harden install/ops docs around keys, air-gap health, anchoring.
- Explicit “do not enable legacy/off in production” warnings.

### COMMERCIAL

- Retire or quarantine root Node2AI platform README as non-product.
- Competitive narrative vs IAM/DLP/SIEM/GRC/model catalogs.

---

## 34. Do Not Build

- Generic GRC / assessment suites  
- Workforce IAM / SSO replacement  
- Enterprise DLP platform  
- SIEM / observability platform  
- Data catalog / MDM / data governance suite  
- System inventory / CMDB  
- Generic workflow/BPM engine  
- Universal connector fabric as core  
- Universal execution proxy as silent default  
- Agent PDP / Tool PDP / Action PDP / Healthcare PDP  
- Parallel Decision stores  
- Autonomous agent orchestration platform  

---

## 35. Phase E Decision

**Do not invent Phase E as the next feature wave by roadmap momentum.**

**Recommendation:** Phase E, if named at all, should be **Product 1.0 Hardening & Commercialization** — not a new governance subsystem.

**Objective only:**

> Make Enigma commercially tellable and operationally safe as Product 1.0: freeze the architecture, align messaging with enforcement reality, tighten UX around Decisions, package core vs vertical packs, and publish customer integration contracts for client-commit actions — without building new PDPs, catalogs, or proxies.

If “Phase E” implies new capability expansion (data governance, connectors, execution mesh): **No.**

---

## 36. Final Enigma Product Thesis

### WHAT IS ENIGMA?

An **AI Governance Gateway** specializing in **AI Action Governance**: the control plane that decides whether an AI-mediated attempt may proceed, enforces what it controls, and proves the chain.

### WHAT DOES ENIGMA GOVERN?

**AI-mediated attempts** (model completions and agent/tool actions), in context of Application, User, Agent, Tool, Operation, Model, and Action facts.

### WHEN DOES ENIGMA MAKE ITS DECISION?

**Before** Gateway-controlled execution (model run / commit authorization), after identity, interrogation (when applicable), and registry fact resolution.

### WHAT MAKES THE DECISION AUTHORITATIVE?

A single **PackBackedEnterprisePdp** evaluation persisted in **`policy_evaluations`**, with immutable machine decision and frozen runtime context.

### WHERE DOES ENIGMA ENFORCE?

At the Gateway for model invocation, transforms, response release, and denial/hold of actions. **Not** inside arbitrary external systems’ DML unless the customer honors `commit_allowed` (or a future explicit proxy product).

### WHAT EVIDENCE DOES IT PRODUCE?

Decision records, enforcement/audit events, optional client Outcome receipts, hash/HMAC chain, checkpoints, optional external anchors.

### WHY DOES AN ENTERPRISE NEED IT?

Shadow AI and agents create consequential actions that IAM, DLP, and GRC do not authoritatively **decide and bind to proof** at the AI boundary.

### WHAT DOES ENIGMA COMPLEMENT?

IAM, IdP, API gateways, DLP, SIEM, GRC, model catalogs, EHR/CRM systems of record.

### WHAT DOES ENIGMA NOT REPLACE?

Those systems; nor the systems of record that perform external writes.

### WHAT WILL ENIGMA NEVER BECOME?

Generic GRC, IAM, DLP, SIEM, data governance, workflow BPM, or universal integration/execution fabric.

---

## 37. Product Scorecard

| Area | Score (1–10) | Note |
|------|--------------|------|
| Architecture | **8** | Coherent spine; dual legacy remnants |
| Policy Architecture | **8** | Strong EPA; pack sprawl risk |
| Decision Architecture | **9** | Clear SoR and immutability |
| Action Governance | **7** | Solid facts; early commercially |
| Agent Governance | **8** | Enforce mode strong |
| Tool Governance | **8** | Grants/ops sufficient for 1.0 |
| Model Governance | **7** | Supporting; adequate |
| Security | **8** | Fail-closed defaults; client-commit residual |
| Enforcement | **6** | Excellent on completions; qualified on actions |
| Evidence | **8** | Strong stack; outcome trust limits |
| Healthcare | **8** | Packs on common EPA |
| UI/UX | **6** | Decision detail strong; Overview weak |
| API | **8** | Coherent |
| Deployment | **8** | Appliance/air-gap real |
| Testing | **9** | Broad invariant coverage |
| Product Differentiation | **8** | Clear if messaging holds |
| Commercial Readiness | **5** | Identity/messaging/SKU gaps |
| Scope Discipline | **6** | Architecture disciplined; content/UI pressure |

### OVERALL PLATFORM SCORE: **7.5 / 10**

Not a flat average: Decision/policy/testing strength pulls up; commercial readiness, enforcement honesty on actions, and Overview UX pull down. Architecturally ready to *define* Product 1.0; not yet ready to *oversell* it as complete action execution control.

---

## 38. Overall Verdict

### Is Enigma:

**B. Architecturally strong but requiring foundational work**

**Why not A:** Product 1.0 commercial packaging, messaging honesty, and UX first-impression still require foundational work.  
**Why not C/D:** The implementation is coherent; one EPA, registries-as-facts, Decision SoR, and evidence chain are real — not misaligned with purpose.

### Direct answers

1. **What is Enigma today?** An AI Governance Gateway appliance with EPA Decisions, Agent/Tool substrate, Action context, healthcare packs, and strong evidence — plus residual Node2AI/GRC messaging noise.  
2. **What should Enigma become?** The category-defining **AI Action Governance** control plane: decide, enforce (honestly), review, prove.  
3. **Primary governance object?** **AI Action (attempt)** as subject; **Decision** as authoritative artifact.  
4. **Core architectural differentiator?** One EPA → one Decision → Gateway PEP → Evidence, with registries as facts only.  
5. **Strongest commercial differentiator?** Authoritative Decision + proof for AI attempts (including agentic), including air-gap.  
6. **Biggest architectural weakness?** Split enforcement: actions ALLOW are client-commit.  
7. **Biggest security concern?** Production misconfig (`actor off` / legacy engine) and client noncompliance on actions.  
8. **Biggest enforcement limitation?** No universal control of external system side effects.  
9. **Biggest UX issue?** Overview Insights look like GRC; Decisions are the real product.  
10. **Biggest commercialization risk?** Overselling Action Governance as execution control; dual Node2AI/Enigma identity.  
11. **What should be frozen?** One EPA, `policy_evaluations`, facts-only registries, snapshots, review model, pack overlays, evidence chain.  
12. **What should change?** Product 1.0 packaging, messaging, Overview UX, ops defaults discipline, SKU/pack focus.  
13. **What should NOT be built?** GRC/IAM/DLP/SIEM/data-gov/workflow/universal proxy/second PDPs.  
14. **What should Product 1.0 contain?** Bound → Decide → Enforce → Review → Prove (+ Agent/Tool/Action context, Models substrate, thin healthcare option).  
15. **Should Phase E exist?** Only as **Product 1.0 Hardening & Commercialization** — not capability expansion.

---

*End of assessment. No implementation followed from this document.*
