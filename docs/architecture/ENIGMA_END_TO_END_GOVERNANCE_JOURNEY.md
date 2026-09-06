# Enigma — End-to-End Governance Journey Validation

**Status:** Validation / demo-readiness review (no product implementation in this pass)  
**Date:** 2026-09-05  
**Test baseline:** 184/184 passing (resume increment)
**Thesis:** Enigma governs AI actions from policy to proof.  
**Invariant:** Agent reasons · Policy decides · Gateway enforces

Related:

- [ENIGMA_PRODUCT_ARCHITECTURE_REVIEW.md](./ENIGMA_PRODUCT_ARCHITECTURE_REVIEW.md)
- [ENIGMA_PRODUCT_DIFFERENTIATION.md](./ENIGMA_PRODUCT_DIFFERENTIATION.md)
- [HEALTHCARE_POLICY_RESOLUTION.md](./HEALTHCARE_POLICY_RESOLUTION.md)

---

## Executive Summary

**Yes — the complete Enigma governance loop works in code.**

```text
AI Request → Classification → Multi-pack Policy Evaluation → Decision
  → Expected Action → (Human Review if needed) → Final Decision
  → Resume (AUTHORIZE + held request only)
  → Gateway Enforcement → Verified Enforcement Result
  → Provenance Evidence → Operational Audit
```

Authority remains correct:

| Store | Authority |
| --- | --- |
| `policy_evaluations` | What Enigma decided (machine decision immutable) |
| `human_resolution` | Governance intervention |
| Gateway + `audit_events` | What was enforced (verified when joinable) |
| Provenance on evaluation | Why (rule → obligation → citation → source → tier) |

**Caveats (not failures of the architecture):**

1. **Simulate** proves decision + provenance but yields enforcement `NOT_EXECUTED`.
2. **Live completions** prove verified enforcement when `request_id` joins audit.
3. **Post-AUTHORIZE resume** (minimal): live REVIEW retains a held request snapshot on the evaluation; after human AUTHORIZE → final ALLOW, `POST .../resume` executes through Gateway without re-evaluating input PDP. Machine decision stays REVIEW. AUTHORIZE alone is not Gateway ALLOWED. Idempotent: second resume returns `already_resumed`. DENY never resumes. Missing hold fails safely. Actor remains claimed identity.
3. **Decision detail** sometimes lacks rich request/context on live records (subject/resource often empty).
4. **Human actor** is claimed (`actor` body / default `approver`), not SSO-bound identity.
5. Overview attention is a **recent evaluations window**, not a dedicated queue.

The product is **demo-ready** for a careful script that mixes Policies → Simulate (multi-pack story) with live Gateway traffic (enforcement proof) and Decisions → Human Review. It is not yet a turnkey single-click wow without narration.

**Pack #3 and Outcome analytics were not started in this pass.**

---

## Canonical Journey

### Actual implementation path (verified in code)

| Step | Implementation |
| --- | --- |
| **AI Request** | `POST /v1/ai/completions` → `GatewayOrchestrator.completions` (`server.ts`, `orchestrator.ts`) |
| **Identity** | API key → application/user principal |
| **Classification / Context** | `HybridDataInterrogator.interrogate` (+ HIPAA profile binding) |
| **Applicable Policies** | Baseline interpreter + registered overlays (HIPAA, Part 2, …) via `applyRegulatoryOverlays` / `applyRegisteredOverlays` |
| **Policy Evaluation** | `EnterprisePolicyAdapter` → `PackBackedEnterprisePdp.evaluateLegacyRequest/Response` → `resolvePackContributions` |
| **Decision** | `toEpaDecision` → `persistEvaluation` → `policy_evaluations` |
| **Expected Action** | `deriveDecisionConsequence` / `effectiveExpectedAction` (HOLD / BLOCK / ALLOW / APPLY_CONTROLS) |
| **Human Review** | Eligible if `REVIEW` or resolution `UNRESOLVED`/`CONFLICT` → `POST .../evaluations/:id/resolve` → `human_resolution` |
| **Final Decision** | `human_resolution.final_decision` (`ALLOW` \| `DENY`); machine `decision` unchanged |
| **Gateway Enforcement** | Legacy map may send REVIEW→BLOCK as **safety hold**; DENY→BLOCK; ALLOW path → transform → model → RELEASE/BLOCK |
| **Verified Enforcement** | `findAuditForEvaluation` + `projectEnforcementResult` (`BLOCKED`, `ALLOWED`, `REVIEW_REQUIRED`, `FAILED`, `UNKNOWN`, `NOT_EXECUTED`) |
| **Evidence / Provenance** | Stored on evaluation explanation; `DecisionExplanationView` |
| **Audit** | `audit.record` on block/release/resolve (`evaluation_resolve`, integrity chain) |

