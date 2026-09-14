# Enigma Product 1.0 Definition and Readiness

**Nature:** Inspection, definition, and gap analysis only (no implementation)  
**Date:** 2026-09-14  
**Inputs:** `docs/ENIGMA_E2E_PLATFORM_ASSESSMENT.md`, `docs/ENIGMA_ARCHITECTURE.md`, `docs/ACTION_GOVERNANCE.md`, live `gateway/` implementation  
**Authority:** Repository behavior over aspirational marketing  

---

## 1. Product 1.0 Executive Summary

Enigma Product 1.0 is the **minimum commercially tellable** release of the Enigma appliance as an **AI Action Governance** product.

It does not invent a new architecture. It freezes the architecture that already works:

```text
Bind → Decide → Enforce → Review → Prove
```

under the policy spine:

```text
Policy → Decision → Enforcement → Proof
```

**Primary governance subject:** the AI Action (the attempt).  
**Primary authoritative artifact:** `policy_evaluations` (the Decision).  
**Primary operator surface:** Decisions.  
**Highest Product 1.0 risk:** claiming Gateway execution control where only **client commit** exists.

**Verdict:** Product 1.0 is **definable now**. Implementation should begin only as **hardening and commercialization**, not as a new governance domain (Phase E expansion is rejected).

---

## 2. Product Thesis

### Candidate thesis

> **Enigma is an AI Action Governance platform that determines whether AI actions should be allowed, controlled, reviewed, or denied, and creates the evidence to prove what happened.**

### Validation against the platform

| Claim | Supported? | Qualification |
|-------|------------|---------------|
| AI Action Governance | **Yes** | Action is the governed subject; Decision is the SoR |
| Determines ALLOW / controlled / REVIEW / DENY | **Yes** | EPA Pack-Backed PDP; controls include TOKENIZE/REDACT/eligibility |
| Creates evidence of what happened | **Partially** | Strong for Decision + Gateway enforcement; Outcome on actions is **client-reported** |

### Refined Product 1.0 thesis (authoritative)

> **Enigma is an AI Action Governance gateway that establishes who and what is acting, decides whether an AI-mediated attempt may proceed, enforces that decision at the Gateway boundary it controls, routes exceptions to an authorized approver, and produces evidence of the Decision, enforcement, and reported Outcome.**

**Why refined:** The candidate thesis is directionally correct but can overstate “prove what happened” for external system mutation. Product 1.0 must be technically honest about client-commit actions.

**Rejected weaker theses**

- “AI sanitization platform” (too narrow; supporting only)  
- “Healthcare GRC” (vertical packs, not the product)  
- “Agent governance platform” (Agent is substrate, not the category)

---

## 3. Product Category

### Alternatives evaluated

| Category | Fit | Issue |
|----------|-----|-------|
| AI Governance Gateway | Strong | Accurate but generic; understates Action focus |
| AI Runtime Governance | Medium | Vague; overlaps observability |
| AI Control Plane | Medium | Often means orchestration/MLOps |
| AI Authorization | Medium | Sounds like IAM |
| Agent Governance | Weak | Omits completions; elevates substrate |
| AI Security | Weak | Too broad (DLP/SIEM adjacency) |
| AI Policy Enforcement | Strong | Accurate PEP language; less commercial clarity |
| **AI Action Governance** | **Strongest** | Matches subject + Decision + Review + Proof |

### Selected category

**AI Action Governance**

**Why:** It names the governed subject (Action), implies Decision authority, and differentiates from IAM, API gateways, model catalogs, and GRC. It must always be paired with the enforcement honesty contract so buyers do not hear “execution proxy.”

**Secondary descriptor (technical):** AI Governance Gateway.

---

## 4. Governance Object Model

### Primary governance subject

**AI Action** — the concrete attempt an AI actor is trying to cause (model completion attempt or tool/write attempt).

### Primary authoritative artifact

**Decision** — one row in `policy_evaluations`, produced by one EPA evaluation. Machine decision is immutable.

### Context dimensions (facts, not authorities)

