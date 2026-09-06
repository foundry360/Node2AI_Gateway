# Enigma — Product Architecture & Experience Review

**Status:** Inspection and design review (no implementation in this pass)  
**Date:** 2026-09-05  
**Test baseline at review:** 161/161 passing  
**Product thesis:** Enigma governs AI actions from policy to proof.  
**Invariant:** Agent reasons · Policy decides · Gateway enforces

Related:

- [ENIGMA_PRODUCT_DIFFERENTIATION.md](./ENIGMA_PRODUCT_DIFFERENTIATION.md)
- [HEALTHCARE_POLICY_DOMAIN.md](./HEALTHCARE_POLICY_DOMAIN.md)
- [HEALTHCARE_POLICY_PACKS.md](./HEALTHCARE_POLICY_PACKS.md)
- [HEALTHCARE_POLICY_RESOLUTION.md](./HEALTHCARE_POLICY_RESOLUTION.md)

---

## Executive Summary

**Enigma today is an AI governance decision and enforcement console** for the Node2AI Gateway appliance. It is not an assessment suite, GRC platform, healthcare ontology browser, or Outcome analytics product.

What is materially real in code:

| Capability | Reality |
| --- | --- |
| Multi-pack policy resolution | Implemented (AGREEMENT / COMPLEMENTARY / RESTRICTIVE / CONFLICT / UNRESOLVED) |
| HIPAA Pack #1 + 42 CFR Part 2 Pack #2 | Implemented as packs, not product UI branches |
| Authoritative decision history | `policy_evaluations` |
| First-class Decisions experience | `/decisions` + `/evaluations/:id` |
| Decision explanation + provenance | `DecisionExplanationView` (rule → obligation → citation → source → tier) |
| Expected Action | Derived from decision (`deriveDecisionConsequence`) |
| Verified Enforcement Result | Derived only when Gateway audit joins (`projectEnforcementResult`) |
| Audit integrity chain | Operational evidence, not decision authority |
| Assessment / Intelligence / Opportunities / Business Case / Outcomes hubs | **Do not exist as product surfaces** |

A prospect opening the console **can** understand Enigma as a governance decision/enforcement platform — especially via Overview → Decisions → Decision detail. Residual assessment/GRC smell remains only in **collapsed, explicitly non-authoritative** Insights heuristics (risk / compliance score / action items).

The core lifecycle **Policy → Decision → Expected Action → Verified Enforcement → Evidence** is demonstrable. **Outcome** and **human resolution of REVIEW/CONFLICT** are the main unfinished governance layers. **Commercial/value surfaces** (Opportunities, Business Case, Deployment program, Outcomes ROI) are absent and correctly out of scope for the core product.

---

## Current Product Map

### Navigation (actual)

| Nav label | Route | Purpose |
| --- | --- | --- |
| Overview | `/` | Governance attention + appliance posture |
| Applications | `/applications` | Governed callers / keys |
| Policies | `/policies` | Packs + executable policy lifecycle |
| Decisions | `/decisions` | Authoritative evaluation list |
| Models | `/models` | Model/provider registry (eligibility substrate) |
| Audit | `/audit` | Operational / integrity trail |
| System settings | `/system` | Appliance, DB, orgs |

Deep routes: `/policies/:policyId` (incl. Simulate + Evaluations tabs), `/evaluations/:evaluationId` (Decision detail), `/applications/:applicationId`, `/login`.

### Named concepts from earlier roadmaps — verified status

| Concept | Exists as product? | Actual manifestation |
| --- | --- | --- |
| Intelligence | **No route/nav** | Operator “decision intelligence” = `DecisionExplanationView` + Overview attention |
| Assessments | **No** | Only demoted Insights heuristics |
| Opportunities | **No** | — |
| Business Case | **No** | — |
| Deployment (program) | **No** | System “Deployment mode” = appliance config only |
| Outcomes | **No** | — |
| Connections | **No product** | System DB connection pool metric only |
| Gateway (page) | **No dedicated page** | Runtime orchestrator + Models + Audit + enforcement projection |
| Simulate | **Policy tab only** | `POST .../simulate` → recorded as `phase=simulate` |
| Evaluations | Shared with Decisions | Detail at `/evaluations/:id` |