### Safety vs governance (critical)

```text
Machine decision: REVIEW
Wire mapping:     REVIEW → legacy BLOCK   (fail-closed safety hold)
Product status:   REVIEW_REQUIRED + safety_fallback=true
Meaning:          NOT a policy-level DENY
```

Documented in `map.ts` and enforced in `enforcement-projection.ts` + tests.

---

## Canonical Demo Scenario

**Strongest story (existing fixtures — no new pack):**

| Element | Fixture |
| --- | --- |
| Domain | Healthcare (PHI) |
| Packs | HIPAA + 42 CFR Part 2 |
| UI Simulate scenarios | `agreement_deny`, `complementary`, `restrictive`, `unresolved` (`PolicyLifecycle.tsx`) |
| Automated proof | `decision-explanation.test.ts` A–D; `part2-pack.test.ts` A–E; `decision-resolution.test.ts` A–J |

**Recommended live demo script:**

1. **Policies** — show HIPAA + Part 2 packs active.  
2. **Simulate → “Multi-pack unresolved conflict → REVIEW”** — DecisionExplanationView (contributions, UNRESOLVED, provenance).  
3. **Open Decision** — Expected Action HOLD; Enforcement `NOT_EXECUTED` (simulate).  
4. **Human Review → AUTHORIZE or DENY** — Original REVIEW preserved; Final ALLOW/DENY; resolve audit.  
5. **Optional live traffic** — PHI + external model / write without consent → verified `BLOCKED`.  
6. **Overview** — pending review / recent decisions.  
7. **Audit** — operational twin (`request_id` / evaluation metadata).

---

## Scenario Results

### Scenario A — Automatic Governance (DENY → BLOCK → BLOCKED)

| Check | Result |
| --- | --- |
| Path | Pack PDP DENY → legacy BLOCK → orchestrator `block` → audit BLOCK |
| Expected Action | BLOCK |
| Verified | BLOCKED when audit joins |
| Tests | `pack-pdp` TEST 001; `decision-consequence` A; regulatory DENY cases |
| UI | Decisions + Consequence + Explanation communicate decision/why/action/enforcement |
| Gap | Live Decision detail may lack rich request text/context fields on **older** records recorded before context persistence |

**Status: PASS (code + tests). New evaluations persist/surfaces request context on Decision detail.**

---

### Scenario B — Multi-Pack Agreement (both DENY)

| Check | Result |
| --- | --- |
| Fixture | PHI write + HIPAA + PART2 + treatment → DENY / AGREEMENT |
| Tests | `part2-pack` A; `decision-explanation` Invariant 1 + simulate A |
| UI Simulate | “Multi-pack agreement (write / both deny)” |
| Both packs visible | Yes (`contributing_pack_ids`, contributions) |
| Provenance | Separate matched rules per pack |
| False conflict | No — category AGREEMENT |
| Enforcement | Follows DENY → BLOCK (live) / NOT_EXECUTED (simulate) |

**Status: PASS.**

---

### Scenario C — Human Review → AUTHORIZE → ALLOW → Resume

| Check | Result |
| --- | --- |
| Machine | REVIEW (immutable) |
| Human | AUTHORIZE → final ALLOW |
| Execution | `AUTHORIZED_NOT_RESUMED` until resume; then `RESUMED` |
| Enforcement | AUTHORIZE alone → UNKNOWN (not verified Gateway success); after resume + RELEASE → ALLOWED / VERIFIED |
| Distinct fields | Original REVIEW ≠ Final ALLOW |
| Tests | `decision-resolution`; `decision-resume` |
| Provenance | Preserved after resolution and resume |

**Status: PASS.** Resume uses held request snapshot; does not re-run input PDP as a new independent ALLOW.

---

### Scenario D — Human Review → DENY

| Check | Result |
| --- | --- |
| Machine | REVIEW preserved |
| Human | DENY → final DENY → expected BLOCK → enforcement BLOCKED |
| UI | Review + Consequence show Original / Disposition / Final distinctly |
| Tests | `decision-resolution` C + deny API path |

**Status: PASS.** Does not imply machine originally decided DENY.

---

### Scenario E — Unresolved Review (PENDING)