| Object | Role |
|--------|------|
| Application | Authenticated caller |
| User | Request subject identity |
| Agent | Runtime actor (optional) |
| Tool | Capability surface (optional) |
| Operation | Capability / request verb |
| Model | Eligibility substrate |
| Runtime context | Server-resolved facts + declared safe attributes |
| Policy / packs | Inputs to EPA |
| Review | Additive human resolution when Decision is REVIEW |
| Enforcement | What Gateway applied |
| Outcome | Reported execution result (actions) |
| Evidence / Audit | Proof trail |

### Governance boundaries (where Enigma stops)

Enigma stops at:

- Gateway-controlled model inference and transforms  
- Authorization to commit (actions)  
- REVIEW hold / resume gates  
- Evidence sealing  

Enigma does **not** become:

- The system of record that performs external DML  
- Enterprise IAM, DLP, SIEM, or GRC  
- A universal connector or execution mesh  

### Canonical model (Product 1.0)

```text
Application
    ↓
User
    ↓
Agent (optional)
    ↓
Tool (optional)
    ↓
Operation
    ↓
Action (governed subject / context)
    ↓
Runtime Context (server-authoritative facts)
    ↓
Policy (baseline + packs)
    ↓
ONE EPA / PDP
    ↓
ONE Decision (policy_evaluations)
    ↓
Enforcement (Gateway boundary)
    ↓
Review / Approver when required
    ↓
Execution (Gateway model OR client system)
    ↓
Outcome (client-reported on actions)
    ↓
Evidence / Audit
```

Ordinary completions may omit Agent/Tool. Action context may be lightweight (operation-derived) when no `action` object is supplied.

---

## 5. Canonical Architecture

### Capability architecture

```text
BIND → DECIDE → ENFORCE → REVIEW → PROVE
```

### Policy architecture

```text
Policy → Decision → Enforcement → Proof
```

### Authority rule

```text
Registries establish facts.
EPA produces the Decision.
Gateway enforces what it controls.
Approvers resolve REVIEW.
Evidence proves the chain.
```

There is **one** authoritative AI policy decision path in Product 1.0 defaults: `PackBackedEnterprisePdp` with `GATEWAY_POLICY_ENGINE=enterprise`.

---

## 6. Product Capabilities

### BIND

Establish who and what is acting: Application, User, optional Agent/Tool, operation, action facts, model eligibility context.

### DECIDE

Evaluate the attempt against policy and persist one authoritative Decision.

### ENFORCE

Apply the Decision at the Gateway boundary Enigma actually controls (block, transform, hold, model run, or withhold `commit_allowed`).

### REVIEW

Route REVIEW to an authorized approver (**not** the requesting end user). Human resolution is additive.

### PROVE

Produce Evidence linking Decision → Enforcement → Outcome (where Outcome is reported).

**Assessment:** These five capabilities accurately define Product 1.0. Do not add a sixth “Assess/Comply” capability (that is GRC).

---

## 7. Product Scope

### Classification of capabilities

| Capability | Class | Product 1.0 |
|------------|-------|-------------|
| Application governance (caller registry + keys) | **CORE** | Yes |
| User context | **CORE** | Yes |
| Agent governance (registry, binding, lifecycle) | **SUPPORTING** (required for agentic) | Yes |
| Tool governance | **SUPPORTING** | Yes |
| Agent→Tool grants / operation allowlists | **SUPPORTING** | Yes |
| Action governance context | **CORE** (subject framing) | Yes |
| Action classification (category/write class) | **SUPPORTING** | Yes |
| Runtime context resolution | **CORE** | Yes |
| Policy packs + EPA evaluation | **CORE** | Yes |
| Decision management (`policy_evaluations`) | **CORE** | Yes |
| Human review / approver resolution | **CORE** | Yes |
| Enforcement (Gateway-controlled) | **CORE** | Yes |
| Client commit contract | **CORE** (honesty) | Yes (documented + UX-clear) |
| Outcomes | **CORE** (actions proof) | Yes |
| Evidence / Audit / integrity | **CORE** | Yes |
| Model registry + eligibility | **SUPPORTING** | Yes |
| Healthcare packs (HIPAA, Part 2, ONC, CMS) | **OPTIONAL vertical** | Yes as option |
| Extra framework packs (ISO/NIST/EU/SOC2…) | **OPTIONAL / thin** | Present but not Product 1.0 hero |
| Air-gapped deployment + local models | **SUPPORTING differentiator** | Yes |
| Administration / RBAC | **SUPPORTING** | Yes |
| Decisions UI | **CORE experience** | Yes |
| Audit UI | **SUPPORTING** | Yes |
| Overview / Console | **SUPPORTING** | Yes (decision-led landing; not GRC scores) |
| Observability / insights scores | **DEFER / reduce** | Keep disabled |
| System information | **SUPPORTING** | Yes |
| Data information / catalogs | **DO NOT BUILD** | No |
| Universal execution proxy | **DEFER** (not 1.0) | No |
| Connectors platform | **DEFER** | No |

