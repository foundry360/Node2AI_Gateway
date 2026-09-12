# Enigma — Product Differentiation Architecture

**Status:** Architecture / design pass (no major UI implementation)  
**Date:** 2026-09-05  
**Invariant:** Agent reasons · Policy decides · Gateway enforces  
**Product thesis:** Enigma governs AI actions from policy to proof.

Related:

- [HEALTHCARE_POLICY_DOMAIN.md](./HEALTHCARE_POLICY_DOMAIN.md)
- [HEALTHCARE_POLICY_PACKS.md](./HEALTHCARE_POLICY_PACKS.md)
- [HEALTHCARE_POLICY_RESOLUTION.md](./HEALTHCARE_POLICY_RESOLUTION.md)
- [../enigma/README.md](../enigma/README.md)
- [../request-lifecycle.md](../request-lifecycle.md)
- [../response-lifecycle.md](../response-lifecycle.md)

---

## 1. Current Product Inventory

### What Enigma is today (appliance console)

The Enigma product surface is the **Gateway admin console** (`gateway/admin`): a runtime governance console for the AI Governance Gateway appliance. It is **not** a GRC suite, assessment product, or healthcare use-case library.

**Top-level navigation today**

| Nav | Route | Role |
| --- | --- | --- |
| Overview | `/` | Posture + insights + triage |
| Applications | `/applications` | Governed callers of the gateway |
| Policies | `/policies` | Policy packs / lifecycle |
| Decisions | `/decisions` | Authoritative governance decisions |
| Models | `/models` | Model registration substrate (not authorization) |
| Audit | `/audit` | Tamper-evident operational evidence trail |
| System settings | `/system` | Appliance / DB / orgs |

**Deep routes (not in sidebar)**

| Route | Role |
| --- | --- |
| `/policies/[policyId]` | Policy detail, Simulate, Evaluations list |
| `/evaluations/[evaluationId]` | Historical decision intelligence (opened from Decisions) |
| `/applications/[applicationId]` | App posture, keys, allowlists |

**Screens that do not exist (and should not be invented as GRC features)**

Assessments · Opportunities · Business Case · Outcomes hub · Intelligence hub · Connections catalog · dedicated “Gateway product” separate from this console.

---

### Capability map

| Capability | Route | Primary user question | Underlying object | Current purpose | Lifecycle role | Assessment-like? | Governance-native? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Console Insights | `/` Insights | What needs attention? | Overview + insights APIs | Metrics + risk/compliance/actions | UNDERSTAND | **Yes** | Mixed | Strongest GRC smell |
| Console Status | `/` Status | Is the appliance ready? | Overview + packs | Health + pack rollup | UNDERSTAND / GOVERN | Mild | Yes | Healthier framing |
| Console Triage | `/` Triage | What was blocked? | Audit-derived blocked | Ops attention queue | DECIDE / PROVE | Mild | Yes | Overlaps Audit |
| Applications | `/applications` | What AI callers exist? | Application, ApiKey | Governed app directory | UNDERSTAND / GOVERN | No | Yes | Context for decisions |
| App detail | `/applications/:id` | Is this app ready to be governed? | Application | Allowlists, keys, activity | GOVERN | Mild checklist | Yes | Readiness ≠ assessment score |
| Policies | `/policies` | What packs/policies exist? | Pack, Policy | Lifecycle entry | GOVERN | No | Yes | Executable policies |
| Policy detail | `/policies/:id` | What does this policy govern? | Policy definition | Inspect + lifecycle | GOVERN | No | Yes | Still definition-heavy |
| Simulate | Policy tab | What would Enigma decide? | PolicyDecision (live) | What-if PDP | DECIDE | No | Yes | Uses DecisionExplanationView |
| Evaluations list | Policy tab | What was decided historically? | PolicyEvaluationRecord | Decision index | DECIDE / PROVE | No | Yes | From `policy_evaluations` |
| Evaluation detail | `/evaluations/:id` | Why this decision? | PolicyDecision projection | Decision intelligence | DECIDE / PROVE | No | Yes | Not first-class in nav |
| DecisionExplanationView | Component | Why / who / what enforces? | explanation.operator/resolution/provenance | Explain multi-pack decisions | DECIDE / PROVE | No | Yes | Core differentiator |
| Models | `/models` | What models can policy select? | Model, Provider | Registration | UNDERSTAND / ENFORCE | No | Yes | Eligibility substrate; EPA authorizes per request; input `policy_evaluations.restrictions.eligible_models` is historical proof of authorization; Audit proves selection/execution |
| Audit | `/audit` | What happened operationally? | AuditEvent | Integrity trail | PROVE (ops) | No | Yes | Not decision authority |
| System | `/system` | How is the appliance configured? | System / DB | Ops | UNDERSTAND | No | Partial | Includes DB “connections” metric |
| Compliance score card | Insights | How “compliant” are we? | Heuristic scores | Framework % | UNDERSTAND | **Yes** | Weak | Contradicts “not assessment” docs |
| Risk donut | Insights | How risky is traffic? | Blocked-event rollup | Risk classification | UNDERSTAND | **Yes** | Mild | Dashboard pattern |
| Action items | Insights | What should I do next? | Heuristic/LLM items | Soft remediation | UNDERSTAND | **Yes** | Mild | Pseudo-outcomes |
| Gateway pipeline | Runtime | How is the decision enforced? | Orchestrator | Enforce | ENFORCE | No | Yes | No dedicated “Gateway” nav |

