# Enigma Commercial Product 1.0

**Status:** Canonical internal commercial definition  
**Date:** 2026-09-14  
**Mode:** Documentation only (no runtime, UI, or architecture changes)  
**Technical authority:** Repository under `gateway/`  
**Aligned with:** [`ENIGMA_PRODUCT_1_0.md`](./ENIGMA_PRODUCT_1_0.md), [`ENIGMA_ARCHITECTURE.md`](./ENIGMA_ARCHITECTURE.md), [`ENIGMA_INTEGRATION_CONTRACT.md`](./ENIGMA_INTEGRATION_CONTRACT.md)

This document answers:

> **What exactly is Enigma as a commercial product?**

It defines packaging, identity, buyers, and claims for the product **that already exists**. It does not invent capabilities, prices, SaaS offerings, or connectors.

---

## 1. Canonical product definition

**Enigma** is an **AI Action Governance** gateway that binds applications, users, and optional Agents/Tools; decides whether an AI-mediated action may proceed under enterprise policy; enforces that Decision at the Gateway boundary Enigma controls; routes REVIEW Decisions to authorized approvers (not the requesting end user); and produces evidence of Decision, Enforcement, and client-reported Outcome.

Commercial thesis line:

> **Enigma governs AI actions from policy to proof.**

Operating model:

```text
Bind → Decide → Enforce → Review → Prove
```

Architecture spine:

```text
Policy → Decision → Enforcement → Evidence
```

Enigma does **not** claim to execute every enterprise side effect. Where the enforcement boundary is **client-commit-required**, Enigma authorizes (`commit_allowed`) and records evidence; the customer system performs the external mutation and reports Outcome.

---

## 2. Category

### Primary category — AI Action Governance

Enigma’s commercial category is defined by the question it answers at runtime:

> **Should this AI action be allowed under the applicable policy and context?**

It evaluates actions in context of application, user, Agent, Tool, Action facts, target, purpose, authorization context, policy packs, and model/runtime eligibility where applicable.

This is **not** another form of IAM, GRC, observability, DLP, or model lifecycle management.

### Secondary descriptor — AI Governance Gateway

Describes Enigma’s **deployment and enforcement role**: a policy enforcement point (PEP) / decision point on the AI request path.

Commercial hierarchy:

```text
Category:     AI Action Governance
Product:      Enigma
Role:         AI Governance Gateway (appliance / enterprise deployment)
```

Do not lead with “AI governance,” “AI security platform,” or “compliance management.” Those dilute the Action Decision product.

---

## 3. Problem statement

Enterprises can often establish:

- AI identity and application credentials  
- Coarse permissions  
- Model inventories and risk registers  
- Written AI policies  

They still lack an **authoritative Decision at the moment** an AI agent or application attempts a consequential action (write, tool invoke, regulated completion, etc.), with enforcement on the path and evidence afterward.

**Enigma provides that Decision and enforcement layer** for traffic that passes through its Gateway boundary.

This does not claim that no adjacent tool can contribute controls. It claims Enigma’s Product 1.0 focus is the **action-time Decision → Enforce → Review → Prove** chain.

---

## 4. Product thesis

> AI governance becomes meaningful when policy is applied to an actual AI action and produces an authoritative Decision that can be enforced, reviewed, and evidenced.

| Stage | Meaning |
|-------|---------|
| **Bind** | Authenticate application/user; resolve Agent/Tool facts server-side when configured |
| **Decide** | One EPA evaluation → one `policy_evaluations` Decision |
| **Enforce** | Block, transform, hold, model-path control, or issue `commit_allowed` |
| **Review** | Authorized approver resolves REVIEW; resume revalidates binding |
| **Prove** | Decision + Audit (+ Outcome when reported) |

---

## 5. Product object model

```text
Policy
  ↓
Decision          ← authoritative SoR (policy_evaluations)
  ↓
Action            ← governed subject/context (not a PDP)
  ↓
Evidence          ← audit / integrity / checkpoints
  ↓
Outcome           ← client-reported post-decision result (actions)
```

| Object | Commercial meaning |
|--------|--------------------|
| Agent | Governed AI actor (**facts**, not Agent PDP) |
| Tool | Governed capability (**facts**, not Tool PDP) |
| Action | Governed attempt (**context**, not Action PDP) |
| Registry | Identity/authorization substrate (**not** policy engine) |
| Model | Eligibility / runtime substrate (**not** primary SKU object) |
| Policy pack | Domain/regulatory contribution into the **same** EPA |