### Minimum Product 1.0 includes

1. Governed completions and actions APIs  
2. Server-authoritative Bind (identity + actor registry in enforce)  
3. One EPA Decide path  
4. Honest Enforce semantics  
5. Approver Review  
6. Prove via Decision + Audit + Outcome  
7. Decisions-first operator UX  
8. Appliance deploy including air-gap option  
9. Healthcare packs available as vertical option through the same EPA  

---

## 8. Explicit Non-Scope

Product 1.0 **explicitly does not include** and must not expand into:

| Item | Classification |
|------|----------------|
| Workforce IAM / IdP replacement | **DO NOT BUILD** |
| GRC / assessment / compliance scoring product | **DO NOT BUILD** |
| Enterprise DLP platform | **DO NOT BUILD** |
| SIEM / generic observability platform | **DO NOT BUILD** |
| Generic data governance / catalog / MDM | **DO NOT BUILD** |
| Enterprise resource / system inventory | **DO NOT BUILD** |
| Generic authorization platform | **DO NOT BUILD** |
| Generic API gateway | **DO NOT BUILD** |
| Generic AI control plane / orchestrator | **DO NOT BUILD** |
| Workflow / BPM engine | **DO NOT BUILD** |
| Universal execution proxy (as Product 1.0 core) | **DO NOT BUILD for 1.0** |
| Universal connector platform | **DO NOT BUILD for 1.0** |
| Separate Action / Agent / Tool / Healthcare PDP | **DO NOT BUILD** |
| Separate approval engine or decision store | **DO NOT BUILD** |
| Second production policy engine | **DO NOT BUILD** |
| Model governance / MLOps platform | **DO NOT BUILD** |

---

## 9. Decision Model

### Authoritative artifact

`policy_evaluations` remains the enterprise source of truth for machine Decisions.

### Decision outcomes (operator-facing)

| Decision | Meaning |
|----------|---------|
| ALLOW | Attempt may proceed under Gateway rules |
| ALLOW WITH CONTROLS | Proceed with obligations (e.g. TOKENIZE, eligibility limits) |
| REVIEW | Held for authorized approver |
| DENY | Must not proceed at Gateway boundary |

(Wire/legacy mapping may use BLOCK for some DENY/REVIEW holds; Product 1.0 UX should prefer Decision vocabulary above.)

### Ideal Decision record (Product 1.0)

| Section | Must answer |
|---------|-------------|
| **WHO** | Application, User, Agent, Tool |
| **WHAT** | Operation, Action, category, target, safe attributes |
| **CONTEXT** | Purpose, authz context, deployment, classification (as available) |
| **POLICY** | Applicable packs/policies, resolution |
| **DECISION** | Machine + final |
| **WHY** | Explanation / reason codes |
| **ENFORCEMENT** | Gateway vs client-commit boundary; what was blocked/held/allowed |
| **REVIEW** | Why, approver, disposition, timestamps |
| **OUTCOME** | Reported result / not reported |
| **EVIDENCE** | Audit binding / integrity references |

### Current UI vs ideal (inspection; no changes)

**Present today:** Decision identity, request context, runtime actor, action governance, model governance, consequence, explanation, review, execution/outcome panels.

**Gaps for Product 1.0 UX (P1):**