---

## 2. Canonical Product Model

Enigma is a **Governance Operating System for AI**.

Product capabilities (not necessarily six nav items):

```text
UNDERSTAND
What exists in my AI environment, and what context matters for governance?

        ↓

GOVERN
What rules govern this AI action?

        ↓

DECIDE
What is permitted?

        ↓

ENFORCE
What happens because of the decision?

        ↓

PROVE
Why did this happen, and can we demonstrate it?

        ↓

OUTCOME
What actually happened?
```

### One-line product answer

> **Enigma governs AI actions from policy to proof.**

Not: an assessment platform · a GRC checklist · a regulatory document browser · a healthcare app catalog.

---

## 3. Governance Object Model

Canonical relationship (conceptual — not a single forced DB hierarchy):

```text
POLICY
  defines what governs (packs · policies · rules · obligations · citations)

   ↓

DECISION
  records what Enigma decided (policy_evaluations is authoritative)

   ↓

ACTION
  records what the Gateway attempted because of the decision
  (block · allow · transform · tokenize · detokenize · route/approval · restrict release)

   ↓

EVIDENCE
  records why the decision/action is defensible
  (provenance · citations · authorities · resolution · integrity seals)

   ↓

OUTCOME
  records what actually resulted
  (completed · blocked · approved · failed · exception · override · control success/failure)
```

### Ownership

| Object | Authority store | Today | Notes |
| --- | --- | --- | --- |
| **Policy** | EPA packs / policies / versions | Implemented | Pack-agnostic runtime + docs-as-code packs |
| **Decision** | `policy_evaluations` | Implemented | Distinct from audit events |
| **Action** | Implicit in Gateway orchestrator + audit fields | **Partial** | Not a first-class persisted Action entity |
| **Evidence** | Decision explanation provenance + audit integrity | **Split** | Decision-why vs ops-what must stay separate |
| **Outcome** | Not a first-class product object | **Missing** | Runtime “ResolvedPolicyOutcome” ≠ business Outcome |

### Critical distinctions (do not collapse)

| Concept | Question |
| --- | --- |
| Decision | What did Enigma determine? |
| Action | What did the system attempt to do? |
| Enforcement result | Did that action succeed? |
| Outcome | What was the end state for the request / session / exception? |
| Audit event | What operational events occurred? |
| Regulatory obligation | What does the authority require? |
| Enigma control | What implementation mechanism did Enigma apply? |

---

## 4. Current vs Target Product Model

| Capability | Current | Target |
| --- | --- | --- |
| UNDERSTAND | Apps, models, system posture, Insights metrics | Governance context: apps · models · packs · domains · applicability — **without** compliance % |
| GOVERN | Policies, packs, lifecycle, definitions | Same, plus clearer “what applies where” and pack/domain framing |
| DECIDE | Simulate + evaluations + DecisionExplanationView | **Decision as central object** in nav and Overview |
| ENFORCE | Orchestrator enforces; weak product visibility | Decision → Action → Result visible beside Decision |
| PROVE | Provenance in explanation + Audit trail | Decision evidence + ops audit clearly labeled and linked |
| OUTCOME | Absent as product object | Minimal Outcome linked to Decision/Action |