### Feature inventory (verified)

| Area | User can do | Data used | API | Authority | Lifecycle role | Differentiation |
| --- | --- | --- | --- | --- | --- | --- |
| Overview Insights | See what needs attention; optional heuristics | Evaluations + overview + insights APIs | `evaluations`, `overview`, `insights/*` | Decisions authoritative; heuristics **derived** | UNDERSTAND / DECIDE attention | Strengthens (attention); heuristics weaken if expanded |
| Overview Status | See appliance/pack posture | Overview + packs | `overview`, `policy-packs` | Config/registry authoritative | UNDERSTAND / GOVERN | Neutral–positive |
| Overview Triage | Browse recently blocked ops | Audit-derived blocked | `overview` | Audit ops | ENFORCE / PROVE (ops) | Mild overlap with Audit |
| Applications | Register apps/keys; see activity | Identity + audit activity | `applications`, `api-keys`, activity | Identity authoritative | GOVERN context | Strengthens |
| Policies | Lifecycle packs; inspect definition | EPA repository | `policy-packs`, `policies/*` | Pack/policy authoritative | GOVERN | Strengthens |
| Simulate | What-if PDP (no model) | Live PDP → evaluation | `simulate` | Decision recorded; enforcement **NOT_EXECUTED** | DECIDE | Strengthens (engine demo) |
| Decisions list | Filter/browse decisions | `policy_evaluations` + audit join | `evaluations?filter=` | Decision authoritative; enforcement verified when joined | DECIDE / ENFORCE | **Core differentiator** |
| Decision detail | Why + expected action + enforcement + provenance | Evaluation + audit | `evaluations/:id` | Same split | DECIDE / ENFORCE / PROVE | **Core differentiator** |
| Models | Register/activate models | Registry | `models` | Registry authoritative | GOVERN / ENFORCE substrate | Neutral |
| Audit | Inspect ops + integrity | `audit_events` | `audit`, `audit/integrity` | Ops authoritative | PROVE (ops) | Strengthens proof story |
| System | Appliance config | Config/DB/orgs | `system` | Config authoritative | UNDERSTAND (ops) | Neutral |
| Risk / Compliance / Action items | Optional Insights cards | Heuristic/LLM | `insights/*` | **Non-authoritative** | UNDERSTAND (misaligned if primary) | **Weakens if elevated** |

---

## Lifecycle Mapping

```text
UNDERSTAND → GOVERN → DECIDE → ENFORCE → PROVE → OUTCOME
```

### Strong

| Stage | What is strong |
| --- | --- |
| **GOVERN** | Pack-backed policies, lifecycle (validate/approve/activate/suspend/retire), multi-pack resolution, Applications as governed callers |
| **DECIDE** | PDP, Simulate, `policy_evaluations`, Decisions nav, DecisionExplanationView, expected action |
| **ENFORCE** | Gateway orchestrator path; verified enforcement projection when `request_id` joins audit |
| **PROVE** | Provenance chain on the decision; audit integrity chain for ops |

### Partial

| Stage | What is partial |
| --- | --- |
| **UNDERSTAND** | Applications + Overview attention work; “Intelligence” is not a named capability; Insights heuristics still present (demoted) |
| **ENFORCE** | Correlation works for live completions after `request_id` stamping; pre-correlation / simulate / missing audit → UNKNOWN or NOT_EXECUTED; no dedicated Gateway UI |
| **DECIDE (REVIEW)** | REVIEW/CONFLICT can be produced and listed; wire path maps REVIEW→BLOCK; **no human authorization workflow** |
| **PROVE** | Evidence split across evaluation explanation and audit; no single “evidence package” export |

### Missing

| Stage | Missing |
| --- | --- |
| **OUTCOME** | No Outcome object, API, UI, or persistence (correctly deferred) |
| **Human review loop** | No approve/deny-after-REVIEW, no disposition on conflicts |
| **Intelligence product** | No signal layer beyond Overview attention + demoted heuristics |
| **Commercial layer** | Opportunities / Business Case / Deployment program / ROI Outcomes |

### Misaligned (relative to differentiation)