1. Enforcement boundary not always first-class / unmistakable on ALLOW actions (`client_commit_required` vs Gateway-executed).  
2. Outcome “not reported” should be a first-class state, not easy to miss.  
3. WHO/WHAT should read as one Action story, not a stack of optional panels.  
4. Avoid reconstructing live Agent/Tool state (already correct; keep frozen).

---

## 10. Enforcement Model

### What Enigma actually controls

| Path | Gateway controls | Client/system controls |
|------|------------------|------------------------|
| Completions | Auth, policy, transforms, model invocation, response release/block | Direct model bypass if app ignores Gateway |
| Actions DENY | No `commit_allowed`; HTTP deny | Noncompliant client could still mutate SoR |
| Actions REVIEW | Hold until AUTHORIZE + resume | Same residual if noncompliant |
| Actions ALLOW | Stamp `commit_allowed` / `CLIENT_COMMIT_ALLOWED` | **External DML**; Outcome report |

### `commit_allowed`

Used on the actions path after ALLOW (or after AUTHORIZE resume) to tell the client it may perform the side effect. It is **authorization to commit**, not proof the commit occurred.

### Adversarial / lifecycle answers

| Question | Product 1.0 answer |
|----------|-------------------|
| Can a client ignore ALLOW? | Yes for external DML; residual customer risk |
| Can an action bypass DENY at Gateway? | No `commit_allowed` issued; compliant clients cannot proceed via Enigma |
| Registry unavailable (enforce) | Fail closed |
| PDP unavailable / evaluation failure | Fail closed |
| Shadow actor mode | Server facts authoritative; compare metadata |
| Legacy engine enabled | Dual authority risk; **not** Product 1.0 production default |
| Agent suspended / grant revoked | New requests deny; historical Decisions unchanged |
| Policy changes after evaluation | Historical Decision frozen; does not rewrite past |
| After REVIEW | Approver resolve → resume → then commit_allowed if AUTHORIZE |
| Evidence afterward | Decision + audit (+ outcome if reported) |

### Product 1.0 enforcement requirement

Product 1.0 requires:

1. **Hardening and honesty** (docs, UX, defaults)  
2. A **stronger customer integration contract** for client-commit — see **[`ENIGMA_INTEGRATION_CONTRACT.md`](./ENIGMA_INTEGRATION_CONTRACT.md)**  
3. **Not** a universal execution proxy  

**Universal execution proxy is not necessary for Product 1.0.** Building one would redefine the product boundary and must remain explicitly out of scope.

---

## 11. Review Model

```text
REVIEW → Authorized Approver (ADMINISTRATOR | GOVERNANCE_REVIEWER)
      → resolve (AUTHORIZE | DENY)
      → resume (when AUTHORIZE)
      → execution / outcome
```

**Rules**

- Requesting end user is **not** the approver.  
- Machine Decision is **not** overwritten.  
- DENY machine decisions are not “approved away” through Review.  
- Review is a governance consequence, not a BPM product.

---

## 12. Outcome and Evidence Model

```text
Decision → Enforcement → (Execution) → Outcome → Evidence
```

| Layer | Trust |
|-------|-------|
| Decision | Server authoritative |
| Gateway enforcement events | Server authoritative |
| Action Outcome | Client-reported; sealed when received; conflict detection exists |
| Audit chain / checkpoint / optional anchor | Integrity of ledger, not completeness of external world |

Product 1.0 must describe Outcome as **reported execution evidence**, not absolute proof of external mutation.

---

## 13. Security Requirements

| Requirement | Status |
|-------------|--------|
| Server-authoritative application identity (API key binding) | **PASS** |
| Server-authoritative actor resolution (`enforce`) | **PASS** (default); **HARDEN** ops to forbid `off` in prod |
| Server-authoritative action category/class/boundary | **PASS** |
| Registry fail-closed when enforcement requires it | **PASS** |
| Deployment isolation | **PASS** |
| No client elevation of authz | **PASS** in enforce |
| Immutable historical runtime context | **PASS** |
| Immutable authoritative machine decision | **PASS** |
| Additive human resolution | **PASS** |
| No end-user self-approval of REVIEW | **PASS** |
| Decision/enforcement integrity (audit binding) | **PASS** |
| Evidence integrity (hash/HMAC/checkpoint) | **PASS** |
| Production-safe defaults documented and packaged | **HARDEN** |
| Client-commit honesty in product claims | **GAP** (messaging/UX) |
| Multi-process ledger race absolute proof | **DEFER** (known proof gap) |