### Engine vs product gap

The **engine** already supports: packs → evaluation → resolution → provenance → gateway enforcement → audit.

The **product** partially exposes Decide/Prove, under-exposes Enforce/Outcome, and accidentally leans Assessment on Overview Insights.

---

## 5. Product Differentiation Assessment

### Where Enigma already differentiates

| Differentiator | Evidence |
| --- | --- |
| Executable policy (not document library) | EPA packs, PDP, Simulate |
| Multi-authority decisions | HIPAA + Part 2 via generic resolver |
| Explainable decisions | DecisionExplanationView + operator narrative |
| Authoritative decision store | `policy_evaluations` |
| Runtime enforcement | Gateway orchestrator (block/transform/detok) |
| Ops integrity | Audit hash chain |
| Regulation-agnostic platform | Packs contribute; platform resolves |

### Where UX accidentally resembles traditional products

| Smell | Location | Risk |
| --- | --- | --- |
| **Assessment / compliance scorecard** | Overview Insights compliance donuts (HIPAA / EU AI Act / Financial / Legal heuristics) | Undermines “not an assessment app” architecture |
| **GRC dashboard** | Risk classification + Top action items + LLM “enhance” | Familiar GRC pattern; weak link to Decision objects |
| **Static policy management** | Policy detail still heavy on definition tables | Correct content, but underplays “what decisions did this produce?” |
| **Generic monitoring** | Triage + Audit alone, without Decision spine | Looks like log ops without governance meaning |
| **Checklist readiness** | Application “governance posture” | Acceptable if framed as *governability*, not compliance score |

### Differentiation table (target positioning)

| Category | Traditional product | Enigma |
| --- | --- | --- |
| Assessment | Measures posture | Establishes governance context |
| GRC | Manages compliance programs | Makes policy decisions |
| Policy repository | Stores documents | Makes policies executable |
| AI monitoring | Observes activity | Governs activity |
| AI gateway | Controls traffic | Enforces policy decisions |
| Audit | Records events | Explains decisions and actions |
| Compliance reporting | Reports later | Generates evidence during governance |

---

## 6. UX Architecture Recommendation

Do **not** redesign every screen. Re-map meaning first.

| Existing screen | Recommended product role |
| --- | --- |
| Overview | **Attention surface** for governance: REVIEW decisions, conflicts, blocked enforcements, exceptions — not compliance % |
| Applications + Models | UNDERSTAND / GOVERN context (what can call Enigma; what can be selected) |
| Policies | GOVERN — packs, applicability, obligations, lifecycle |
| Simulate | DECIDE rehearsal (keep; keep DecisionExplanationView) |
| Evaluations (+ detail) | DECIDE / PROVE — promote to first-class product object |
| Audit | Operational PROVE — keep separate; link from Decision when request_id exists |
| System | Admin / appliance — not primary governance loop |

**Do not** add Assessments / Opportunities / Business Case / Compliance Program screens in this era.

**Low-risk future corrections (later tasks):**

1. Demote or reframe Insights compliance score (or remove from default Overview).
2. Elevate Decisions/Evaluations in navigation.
3. Add Decision → Action → Result section (data already partially on orchestrator/audit).
4. Keep Simulate as a tab; make historical Decision the primary “why” path.

---

## 7. Decision-Centered Experience

Decision is the **central governance object** for operators and executives.

### Authoritative source

`policy_evaluations` remains the only historical decision authority.

### Target decision spine

```text
REQUEST
  ↓
CONTEXT (app · model · classification · purpose · auth)
  ↓
APPLICABLE POLICY / PACKS
  ↓
DECISION (ALLOW | ALLOW_WITH_CONTROLS | DENY | REVIEW)
  ↓
REASON / RESOLUTION
  ↓
CONTROLS (Enigma implementation — not regulatory mandates)
  ↓
ACTION (what Gateway attempted)
  ↓
EVIDENCE (provenance + integrity)
  ↓
OUTCOME (end state)
```

### Already available via DecisionExplanationView

- Final decision + narrative  
- Policy contributions  
- Resolution category / basis  
- Authorities / citations / tiers  
- Enforcement controls vs regulatory obligations  
- Expandable evidence  