| Check | Result |
| --- | --- |
| State | `review_state: pending`, Expected HOLD |
| Safety block audit | `REVIEW_REQUIRED` + `safety_fallback` — **not** BLOCKED |
| Tests | `decision-resolution` A; `decision-consequence` F |
| Product language | “Safety hold pending human review — not a policy DENY” |

**Status: PASS.** Distinction governance vs safety hold is implemented and tested.

---

### Scenario F — Enforcement Failure

| Check | Result |
| --- | --- |
| Projection | Hard failure codes / `input_transformation: failed` → `FAILED` |
| Semantics | Decision may remain valid; enforcement failed |
| Tests | `decision-consequence` E |
| UI | Status badge FAILED + summary on Consequence panel |
| Gap | Few one-click demo fixtures that produce FAILED via live traffic; projection is real |

**Status: PASS (projection + unit). Live demo of FAILED requires inducing transform/audit failure.**

---

## Decision Experience

Decision detail (`/evaluations/:id`) answers:

| Question | Answered? | Where |
| --- | --- | --- |
| What happened? | **Partial** | Phase, ids, reason; request corpus/context often sparse on live persist |
| What governs it? | **Yes** | Explanation contributions / applicable policies |
| Machine decision? | **Yes** | Evaluation + Review “Original decision” |
| Why? | **Yes** | Reasons + DecisionExplanationView + provenance |
| Expected action? | **Yes** | Consequence + Review panels |
| Human intervene? | **Yes** | DecisionReviewPanel |
| Final decision? | **Yes** | `final_decision` + header badge preference |
| Gateway did? | **Yes** | Enforcement status + safety_fallback label |
| Evidence? | **Yes** | Provenance chain in Explanation |
| Operationally? | **Partial** | Link to Audit; not inlined event list |

No redesign performed. Issues documented under Demo Friction.

---

## Decisions List

| Need | Status |
| --- | --- |
| Decision | Badge |
| Review state | Pending / Resolved column |
| Final decision | Shown as `→ FINAL` when present |
| Expected action | Column |
| Enforcement | Badge |
| Find pending | Filter “Requires review” |
| Historical resolved | Filter “Resolved” |

**Status: Adequate for operators.** Packs/resolution category denser on detail than list.

---

## Overview

Answers “What requires governance attention?” via `GovernanceAttentionPanel`:

| Signal | Backed by |
| --- | --- |
| Requires review | `attention.pending_review` / pending rows |
| Conflicts pending | Pending UNRESOLVED/CONFLICT |
| Denied / blocked | Count of decisions with DENY/BLOCK fields (**not** verified enforcement) |
| Controls applied | Expected controls flag on decisions |
| Recent decisions | Last N evaluations |

**Limitation:** Recent evaluation window (`limit=25`), not a durable review queue; timeframe control does not filter evaluations by day.

Collapsed Insights heuristics remain non-authoritative.

---

## Enforcement Verification

| Status | Meaning |
| --- | --- |
| Verified | Audit joined (`request_id` or metadata evaluation id) |
| Derived expected | Always from decision / final decision |
| Simulate | `NOT_EXECUTED` |
| Pending REVIEW + safety BLOCK | `REVIEW_REQUIRED` + `safety_fallback` |
| Resolve AUTHORIZE/DENY | Resolution audit drives ALLOWED/BLOCKED |

**Genuinely verified:** Gateway/audit-backed statuses when join succeeds.  
**Derived:** Expected action, operator narrative, Overview heuristics.

---

## Provenance

Validated across scenarios:

```text
Rule → Obligation → Citation → Source → Authority Tier
```

- Machine decision preserved after human resolution.  
- Multi-pack contributions remain separate.  
- Controls remain Enigma implementation mechanisms (not regulatory mandates) in UI copy.  
- Provenance intact after resolve (tests H/I).

---

## Audit

| Concern | Representation |
| --- | --- |
| Completions | Block/release events with `request_id`, policy/response decisions, transforms |
| Human resolve | `operation: evaluation_resolve`, disposition metadata, actor, timestamp |
| Integrity | Hash chain on sealed events |
| Authority | Operational history only — not decision truth |

---

## Demo Readiness

### What works well

- Multi-pack Simulate scenarios in Policy UI.  
- Decision explanation + provenance.  
- Distinct Original / Human / Final / Enforcement.  
- REVIEW ≠ DENY in product projection.  
- Decisions as first-class nav.  
- 171 automated tests locking the loop.

### Demo friction (remaining — not all fixed here)