---

## 14. Healthcare

| Pack | Product 1.0 role |
|------|------------------|
| HIPAA | Vertical pack |
| 42 CFR Part 2 | Vertical pack |
| ONC / HTI-1 | Vertical pack |
| CMS | Vertical pack |

**Packaging:** Healthcare is an **optional vertical package** on the common EPA — not Core architecture and not a healthcare GRC product.

**Why:** Strengthens regulated credibility and sales wedge without making Enigma “a HIPAA tool.” All packs must continue through PackBackedEnterprisePdp only.

**SKU framing:** Enigma Core + **Healthcare Policy Pack Option**.

---

## 15. Models

| Question | Answer |
|----------|--------|
| Governance authority? | **No** |
| Supporting substrate? | **Yes** |
| Eligibility mechanism? | **Yes** (via EPA restrictions + defense-in-depth gateway) |
| Integration feature? | Local/Ollama/external adapters are deployment integration |

Models must not become a standalone model governance / MLOps product in Product 1.0.

---

## 16. UX / Product Experience

### Primary experience

**Decisions** is the Product 1.0 hero surface (list + evaluation detail).

### Overview / Console

Overview is a **decision-led operational landing page**. It summarizes AI governance activity from authoritative `policy_evaluations` and routes administrators to Decisions / Decision Story. It is not a second source of governance truth.

| Element | Product 1.0 guidance |
|---------|----------------------|
| Header: AI Action Governance | **Primary** |
| Decision activity (ALLOW / REVIEW / DENY / Outcome not reported) | **Primary** (activity metrics only) |
| Needs Attention (approver review, outcome not reported, exceptions when authoritative) | **Primary** triage → Decisions |
| Recent Decisions (Actor / Action / Decision / Enforcement / Outcome) | **Primary** → Decision Story |
| Governance coverage counts | **Subordinate** |
| Gateway/DB/runtime posture | **Remain** on Status (hidden tab; not Overview hero) |
| Compliance score / risk donut / action items | **Remain disabled**; do not reintroduce as hero |

Overview should reinforce **AI Action Governance**, not GRC assessment.

### Navigation Product 1.0

Keep Applications, Agents, Tools, Policies, Decisions, Models, Audit as supporting directories of Decision context. Do not add Action as top-level nav.

---

## 17. Product 1.0 Gaps

| Gap | Why it matters | Security | Product | Commercial | Priority | Action | Code? | UX? | Docs? | Deferrable? |
|-----|----------------|----------|---------|------------|----------|--------|-------|-----|-------|-------------|
| Enforcement honesty in claims/UX for client-commit | Buyers over-trust ALLOW | Trust | Category credibility | **CRITICAL** | **P0** | Decision enforcement panel + customer contract | Light | Yes | Yes | No |
| Production defaults packaging (actor enforce, enterprise PDP, legacy off) | Footgun dual authority | High | Reliability | High | **P0** | Ops checklist + install defaults proof | Light | No | Yes | No |
| Healthcare SKU packaging clarity | Looks like GRC content dump | Low | Scope | Med | **P1** | Core vs Healthcare option — see `ENIGMA_COMMERCIAL_PRODUCT_1_0.md` | No | No | Yes | Addressed (docs) |
| Dual identity Node2AI root vs Enigma | Confused buy/deploy | Low | Positioning | High | **P0** | Product docs/README alignment — **Workstream 6 identity cleanup** | No* | No | Yes | Addressed (docs + startup banner); UI promo URL finding remains |
| Framework pack sprawl in marketing | Dilutes Action Governance | Low | Scope | Med | **P1** | Do not hero optional packs | No | Light | Yes | Prefer |
| Client integration playbook (commit_allowed + outcome) | Failed field adoption | High residual | Adoption | High | **P1** | Canonical contract: `ENIGMA_INTEGRATION_CONTRACT.md` | No | No | Yes | Addressed (docs) |
| Outcome not-reported visibility | Incomplete proof story | Med | Prove | Med | **P1** | Decision UX | Light | Yes | Light | Prefer |
| Multi-process Postgres race absolute proof | Evidence completeness | Med | Assurance | Low | **P2** | Proof work | Maybe | No | Yes | Yes |
| IdP/SSO enterprise packaging | Enterprise admin UX | Med | Enterprise | Med | **P2** | Later | Maybe | Maybe | Yes | Yes |
| Performance published targets | Procurement | Low | Ops | Low | **P2** | Publish | No | No | Yes | Yes |