| Item | Why |
| --- | --- |
| Compliance score % | Sounds like assessment certification; already labeled non-authoritative and collapsed |
| Risk classification donut | Assessment dashboard pattern |
| Top action items | Soft remediation checklist |
| Dual legacy `PolicyStore` + EPA | Architectural debt; can confuse “which policy is binding” |

These do **not** require removal in this review, but they must not regain Overview primacy.

---

## Object Model

```text
Policy
   ↓
Decision          ← policy_evaluations (authoritative)
   ↓
Action            ← expected action (derived)
   ↓
Enforcement Result ← Gateway audit join (verified when present)
   ↓
Evidence          ← provenance on decision + integrity on audit
   ↓
Outcome           ← NOT BUILT (future consequence layer)
```

| Object | Representation today | Authoritative? |
| --- | --- | --- |
| **Policy** | Pack policies / EPA registry (+ legacy store) | Yes (EPA for decisions) |
| **Decision** | `PolicyEvaluationRecord` | **Yes** — `policy_evaluations` |
| **Action** | `expected_action` / `action_summary` | **Derived** from decision |
| **Enforcement Result** | `EnforcementProjection.status` | **Verified only with audit join**; else UNKNOWN / NOT_EXECUTED |
| **Evidence** | Explanation provenance + audit hashes | Decision evidence vs ops evidence (separate) |
| **Outcome** | — | Missing by design |

---

## Authority Model

| Concern | Authority | Explicitly not |
| --- | --- | --- |
| **Decision** | `policy_evaluations` | Audit events, Insights, compliance score |
| **Expected Action** | Derived from Decision | Must not be labeled as executed |
| **Enforcement** | Gateway runtime → `audit_events` (joined) | Consequence narrative without audit |
| **Audit / ops history** | `audit_events` (+ integrity chain) | Decision explanation / pack resolution |
| **Provenance** | Stored on evaluation explanation (pack catalogs) | Legal certification / “you are compliant” |
| **Future Outcome** | TBD — should be derived from Decision + verified Enforcement (+ optional business context) | Must not be owned by Insights heuristics |

**Correlation today:** `request_id` on evaluation ↔ audit (primary); `metadata.evaluation_id` fallback on detail.

---

## Product Boundary

### What Enigma is

> An **AI governance decision and enforcement system**: executable policy packs decide what is permitted; the Gateway enforces; evaluations and provenance prove why; operators attend to decisions that need review.

### What Enigma is not

| Category | Avoid becoming |
| --- | --- |
| Assessment platform | Periodic questionnaires, maturity scores as the product |
| GRC platform | Control libraries, attestations, audit prep workflows, remediation plans as core |
| Policy repository | Document storage without executable PDP |
| Conventional AI Gateway | Routing/proxy without policy decision + proof |
| AI Observability | Telemetry dashboards without binding decisions |
| Outcome analytics / ROI | Business impact scoring (deferred commercial layer) |

### Commercial vs governance layers

| Layer | Belongs |
| --- | --- |
| **Core governance product** | Policies, Decisions, Simulate, Enforcement, Audit, Applications, Models, Overview attention |
| **Enterprise adoption / value layer (later)** | Opportunities, Business Case, Deployment programs, Outcome ROI / value stories |

Do not force commercial lifecycle objects into Policy → Decision → Enforcement.

---

## UX Findings

### What works

1. **First impression (Overview lede):** “What requires governance attention? Enigma governs AI actions from policy to proof.”
2. **Decisions as first-class nav** next to Policies — correct information architecture.
3. **Decision detail sequence:** Decision → Expected Action → Enforcement (UNKNOWN when unverified) → Explanation → Provenance.
4. **Authority language** in Decisions/Evaluation copy (`policy_evaluations` vs Audit vs Gateway).
5. **Simulate** remains under Policies — demonstrates the engine without inventing a fake top-level stage.
6. **Heuristics collapsed** and labeled non-authoritative.

### What is confusing

1. **Models vs “Gateway”** — prospects may look for a Gateway page; enforcement lives in runtime + Decision enforcement panel + Audit.
2. **Simulate vs live Decisions** — both create evaluations; Simulate correctly yields `NOT_EXECUTED`, which can confuse demos if not narrated.
3. **Input + output evaluations** share one `request_id` / one audit — list join shows latest audit for both.
4. **REVIEW** listed as review but enforced as BLOCK on the wire — without a resolution workflow, it reads like a finding, not an operating state.
5. **Overview Triage** (blocked ops from audit) overlaps Audit and Decisions attention.