### Decision evidence (current)

Decision detail also surfaces:

- **Model Governance** — requested / authorized (`policy_evaluations.restrictions.eligible_models`) / executed / provider / match verification  
- **Enforcement Consequence** — Expected / Result / Verification + Audit link  
- **Request Context** — subject → application → agent → tool → model → action when persisted  

### Model authorization authority

```text
AVAILABLE (Models registry)
        ≠
ELIGIBLE  (policy_evaluations.restrictions.eligible_models)  ← historical authority
        ≠
SELECTED / EXECUTED (Gateway audit.model_selected + provider)
```

- `policy_evaluations.restrictions` is the authoritative historical authorization record.  
- `evidence_in.restrictions` is compatibility / durability support only (not a separate UI concept).  
- Historical eligibility is never recalculated from the current Models registry or active packs.  
- Explicit `eligible_models = []` means no models authorized; missing / null means eligibility was not recorded (legacy).

### Still missing on the Decision surface

- Explicit **Action** transform inventory beyond enforcement summary  
- List-level eligible/executed columns on `/decisions`

Simulate and historical Evaluation should continue to share **one** explanation component (already true).

---

## 8. Gateway / Enforcement Model

### Runtime reality (already true)

```text
Identity → Interrogation → Policy Decision → Transform/Action
  → Model → Response Policy → Transform/Detok → Audit
```

Gateway is the **enforcement arm**, not a separate product.

### Product model

| Layer | Meaning |
| --- | --- |
| Decision | PDP output (`PolicyDecision`) |
| Action | Orchestrator attempt (BLOCK, TOKENIZE, REDACT, RELEASE, DETOK, …) |
| Enforcement result | Success / fail-closed of that attempt |
| Audit event | Sealed operational record of what ran |

### Recommendation

- Do **not** invent a second PDP inside Gateway UI.  
- Represent Action as fields derived from orchestrator + audit (and later a thin `governance_actions` table if needed).  
- Surface Action on Decision detail: “Because of DENY, Gateway blocked the request.”  
- Keep Gateway invisible as a competing app; optionally label Overview/System health as “Gateway posture.”

---

## 9. Evidence Model

Maintain three non-overlapping concepts:

| Concept | Question | Store |
| --- | --- | --- |
| **Policy Evaluation / Decision** | What did Enigma decide? | `policy_evaluations` |
| **Evidence (decision)** | Why is that decision defensible? | `explanation.provenance` + resolution + operator |
| **Audit** | What operational events occurred? | Audit events + integrity chain |

### Evidence chain (decision-side)

```text
Decision → Policy → Rule → Obligation → Citation → Authority → Control → Action → Enforcement Result
```

Evidence is produced **during** governance, not assembled later as a compliance report.

Product rule: Evidence UI lives primarily on Decision; Audit remains the sealed ops trail.

---

## 10. Outcome Model

### Recommendation (MVP — define before building)

**Outcome should be Gateway-generated and/or derived from Decision + Action + Enforcement result**, not a separate GRC “business outcome” program.

Minimal conceptual shape:

```text
Outcome
  id
  decision_id          # evaluation_id
  request_id?          # correlation
  action_type          # BLOCK | ALLOW | TRANSFORM | DETOK | REVIEW_HOLD | ...
  enforcement_status   # succeeded | failed | not_attempted
  status               # completed | blocked | approved | failed | exception | override
  exception?
  override?
  timestamp
  metadata             # thin JSON — no analytics warehouse
```

### Persistence recommendation

| Option | Verdict |
| --- | --- |
| New heavy outcomes subsystem | **No** (not now) |
| Derive Outcome view from Decision + Audit | **Yes** for MVP |
| Optional later table `governance_outcomes` | Only if derived view is insufficient |

Do not build Outcomes navigation until Decision + Action are visible.

---

## 11. Navigation Recommendation

**Do not** turn UNDERSTAND→OUTCOME into six top-level nav items.

### Recommended top-level structure (evolutionary)