\*Root README alignment is documentation-only for Product 1.0 hardening.

---

## 18. Hardening Workstreams

Only workstreams proven necessary for Product 1.0:

| # | Workstream | Purpose |
|---|------------|---------|
| 1 | **Enforcement integrity & honesty** | Make client-commit vs Gateway-enforced unmistakable in Decision UX + docs + API semantics language |
| 2 | **Security / production defaults** | Prove and document fail-closed production defaults; forbid footguns |
| 3 | **Decisions UX hardening** | WHO/WHAT/WHY/ENFORCEMENT/REVIEW/OUTCOME/EVIDENCE narrative |
| 4 | **Console/Overview reposition** | Decision/triage-led; keep GRC cards off |
| 5 | **Documentation & commercial packaging** | Thesis, category, SKU (Core + Healthcare option), dual-identity classification (**commercial definition delivered** in Workstream 5) |
| 6 | **Acceptance testing for Product 1.0 invariants** | Codify acceptance criteria as tests/checklist where missing |

**Not required as Product 1.0 workstreams:** new healthcare engines, new PDPs, execution proxy, data catalogs, GRC rebuild, connector platform.

---

## 19. Acceptance Criteria

Product 1.0 is accepted when all of the following hold:

1. Full gateway regression suite passes.  
2. TypeScript typecheck passes (gateway + admin).  
3. Gateway and admin builds pass.  
4. Security/adversarial suites for spoofing, overrides, actor enforce, and DENY precedence pass.  
5. Decision authority remains singular (`policy_evaluations` / Pack PDP default).  
6. Agent/Tool governance remains facts-only (no Agent/Tool PDP).  
7. Action governance remains context feeding EPA (no Action PDP).  
8. REVIEW requires `governance_resolve` approver role; end user cannot self-authorize.  
9. DENY cannot obtain `commit_allowed` at the Enigma boundary.  
10. Historical Decisions remain reproducible from frozen context (not live registries).  
11. Evidence connects Decision to enforcement audit and to Outcome when reported.  
12. Client-commit semantics are explicitly documented in Product 1.0 customer docs and visible in Decision UX.  
13. Production defaults fail closed: actor `enforce`, policy `enterprise`, legacy engine not enabled.  
14. Healthcare packs operate only through the common EPA path.  
15. Commercial materials do not claim Gateway DML execution for client-commit actions.  
16. Overview does not present compliance-score GRC as the hero experience.

---

## 20. Executive Buyer Value

### Why Enigma if I already have IAM, API gateways, DLP, SIEM, GRC, model governance, and an AI control plane?

Those tools authenticate people/services, route APIs, detect sensitive data or events, manage assessments, catalog models, or orchestrate agents. They do **not** typically produce a **single authoritative, historically frozen Decision** about a specific **AI-mediated attempt** (with Agent/Tool/Action context), **enforce it at the AI gateway**, **route REVIEW to a distinct approver**, and **seal Decision → enforcement → reported Outcome** evidence — including for **air-gapped local model** deployments.

Enigma is the **policy decision and enforcement boundary for AI actions**, not a replacement for those systems.

| Buyer | Value in one line |
|-------|-------------------|
| CISO | Authoritative allow/deny/review of AI attempts with evidence |
| CIO | Controlled AI choke point without another generic API gateway |
| CAIO | Safe agent/tool action rollout with Decision proof |
| Enterprise AI Leader | Ship agents without uncontrolled side effects (within Gateway + contract) |
| Security Architect | One PDP/PEP pattern for AI, registries as facts |
| Healthcare Compliance | Runtime packs on one Decision path, not another assessment tool |
| Application Owner | Clear `commit_allowed` / REVIEW contract for integration |