1. Human `actor` hardcoded to `approver` in UI (claimed identity, not SSO).  
2. Overview “Denied” counts machine DENY, not verified BLOCKED.  
3. Timeframe on Overview does not scope evaluation attention.  
4. Explanation panel still centers machine decision; human final lives in Review / Consequence.  
5. Possible stale safety-hold audit if resolve audit not preferred in join edge cases (tests cover happy path).  
6. Failed enforcement hard to show in a polished live walkthrough.  
7. Models page ≠ “Gateway”; enforcement story lives on Decision + Audit.

### Live Decision narrative (this increment)

- Live and simulate evaluations persist available request/context onto `policy_evaluations` (purpose, authorization, classification, regulatory applicability tags, action, subject/resource/ai_context when present).  
- Missing fields stay **absent** — not invented as unknown / false / N/A.  
- Decision detail projects `request_context` + `execution` (simulation vs live) and orders: Request → Governance/provenance → Human review (when relevant) → Decision/Enforcement (expected vs Gateway result vs verification).  
- Simulation remains `NOT_EXECUTED`; live verification still requires audit correlation.  
- Review panel no longer duplicates expected action / enforcement (those live in Consequence).  
- Overview attention copy clarifies recent-window counts, not a complete review queue.

---

## Wow Moment

```text
AI action → HIPAA + Part 2 contribute independently
  → Resolver UNRESOLVED → REVIEW
  → Human AUTHORIZE/DENY
  → Final decision distinct from machine REVIEW
  → Gateway disposition recorded
  → Provenance still shows both packs’ rules/citations
```

| Lens | Assessment |
| --- | --- |
| Operator sees | Decision detail: conflict, review actions, original vs final, enforcement badge |
| Prospect understands | “Policies disagree → Enigma holds → human decides → system proves it” |
| Technically real | Resolution, packs, provenance, resolve API, audit, projection |
| Still simulated/derived | Simulate path; actor claim; expected action; Overview rollups |
| Stronger if | One live request shows full loop with rich context + verified enforcement without narrating Simulate vs Live |

Assessment/GRC tools stop at findings. This moment is Enigma’s differentiator **when narrated cleanly**.

---

## Product Readiness Matrix

| Capability | Status |
| --- | --- |
| Policy | **COMPLETE** |
| Multi-pack governance | **COMPLETE** |
| Decision (`policy_evaluations`) | **COMPLETE** |
| Decision explanation | **COMPLETE** |
| Human review | **PARTIAL** (works; claimed actor; no re-exec of original request) |
| Action (expected) | **DERIVED** |
| Enforcement (Gateway runtime) | **COMPLETE** |
| Enforcement verification | **PARTIAL** (join-dependent; simulate NOT_EXECUTED) |
| Provenance | **COMPLETE** |
| Audit | **COMPLETE** |
| Intelligence | **PARTIAL** (Overview attention only) |
| Outcome | **DEFERRED** |

---

## Biggest Remaining Gap

> **Post-AUTHORIZE resume of the original model request, and SSO-grade resolver identity** — human resolution records final intent and can correlate release/block audits, but does not re-drive the original AI call; actor remains a claimed identity.

Live Decision narrative completeness (request/context + coherent Request → Governance → Decision → Review → Enforcement) was addressed in this increment for newly recorded evaluations.

Secondary gaps (not selected): durable review queue; polished failed-enforcement demos; Overview timeframe scoping.

---

## Recommended Next Increment

**Do not start another feature in this pass.** Prior candidates when work resumes:

1. Optional post-AUTHORIZE request resume (without inventing Action/Outcome services).  
2. Stronger resolver identity (still not full SSO/IdP).  
3. Overview timeframe applied to evaluation attention counts.

**Not recommended next:** Pack #3, Outcome, GRC workflows, Intelligence hub.

---

## Deferred Work

Explicitly remain deferred:

- Pack #3  
- Outcome analytics / ROI / impact scoring  
- Assessments / Opportunities / Business Case  
- Top-level Intelligence hub  
- GRC workflow / multi-level approval committees  
- Gateway redesign / six-stage navigation  
- Enterprise ontology  
- Email/SLA notification systems  
- Fake metrics  

---

## Failures

**No architectural journey failures found.** All scenarios A–F are supported by implementation and automated tests.

**Product/demo limitations** (not test failures) listed under Demo Friction and Biggest Remaining Gap.

---

## Conclusion

Enigma’s end-to-end governance journey is **real and test-locked (171/171)**. The differentiator — multi-pack conflict → human resolution → proof — is demonstrable. The next investment should harden the **live Decision narrative**, not expand into Outcome, Pack #3, or GRC.

**Stop.** Do not implement the recommended next increment in this validation pass.