There is **one** authoritative policy evaluation path: `PackBackedEnterprisePdp`.

---

## 6. Product 1.0 capabilities (implementation-grounded)

### Identity and binding

- Application API-key authentication and application match  
- User resolution  
- Optional Agent / Tool registry with grants and lifecycle  
- Deployment isolation  
- Purpose / authorization context as request facts  

### AI Action Governance

- Operation, kind, target, sanitized safe attributes  
- Server-derived category, write governance class, enforcement boundary  
- Completions path and actions path (`/v1/ai/completions`, `/v1/ai/actions`)  

### Policy Decision

- Pack-backed enterprise policy evaluation  
- Policy packs and obligations  
- Authoritative Decision in `policy_evaluations`  
- Machine Decision immutable; human resolution additive  

### Enforcement

- Gateway-controlled block / transform / tokenize (where supported)  
- Model eligibility  
- Client commit authorization (`commit_allowed`)  
- Fail-closed behavior when authority cannot be established  

### Human Review

- REVIEW holds  
- Approver roles (`ADMINISTRATOR`, `GOVERNANCE_REVIEWER`)  
- Resolve + resume with binding validation (`CONTEXT_MISMATCH` on omit/mismatch)  

### Evidence

- Decision detail and narrative  
- Audit hash/HMAC chain; checkpoints; optional anchoring  
- Outcome receipts (`evidence_class: client_reported`)  

### Deployment

- Connected and air-gapped appliance/container deployment  
- Local model runtime (stub/Ollama)  
- Admin console for operators  
- Signed license install / Foundry360 license issuer (vendor-side)  

### Operator surfaces (existing; not redesigned here)

- Decisions (primary), Policies, Applications, Agents, Tools, Models, Audit, Overview, Administration  

---

## 7. Product boundaries — what Enigma is NOT

| Not | Why |
|-----|-----|
| **IAM** | Complements IdP/access; does not replace enterprise IAM |
| **GRC** | Not a compliance program / risk-register product |
| **DLP** | Not a generic enterprise DLP platform |
| **SIEM** | Not security event management replacement |
| **Model governance / MLOps** | Models are substrate, not the commercial hero |
| **Workflow / BPM** | REVIEW is governance control, not a general workflow engine |
| **Enterprise data governance** | Not a data catalog or universal resource governor |
| **Universal execution proxy** | Does not control every external SoR side effect |
| **Universal connector platform** | Connectors are not the Product 1.0 category |
| **Healthcare GRC** | Healthcare packs are optional vertical policy, not product identity |

---

## 8. Enforcement boundary (commercial honesty)

Aligned with [`ENIGMA_INTEGRATION_CONTRACT.md`](./ENIGMA_INTEGRATION_CONTRACT.md).

### Gateway-enforced

Enigma controls the model/transform/block path it executes (typical completions path).

### Client-commit-required

Enigma **authorizes** the governed action and issues `commit_allowed`.  
The **customer client/system** performs the external side effect and should report Outcome.

**Product 1.0 commercial promise:**

> Enigma governs and enforces AI actions at the boundaries it controls, and provides an authoritative authorization and evidence contract where external execution remains client-controlled.

**Never claim in sales copy without qualification:**

> Enigma executes every enterprise side effect.

---

## 9. Customer responsibility model

| Area | Enigma | Customer / client |
|------|--------|-------------------|
| Policy evaluation | Owns | Configures packs/policies |
| Actor binding | Owns (enforce mode) | Registers Agents/Tools; supplies ids |
| Action governance | Owns server facts | Supplies operation/kind/target/safe attrs |
| Decision | Owns | Must honor |
| REVIEW hold | Owns | Provides authorized approvers |
| Gateway enforcement | Owns on Gateway path | Must route governed AI through Enigma |
| External DML | Not on client-commit path | Owns execution after `commit_allowed` |
| Outcome | Records/seals | Reports actual result |
| Evidence | Maintains Enigma evidence | Maintains required external records |
| Bypass prevention | Within Enigma boundary | Organizational routing discipline |

---

## 10. Commercial architecture diagram

```text
                 ENTERPRISE AI
                      │
          ┌───────────┴───────────┐
          │                       │
       Agents                 AI Apps
          │                       │
          └───────────┬───────────┘
                      │
                      │  (must call Enigma to be governed)
                      ▼
              ┌──────────────┐
              │    ENIGMA    │
              │ Bind         │
              │ Decide       │
              │ Enforce      │
              │ Review       │
              │ Prove        │
              └──────┬───────┘
                     │
          ┌──────────┴──────────┐
          │                     │
     AI Models            Enterprise Systems
  (Gateway-enforced       (client-commit path:
   when on Gateway path)   authorize → execute → Outcome)
```