### Remaining assessment/GRC drift

- Risk classification, compliance %, action items (Insights, collapsed).
- Application “governance posture” language can sound checklist-like (still operational readiness, not a score product).
- No Assessments / Opportunities / Business Case / Outcomes product IA exists — **drift is residual widgets, not a parallel product**.

### Positioning verdict

> **Yes — a careful prospect can understand Enigma as an AI governance decision and enforcement platform rather than an assessment/GRC application**, provided the demo path goes Overview → Decisions → Decision detail (and optionally Policies → Simulate). The remaining GRC smell is contained and demoted; the risk is elevating Insights heuristics or building Assessments/Intelligence as score dashboards.

---

## Role of Intelligence

**Recommendation:** Intelligence should mean **governance signals**, not generic analytics.

**Question it should answer:**

> What is happening in the AI environment that requires governance?

**Already available (enough for now):**

- Review / denied / conflict / controls counts from evaluations
- Recent decisions with expected action + enforcement status
- Blocked ops triage (audit)
- Enforcement failures (`FAILED`) when audit joins

**Missing for a richer signal layer:**

- Recurring exception patterns over time
- Policy coverage heat (which packs never fire)
- Trend of UNKNOWN vs verified enforcement
- Dedicated human-review queue depth

**Structural recommendation:**

| Option | Verdict |
| --- | --- |
| Separate top-level Intelligence nav | **Not yet** — duplicates Overview; adds IA without new authority |
| Overview capability | **Yes — keep** (`GovernanceAttentionPanel` + Status/Triage) |
| Future signal layer | **Yes — later**, fed by Decisions + Enforcement, never by compliance % |
| Unnecessary complexity | Building a charts hub would be |

**Intelligence = Overview governance attention + future signals derived from authoritative decisions/enforcement.** Do not rebuild Insights as Intelligence.

---

## Role of Assessments

**Findings:** There is **no Assessments product** in the admin app. Assessment-like behavior is only Insights heuristics.

| Option | Verdict |
| --- | --- |
| A — Standalone assessment capability | **Reject** for core product |
| B — Input into governance | Soft: app/environment context already comes from Applications + interrogation |
| C — Reframe as UNDERSTAND | Accept only as **demoted context**, not a product name |
| D — Significantly reduced | **Preferred posture** — keep collapsed; do not invest |

**Architectural relationship:**

```text
Environment (Applications, Models, classification)
        ↓
Policy (packs)
        ↓
Decision / Enforcement
```

Assessment does **not** sit on the critical path. Elevating it would imply assessment is the product.

---

## Opportunities / Business Case / Deployment / Outcomes

| Surface | Classification |
| --- | --- |
| Opportunities | **Commercial / value layer** — not governance lifecycle |
| Business Case | **Commercial / value layer** |
| Deployment (program) | **Adoption / implementation layer** (distinct from System deployment mode) |
| Outcomes (ROI / impact) | **Value layer** after enforcement is trustworthy |

Keep them out of core nav until governance demo is airtight. System “Deployment mode” stays appliance ops.

---

## Minimum Outcome Model (design only — do not build)

### Distinctions

| Term | Meaning |
| --- | --- |
| **Enforcement Result** | Did Gateway successfully apply the required action? (`BLOCKED`, `ALLOWED`, `CONTROLS_APPLIED`, `FAILED`, …) |
| **Outcome** | What consequence followed for the governed action / risk posture? |

Examples:

```text
Decision DENY → Action BLOCK → Enforcement BLOCKED
Outcome: Unauthorized processing prevented

Decision ALLOW_WITH_CONTROLS → Action APPLY_CONTROLS → Enforcement CONTROLS_APPLIED
Outcome: Sensitive data processed within policy constraints
```

### Design constraints for a future Outcome

| Question | Answer |
| --- | --- |
| Information required | Decision + verified Enforcement (+ optional obligation fulfillment) |
| System owner | Governance layer (derived), not Audit alone |
| Can Enigma derive it? | **Minimally yes** as narrative templates from Decision+Enforcement; richer outcomes need business context |
| When to persist? | Only after verification is trusted in production and customers ask for outcome records |
| What NOT to build yet | Analytics, ROI, impact scoring, predictive outcomes, outcome dashboards |