---

## 21. Commercial Positioning

### One-sentence description

Enigma decides whether AI actions may proceed, enforces that decision at the Gateway, and proves the governance chain.

### 25-word description

Enigma is an AI Action Governance gateway that binds actors, decides on AI attempts, enforces Gateway controls, routes review to approvers, and evidences Decision through Outcome.

### Executive description

Enterprises are deploying agents and AI features that can read, write, and transmit sensitive data. Existing IAM, DLP, SIEM, and GRC tools do not authoritatively decide those attempts at runtime. Enigma sits in the AI path, produces one Decision, enforces what the Gateway controls, requires a distinct approver for REVIEW, and keeps evidence.

### Technical description

Enigma is a modular-monolith appliance PEP/PDP. It resolves Application/User and optional Agent/Tool facts, builds Action governance context, evaluates once via PackBackedEnterprisePdp into `policy_evaluations`, enforces completions and action authorization, and seals audit/outcome evidence. External action DML remains client-commit after `commit_allowed`.

### Differentiator

One authoritative AI Action Decision with Gateway enforcement and proof, without fragmenting into Agent/Tool/Action PDPs.

### What Enigma replaces

Ungoverned direct model and agent tool calls for paths that are integrated through Enigma. It does not replace systems of record.

### What Enigma complements

IAM/IdP, API gateways, DLP, SIEM, GRC, model catalogs, EHR/CRM, agent frameworks.

### What Enigma explicitly does not do

It does not replace IAM, run enterprise DLP/SIEM/GRC, catalog enterprise data, or proxy arbitrary external system execution in Product 1.0.

---

## 22. Architectural Invariants

Future developers must not violate:

1. One policy decision path for AI evaluations (default EPA).  
2. One authoritative Decision artifact: `policy_evaluations`.  
3. Registries provide facts, not decisions.  
4. No Agent PDP.  
5. No Tool PDP.  
6. No Action PDP.  
7. No second Decision store or approval engine.  
8. Runtime actor and action governance context are server-derived where Enigma can establish them.  
9. Historical runtime context is frozen on the Decision.  
10. Review is performed by an authorized approver, not the requesting end user.  
11. Human resolution does not overwrite the machine Decision.  
12. Policy packs contribute only to the common EPA.  
13. Enforcement claims must match actual control boundaries (`gateway_enforced` vs `client_commit_required`).  
14. Outcomes and evidence remain downstream of the Decision.  
15. Data and systems remain context unless a later product explicitly changes scope.  
16. Product 1.0 does not introduce a universal execution proxy as silent “full enforcement.”

---

## 23. Product 1.0 Boundaries

### In

Bind, Decide, Enforce (honest), Review, Prove; Agent/Tool/Action context; Models substrate; Audit/Outcome; Appliance + air-gap; Healthcare as optional packs.

### Out

GRC platformization, IAM, DLP, SIEM, data governance, workflow BPM, universal proxy/connectors, second PDPs, model-governance suite.

### Freeze

EPA singularity, Decision SoR, facts-only registries, snapshot immutability, Review model, pack overlay architecture, evidence chain, client-commit boundary as an explicit contract.

---

## 24. Phase E / Hardening Recommendation

**Do not treat Phase E as capability expansion.**

**Next stage name:** **Product 1.0 Hardening and Commercialization**

**Boundaries**

- Allowed: enforcement honesty, defaults, Decisions/Overview UX hardening, docs/SKU packaging, acceptance criteria, integration contract.  
- Forbidden: new governance domains, second PDPs, data catalogs, execution mesh, GRC features, “while we are here” scope.

If work is labeled Phase E, it must mean only this hardening stage.

---

## 25. Final Product 1.0 Definition

**Enigma Product 1.0** is an AI Action Governance gateway that:

1. **Binds** Application, User, and optional Agent/Tool/Action/Model context using server-authoritative facts.  
2. **Decides** once via the EPA into `policy_evaluations`.  
3. **Enforces** at the Gateway boundary it controls, with explicit client-commit semantics for external actions.  
4. **Reviews** via authorized approvers when policy requires.  
5. **Proves** Decision → Enforcement → Outcome through Audit/Evidence.