Traffic that **bypasses** Enigma is outside the product promise.

---

## 11. Deployment model (what exists)

| Model | Status | Notes |
|-------|--------|-------|
| **Enigma Appliance** (containerized stack / compose) | **Product 1.0** | Gateway + Postgres + admin + optional local models |
| **Connected deployment** | **Product 1.0** | Allowlisted egress; optional external models with BYOK |
| **Air-gapped deployment** | **Product 1.0** | Local runtime; fail-closed when local unavailable |
| VM / physical form factors | Documented target appliance model | Packaging/ops docs; not a separate product SKU |
| Multi-tenant public SaaS | **Not Product 1.0** | Do not sell as SaaS |
| Managed service | **Not claimed** | Unless separately contracted ops |

Enigma stores **governance metadata and evidence**, not the customer system of record.

---

## 12. Healthcare (optional vertical)

Healthcare policy packs contribute obligations through the **same** EPA:

- HIPAA  
- 42 CFR Part 2  
- ONC / HTI-1  
- CMS  

**Commercial position:** optional **Healthcare Policy Pack** on Enigma Core — sales wedge for regulated buyers, **not** the definition of Enigma.

Do **not** sell:

- Healthcare PDP  
- HIPAA PDP  
- CMS PDP  
- Separate healthcare governance engine  

---

## 13. Commercial packaging model

### Core platform — Enigma Product 1.0

**Enigma AI Action Governance Gateway** including:

- Bind / Decide / Enforce / Review / Prove  
- Agent/Tool substrate  
- Action governance  
- Decisions + evidence + audit integrity  
- Appliance deploy (connected + air-gap)  
- Admin console  

### Optional add-ons

| Add-on | Role |
|--------|------|
| **Healthcare Policy Pack** | Vertical policy obligations |
| Other framework packs (ISO/NIST/EU/SOC2, …) | Optional/thin; **not** Product 1.0 hero |
| Local model / Ollama capacity | Deployment option, not separate category |

### Not separately monetized as “products” in 1.0

- Individual Decision Story UI  
- Single registry screens  
- Audit integrity primitives as standalone SKUs  
- “Agent governance” or “Tool governance” as separate products  

---

## 14. SKU / edition recommendation

**Recommendation for Product 1.0 commercial offer:**

```text
1. Enigma Core (Enterprise)     — one primary SKU
2. Healthcare Policy Pack       — optional add-on SKU
3. Deployment posture           — Connected | Air-gapped (same Core, different install)
```

**Do not** launch a maze of editions (Community / Pro / Ultimate) for Product 1.0.

**Rationale:** The product value is the governance gateway itself. Fragmenting Core into many editions before field pricing evidence creates packaging debt. Vertical packs are the natural expansion axis.

**Wait until Product 1.1+:** usage tiering SKUs, connector packs, deeper SoR adapters, managed service SKUs.

---

## 15. Licensing model analysis (no prices)

### Candidate dimensions

| Dimension | Fit | Tradeoff |
|-----------|-----|----------|
| **Platform license per production deployment** | **Strong** | Matches appliance economics; simple procurement |
| **Environment count** (prod/non-prod) | Strong | Common enterprise pattern |
| **AI Decisions / actions volume** | Medium–Strong as capacity/support band | Aligns with value; harder to meter early |
| **Governed applications** | Medium | Easy to count; may understate agent fan-out |
| **Agents / Tools** | Medium | Aligns with actor substrate; can discourage registration honesty |
| **Policy packs** | **Strong as add-on** | Clear optional value |
| **Named support** | Strong | Separate from software license |

### Recommended Product 1.0 licensing posture

1. **Primary:** Platform license **per production Enigma deployment** (appliance instance / customer production environment).  
2. **Secondary (capacity):** Soft bands on Decisions/actions for support sizing — not hard SaaS metering until metering is trustworthy.  
3. **Add-on:** Healthcare (and later) policy packs.  
4. **Support:** Enterprise support / implementation services as commercial line items.

**Avoid as sole metric:** generic “seats” (console users are few) or “models managed” (wrong category).

**No final dollar prices in this document.**

---

## 16. Buyers and ICP

### Roles