| Nav | Product meaning |
| --- | --- |
| **Overview** | Governance attention (decisions needing REVIEW, conflicts, blocks, exceptions) |
| **Decisions** | First-class Decision index + detail (promote evaluations) |
| **Policies** | GOVERN — packs and lifecycle |
| **Applications** | UNDERSTAND/GOVERN context |
| **Models** | UNDERSTAND/ENFORCE substrate |
| **Audit** | Operational PROVE |
| **System** | Appliance admin (footer) |

Simulate remains under Policy (and optionally from Decision “replay”).

Gateway is not a peer nav item; it is the enforcement mechanism behind Decisions.

### What Overview should answer

> What is happening in my AI environment that requires governance attention?

Prefer:

- Recent decisions (esp. REVIEW / DENY)  
- Unresolved policy conflicts  
- Failed enforcement / fail-closed  
- Exceptions / overrides (when they exist)  

Avoid as primary:

- Compliance score %  
- Number of assessments  
- Generic risk heatmaps without Decision linkage  

---

## 12. Product Principles

1. **Govern actions, don’t grade programs.**  
2. **Decision is the center of gravity.**  
3. **`policy_evaluations` is authoritative for decisions; audit is authoritative for ops integrity.**  
4. **Packs contribute; the platform resolves; the Gateway enforces.**  
5. **Obligations ≠ controls.** Regulations inform; Enigma implements.  
6. **Evidence is generated in-flow, not reported after.**  
7. **Regulation-agnostic UX.** No HIPAA-/Part-2-specific components.  
8. **One integrated OS, not six mini-apps.**  
9. **Executive-legible without regulatory fluency.** Narrative from structured data, never hard-coded CFR prose.  
10. **Extensible beyond healthcare.** Domains and packs grow; product model stays generic.  
11. **Fail closed; never invent precedence.**  
12. **Do not smuggle GRC through Overview “insights.”**

---

## 13. Recommended Implementation Sequence

Ordered increments for subsequent Cursor tasks (this pass stops after design):

### Increment A — Overview differentiation (low risk, high signal)

- Reframe Overview default toward governance attention.  
- Demote/remove compliance scorecard from primary Insights (or clearly label as non-authoritative heuristic).  
- Prefer Decision/REVIEW/block signals over framework %.

### Increment B — Decisions as first-class product object

- Add **Decisions** nav (backed by `policy_evaluations` list API, not audit).  
- Keep `/evaluations/[id]` + DecisionExplanationView.  
- Cross-link Policy → Decisions influenced; Decision → Policy packs.

### Increment C — Decision → Action → Result

- Project Action/Enforcement onto Decision detail from orchestrator/audit correlation.  
- No new regulation packs; minimal schema only if projection is insufficient.

### Increment D — Minimal Outcome

- Define derived Outcome status on Decision detail.  
- Persist only if product needs durable exception/override history.

### Increment E — Policy experience sharpening

- Lead policy detail with “Decisions this policy influenced” + obligations/applicability.  
- Keep definition tabs; reduce “document library” feel.

### Explicitly deferred

- Pack #3  
- Assessment/GRC modules  
- Healthcare ontologies  
- Business Case / Opportunities  
- Large Outcomes analytics  

---

## Architecture proof (product layer)

The engine already supports:

```text
Policy → Decision → Enforcement → Evidence
```

The product must now **express** that loop:

```text
UNDERSTAND → GOVERN → DECIDE → ENFORCE → PROVE → OUTCOME
```

without becoming an assessment or compliance application.

**Next Cursor task should start from Increment A or B above — not Pack #3.**

---

## Appendix A — Primary user journey (target)

```text
1. Overview shows a REVIEW decision requiring attention
2. Operator opens Decision
3. Sees contributing packs, resolution, obligations, controls
4. Sees Action (e.g., blocked / held for review)
5. Sees Evidence (citations + integrity link)
6. Sees Outcome (held / later approved)
7. Optionally jumps to Policy that contributed, or Audit for ops seal
```

## Appendix B — Hard constraints (reaffirmed)

- No Pack #3 in this era of work  
- No HIPAA-/Part-2-specific UI components  
- No duplicate decision stores  
- Audit ≠ policy decision authority  
- No giant ontology / GRC platform pivot  
- No unnecessary migrations before object relationships are accepted  

## Appendix C — Implementation rule for this pass

This document is the deliverable.

No major UI redesign was implemented in this pass.

Only future increments that preserve architectural invariants should land in code.