**Stop condition for this review:** Outcome remains conceptual. Enforcement Result is the current terminal proof of action.

---

## Architecture Gaps (document only)

1. **Human review workflow missing** — REVIEW/CONFLICT decisions have no operator disposition → authorized release / confirmed deny.
2. **REVIEW maps to BLOCK on the wire** — expected HOLD vs observed BLOCK requires careful projection; no first-class hold state in Gateway.
3. **Evaluation request context often sparse** on live persist (subject/resource/context not fully stamped) — weakens UNDERSTAND reconstruction.
4. **One audit per request vs input+output evaluations** — join semantics are “latest audit wins.”
5. **List APIs load full audit list** to join — fine for pilot scale; not a long-term query design.
6. **`controls_applied` filter** reflects expected controls on the decision, not verified `CONTROLS_APPLIED`.
7. **Simulate evaluations** appear in Decisions unless narrated/filtered — demo hygiene gap.
8. **Legacy PolicyStore + EPA duality** — binding truth is EPA; legacy sync is best-effort.
9. **No Gateway-facing enforcement UI** beyond Decision panel + Audit + Models.
10. **No Outcome object** — intentional.
11. **Insights synthetic request_ids** never join evaluations — correct, but must stay demoted.
12. **Evidence package** split across decision provenance and audit integrity — no unified export.

---

## End-to-End Demonstration

### Ideal flow

```text
AI Agent
  → Attempts action via Gateway
  → Classification / context
  → Policy evaluation (packs + resolution)
  → Decision (policy_evaluations)
  → Expected Action
  → Gateway enforcement
  → Verified Enforcement Result
  → Decision Explanation + Provenance
  → Governance attention / insight
```

### What is demonstrable today

| Step | Status |
| --- | --- |
| Policies / packs govern | **Real** |
| Simulate decision + explanation + provenance | **Real** (enforcement = NOT_EXECUTED) |
| Live completion → evaluation with `request_id` | **Real** (post-correlation work) |
| Live block/allow/tokenize → audit → verified enforcement | **Real when join succeeds** |
| Overview attention from evaluations | **Real** |
| Decisions list → detail | **Real** |
| Human resolve REVIEW | **Not real** |
| Outcome | **Not real** |

### Strongest current demo script

1. **Policies** — show HIPAA + Part 2 packs active.
2. **Simulate** multi-pack scenario → DecisionExplanationView (resolution + provenance).
3. **Decisions** — open the recorded evaluation → Expected Action + `NOT_EXECUTED`.
4. **Live traffic** (or acceptance soak) through Gateway → Decisions shows verified `BLOCKED` / `ALLOWED` / `CONTROLS_APPLIED`.
5. **Audit** — show integrity / ops twin of the same `request_id`.
6. **Overview** — governance attention reflects the decision.

**Demo risk:** Leading with Insights compliance score reverts Enigma to assessment optics. Leading with Simulate alone never shows verified enforcement.

---

## Commercial Differentiation

| Category | They do | Enigma should |
| --- | --- | --- |
| **Assessment** | Score posture periodically | Use environment context only; not the product |
| **GRC** | Controls, attestations, audit prep | Avoid as core IA |
| **Policy management** | Store/version documents | **Execute** policies via PDP + packs |
| **AI Gateway** | Route/proxy/observe | **Enforce decisions** with transforms/block/release |
| **AI Observability** | Metrics/traces | Prefer **decision + enforcement proof** over dashboards |
| **AI Governance (Enigma)** | — | **Policy decides → Gateway enforces → Proof via evaluation + provenance + verified result** |

Material difference today: **binding multi-pack decisions with provenance and verified enforcement**, not questionnaires or gateway telemetry alone.

---

## Recommended Product Structure

Do **not** implement this structure in this pass. Recommendation based on what the app actually needs:

```text
OVERVIEW
  ├── Governance attention (decisions needing review / denied / conflicts / failures)
  ├── Appliance posture (health)
  └── (Optional, collapsed) Non-authoritative heuristics

APPLICATIONS
  └── Governed callers + keys

POLICIES
  ├── Packs / lifecycle
  └── Simulate (tab) + policy-scoped evaluations

DECISIONS
  ├── Filters: All / Review / Allowed / Denied / Conflicts / Controls
  └── Detail: Explanation + Expected Action + Verified Enforcement + Provenance

MODELS
  └── Eligibility substrate for enforcement

AUDIT
  └── Operational evidence + integrity

SYSTEM
  └── Appliance configuration
```

**Not recommended as top-level now:** Intelligence, Assessments, Opportunities, Business Case, Outcomes, Gateway-as-nav, six lifecycle stages as nav.

**Intelligence** remains an Overview concern until signal volume justifies a separate surface fed only by Decisions/Enforcement.

---

## Next Increment

### Ranked candidates (for context)

| Candidate | Differentiation | Value | Leverage | Demo | Complexity / GRC risk |
| --- | --- | --- | --- | --- | --- |
| **Human review / decision resolution** | High | High | High | High | Medium / Low GRC |
| Live demo hardening (filters, context stamp, join UX) | Medium | Medium | Medium | High | Low |
| Gateway enforcement UI surface | Medium | Medium | Medium | Medium | Medium |
| Intelligence signals layer | Medium | Medium | Medium | Medium | Medium (dashboard risk) |
| Outcome (minimal) | Medium | Medium | Low now | Medium | Low if tiny; High if analytics |
| Policy management UX polish | Low–Med | Medium | Low | Low | Low |
| Integrations | High later | High later | High | Low now | High |
| Assessments / Business Case / Opportunities | Low | Sales | Low | Low | **High GRC drift** |
| Pack #3 | Architecture depth | Niche | Medium | Medium | Wrong timing |

### ONE recommended next build

> **Human Review / Decision Resolution for REVIEW and CONFLICT decisions**

**What it is (conceptual):**

When Enigma decides `REVIEW` or resolution is `CONFLICT` / `UNRESOLVED`, an operator can:

1. See the decision in a review queue (subset of Decisions — already filterable).
2. Inspect explanation + provenance (already exists).
3. Record a **disposition** (authorize / deny / escalate) that becomes a subsequent governed action.
4. Produce a **follow-on decision or authorization event** that Gateway can honor — closing the loop from ambiguous decision → enforceable outcome.

**Why this comes before everything else:**

1. **Differentiation** — Assessment tools stop at “finding.” Enigma must **resolve** governance exceptions into enforceable actions.
2. **Customer value** — REVIEW without resolution is operationally useless and looks like a compliance ticket.
3. **Architectural leverage** — Reuses Decisions, explanation, expected action, enforcement projection; minimal new surface if kept inside Decisions.
4. **Demo power** — Completes the story: conflict/review → human authorization → Gateway enforcement → verified result.
5. **Commercial relevance** — Buyers ask “what happens when packs disagree?” Resolution is the answer.
6. **Avoids** Pack #3, Outcome analytics, Insights dashboards, and GRC drift.

**Constraints for that future build:**

- Keep regulatory-agnostic (no HIPAA/Part2 UI branches).
- Prefer dispositions linked to `evaluation_id` / `request_id` over a new GRC case-management system.
- Do not invent Outcome analytics under the guise of review.

---

## Deferred Work

Explicitly **do not build next**:

- Pack #3
- Outcome analytics / ROI / impact scoring / outcome persistence platform
- Assessments product or elevated compliance dashboards
- Opportunities / Business Case / Deployment program IA
- Top-level Intelligence nav / chart hub
- Full Gateway product redesign
- Application redesign / new design system / six-stage top nav
- Giant healthcare ontology
- Regulatory-specific UI components
- Fake metrics
- Large new persistence models unrelated to review disposition
- Refactors of working PDP/resolution/provenance for style

---

## Conclusion

Enigma’s architecture has reached a coherent milestone:

> **Executable multi-pack policy → authoritative decision → expected action → verified Gateway enforcement → provenance proof.**

The product surface largely matches that model. Remaining assessment/GRC residue is demoted. The highest-value unfinished governance capability is **human resolution of REVIEW/CONFLICT**, not Intelligence hubs, Outcomes, or Pack #3.

**Stop.** Do not implement the recommended increment in this review pass.