| Role | Type | Interest |
|------|------|----------|
| CIO / CTO / Chief AI Officer | **Economic** (often) | AI scale with control |
| CISO / security architecture | **Technical + risk** | Bypass, enforcement honesty, evidence |
| Enterprise / AI architect | **Technical buyer** | Integration contract, PDP singularity |
| AI governance / risk / compliance lead | **Governance buyer** | Policy packs, REVIEW, evidence |
| Healthcare IT / clinical informatics (vertical) | Economic or influencer | Healthcare pack |
| Platform / ops admin | **Operational user** | Console, Decisions, Audit |
| Application owners / agent builders | Integrators | `commit_allowed`, Outcome |

### Ideal customer profile (Product 1.0)

Organizations where:

- AI agents/apps are past pure experimentation  
- AI can initiate or propose consequential system actions  
- Regulated or high-assurance auditability matters  
- IAM/GRC alone do not provide action-time Decisions  
- Controlled or air-gapped deployment may be required  

**Healthcare** is a strong ICP segment, **not** the only ICP. Financial services, government, and large digital enterprises with agentic automation are also in-scope where the Action Decision problem is real.

---

## 17. Strongest Product 1.0 use cases

1. **Govern an AI agent’s tool/write action** — Agent → Tool → Enigma Decision → allow/deny/review → commit_allowed → Outcome.  
2. **Govern AI-driven enterprise updates** — AI proposes a field/record change; Enigma authorizes before client commit.  
3. **Human-in-the-loop for high-consequence actions** — REVIEW → authorized approver → resume with binding.  
4. **Govern regulated AI activity** — Healthcare packs contribute obligations on the same Decision path.  
5. **Govern air-gapped / local AI** — Local models behind Enigma with fail-closed posture.  
6. **Govern completions with controls** — TOKENIZE/transform/eligibility on the Gateway path.

Do not sell use cases that require universal SoR proxy, IdP replacement, or SIEM.

---

## 18. Node2AI identity — migration recommendation

**Commercial identity target:** one product name — **Enigma**.

| Class | Examples | Treatment |
|-------|----------|-----------|
| **Historical / legacy** | `docs/legacy/*`, `apps/`, `packages/`, blockchain docs | Retain as historical; label **reference only**; do not use in customer decks |
| **Product-facing** | Root README, `gateway/README.md`, install/ops/pilot, startup banner | **Updated to Enigma** (Workstream 6) |
| **Technical compatibility** | npm scopes `@node2ai/*`, Docker DB user `node2ai`, health `service: node2ai-gateway`, env defaults | **Preserve** until a versioned rename; document as implementation identifiers, not brand |
| **Vendor tooling** | Foundry360 License Manager | Correct: Foundry360 issues licenses; **Enigma** verifies |

**Recommendation:** Treat Node2AI as **predecessor / monorepo heritage**, not a competing product. Customer-facing materials and `docs/` Product 1.0 set should say **Enigma**. Code package names may remain `@node2ai/*` until a planned rename.

**P1 follow-up (docs/strings):** Align `gateway/README.md`, install/ops pilot docs, and console-facing product name with Enigma. **Do not** mass-replace package scopes in Product 1.0 hardening without a migration plan.

---

## 19. Canonical terminology

| Term | Canonical meaning |
|------|-------------------|
| **Enigma** | The commercial product |
| **AI Action Governance** | Primary category |
| **AI Governance Gateway** | Architectural / deployment role |
| **Decision** | Authoritative policy evaluation (`policy_evaluations`) |
| **Action** | Governed AI operation/attempt |
| **Agent** | Governed AI actor (facts) |
| **Tool** | Governed capability (facts) |
| **Policy** | Governance rules/obligations |
| **Policy Pack** | Domain/regulatory contribution into EPA |
| **Enforcement** | Control at Enigma boundary |
| **Review** | Human governance intervention on REVIEW |
| **Approver** | Authorized human resolving REVIEW (≠ end user) |
| **Outcome** | Post-decision reported result |
| **Evidence** | Proof of Decision / enforcement / reported Outcome |
| **`commit_allowed`** | Authorization to proceed on client-commit path — **not** Enigma-executed DML |
| **Node2AI** | Historical / technical heritage — not the Product 1.0 brand |

### Terminology conflicts found

| Conflict | Resolution |
|----------|------------|
| Root README markets “Node2AI Enterprise Platform” (sanitization/orchestration) | **Superseded** by Enigma root README (Workstream 6); legacy narrative remains only under `docs/legacy` / `apps/` |
| “AI Governance Gateway” alone | Valid secondary role; do not replace Action Governance category |
| “Compliance reporting / GRC” language in legacy materials | Out of Product 1.0 identity |
| Overview historically “Authority Console” vs “AI Action Governance” | Product messaging preference; UI frozen in this workstream |