That is the complete Product 1.0. Everything else is supporting, optional, deferred, or forbidden.

---

## Final Required Conclusion

1. **What is Enigma?** An AI Action Governance gateway (appliance PEP/PDP).  
2. **What does Enigma govern?** AI-mediated attempts (Actions), including completions and tool/write attempts.  
3. **What is the authoritative artifact?** `policy_evaluations` (Decision).  
4. **What is the core architecture?** Bind → Decide → Enforce → Review → Prove on Policy → Decision → Enforcement → Proof.  
5. **Why is Enigma different?** One authoritative Decision for AI attempts with Gateway enforcement and evidence, without Agent/Tool/Action PDPs.  
6. **What is the minimum Product 1.0?** The five capabilities above, Decisions-first UX, honest enforcement contract, evidence stack, optional healthcare packs, appliance/air-gap.  
7. **What must change?** Messaging/UX honesty for client-commit, production defaults packaging, Decision narrative UX, Console reposition, commercial/docs identity.  
8. **What should be frozen?** One EPA, Decision SoR, facts-only registries, snapshots, Review model, pack overlays, evidence chain, client-commit as explicit boundary.  
9. **What should never be built?** GRC/IAM/DLP/SIEM/data-gov/workflow/universal proxy/second PDPs.  
10. **Should we proceed to implementation?** **Yes**, but only Product 1.0 Hardening and Commercialization.  
11. **FIRST implementation workstream:** **Enforcement integrity and honesty** (Decision UX + customer contract + production defaults proof for client-commit vs Gateway-enforced).

---

## Workstream 1 status (2026-09-14)

**Implemented:** resume binding fail-closed on omitted held fields; action API `enforcement_boundary`; evaluation `enforcement_integrity` / `outcome_integrity`; Decisions UI honesty; Compose/startup production defaults visibility; adversarial tests.

**Client-commit residual (accepted):** Enigma does not proxy external DML. Noncompliant clients can still mutate systems of record outside the Gateway. Product 1.0 documents and surfaces this honestly.

## Decision experience (Workstream 2)

Decision detail exposes a deterministic **Story** narrative (`decision_narrative`) built only from persisted evaluation snapshots:

- Headline (who / what / decision)
- Reason (machine-traceable, no LLM)
- Status strip: Decision · Enforcement · Review · Outcome
- Ordered sections: Who → What → Policy → Why → Enforcement/Outcome → Evidence

The Decisions list surfaces actor/action labels and enforcement boundary from the same snapshot fields. No second Decision store or Action product object.

## Integration contract (Workstream 4)

Canonical Product 1.0 technical integration boundary:

**[`ENIGMA_INTEGRATION_CONTRACT.md`](./ENIGMA_INTEGRATION_CONTRACT.md)**

Covers trust boundary (client-supplied vs server-authoritative), Agent/Tool/Action binding, Decision / `commit_allowed` / enforcement honesty (`gateway_enforced` vs `client_commit_required`), Review/resume, Outcome (`client_reported`), proof vs residual client-noncompliance, and air-gap notes. **No UI changes** in that workstream.

## Commercial product definition (Workstream 5)

Canonical Product 1.0 commercial identity and packaging:

**[`ENIGMA_COMMERCIAL_PRODUCT_1_0.md`](./ENIGMA_COMMERCIAL_PRODUCT_1_0.md)**

Defines category (AI Action Governance), Core + Healthcare Pack packaging, licensing dimensions (no prices), ICP/buyers, claims audit, and Node2AI → Enigma identity classification. **No runtime or UI changes.**

## Identity cleanup (Workstream 6)

Product-facing identity aligned to **Enigma**. Durable note: [`ENIGMA_IDENTITY_AND_MIGRATION.md`](./ENIGMA_IDENTITY_AND_MIGRATION.md). Technical `@node2ai/*` namespaces preserved. Startup banner and installer messages use Enigma. **No UI changes.**

---

*Product 1.0 definition. Hardening workstreams applied in repository after this document’s initial creation.*