---

## 20. Commercial claims audit

### Safe (implementation-supported)

- Enigma produces an authoritative Decision for governed requests on its path  
- Agent/Tool authorization facts are server-authoritative in enforce mode  
- DENY does not yield `commit_allowed`  
- REVIEW requires authorized approver; end user cannot self-authorize  
- Historical Decision snapshots survive later registry changes  
- Air-gapped local-model deployment is supported  
- Healthcare packs evaluate through the same EPA  

### Conditional (qualify always)

- “Prevents unauthorized AI actions” → **on the Enigma path**; bypass remains customer risk  
- “Controls AI writes” → **authorizes** on client-commit; Gateway does not always execute DML  
- “Proves what happened” → Decision + enforcement + **reported** Outcome; Outcome is client-reported  
- “HIPAA compliance” → pack obligations contribute to Decisions; **does not guarantee** organizational HIPAA compliance  

### Unsafe (do not claim)

- Enigma controls every AI system in the enterprise  
- Enigma executes all enterprise changes  
- Enigma guarantees compliance / prevents all data leakage  
- Enigma replaces IAM, GRC, DLP, or SIEM  
- Enigma is a multi-tenant SaaS control plane (unless such offering exists — it does not in Product 1.0)  

---

## 21. Competitive / adjacent boundary

| Adjacent category | Typical focus | Relationship to Enigma |
|-------------------|---------------|------------------------|
| IAM | Identity/access | Complementary |
| GRC | Programs/risk registers | Complementary |
| DLP | Data movement | Complementary |
| SIEM | Security telemetry | Complementary |
| Model governance | Model lifecycle | Complementary substrate |
| AI observability | Monitoring | Complementary |
| AI gateway (routing) | Model routing | Adjacent; Enigma is policy Decision + Action focus |
| **AI Action Governance** | Action-time Decision/enforce/review/proof | **Enigma’s category** |

No competitor attack claims. Category clarity only.

---

## 22. Recommended commercial packaging (summary)

| Question | Recommendation |
|----------|----------------|
| 1. Core Product 1.0? | **Enigma Core** — AI Action Governance Gateway (appliance) |
| 2. Optional? | **Healthcare Policy Pack**; other framework packs thin/optional |
| 3. What to license? | Platform per production deployment + pack add-ons + support |
| 4. What NOT to monetize separately? | Individual UI modules, Agent/Tool as separate products, audit primitives as SKUs |
| 5. Policy-pack add-on? | Yes — Healthcare first |
| 6. Deployment dimensions? | Connected vs air-gapped (install posture, same Core) |
| 7. Initial commercial offer? | Enigma Core Enterprise + optional Healthcare Pack + support |
| 8. Wait for 1.1+? | SaaS, connector marketplace, hard usage metering, multi-edition maze, universal execution proxy |

**No final prices.**

---

## 23. Product 1.0 vs future

### Product 1.0 (sell now)

- Bind → Decide → Enforce → Review → Prove on Gateway path  
- Agent/Tool/Action as facts  
- Client-commit honesty  
- Evidence stack  
- Appliance connected + air-gap  
- Optional healthcare packs  
- Integration contract  

### Product 1.1 / future (do not sell as current)

- Deeper SoR execution boundaries / adapters  
- Broader connectors / MCP productization  
- Richer independent Outcome verification  
- IdP/SSO packaging polish  
- Hard Decision metering SKUs  
- Additional vertical packs as commercial lines  
- Full Node2AI → Enigma package-scope rename  

---

## 24. Related documents

| Document | Role |
|----------|------|
| [`ENIGMA_PRODUCT_1_0.md`](./ENIGMA_PRODUCT_1_0.md) | Product definition & readiness |
| [`ENIGMA_ARCHITECTURE.md`](./ENIGMA_ARCHITECTURE.md) | Technical architecture |
| [`ENIGMA_INTEGRATION_CONTRACT.md`](./ENIGMA_INTEGRATION_CONTRACT.md) | Enterprise integration & enforcement |
| [`ACTION_GOVERNANCE.md`](./ACTION_GOVERNANCE.md) | Action facts |
| [`appliance-model.md`](./appliance-model.md) / [`airgap-model.md`](./airgap-model.md) | Deployment |
| [`SECURITY.md`](./SECURITY.md) | Security notes |

---

*Canonical commercial definition for Enigma Product 1.0. Implementation and integration contract remain authoritative for technical claims.*
