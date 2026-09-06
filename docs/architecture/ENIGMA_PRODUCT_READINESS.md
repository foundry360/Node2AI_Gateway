# Enigma — Product Readiness

Internal baseline after Live Decision Context & Governance Journey Hardening, plus Decision semantics cleanup (Machine vs Final labeling).

**Baseline:** 174+ automated tests; Gateway and Admin TypeScript clean.  
**Scope of this document:** factual product/architecture state. Not a sales brief.

---

## Current Product State

Enigma implements a governed AI Gateway with pack-backed policy evaluation:

- **Policy packs** contribute independently (Baseline + HIPAA Pack #1 + 42 CFR Part 2 Pack #2 as fixtures/domains).
- **Multi-pack resolution** produces AGREEMENT / COMPLEMENTARY / RESTRICTIVE / CONFLICT / UNRESOLVED — no silent “most restrictive / newest / tier-1 wins.”
- **`policy_evaluations`** is the authoritative store for what was decided and why (explanation, resolution, provenance, obligations, optional request context, optional `human_resolution`).
- **Human resolution** is a separate intervention (AUTHORIZE → ALLOW, DENY → DENY) that does not mutate the machine `decision`.
- **Gateway** enforces; **audit** records what operationally happened.
- **Enforcement projection** derives expected action + verified/unverified Gateway correlation.
- **Admin Decision experience** (list + detail) presents Request → Governance/provenance → Human review (when relevant) → Machine/Final/Expected/Gateway/Verification.
- **Simulate** evaluates without model execution (`NOT_EXECUTED`).
- **Outcome / Pack #3 / GRC / SSO / review queues** are not built.

---

## Governance Lifecycle

```text
Request
  → Context
  → Applicable Policies (packs)
  → Policy Evaluation
  → Machine Decision
  → Expected Action
  → Human Review (if REVIEW / unresolved conflict)
  → Final Decision (= machine if no human resolution)
  → Gateway Enforcement
  → Verified Enforcement (when audit joins)
  → Evidence / Provenance
  → Audit (operational twin)
```

---

## Authority Model

| Concern | Authority | Notes |
| --- | --- | --- |
| What Enigma decided and why | `policy_evaluations` | Machine decision, explanation, provenance, obligations immutable as recorded |
| Human intervention | `human_resolution` (on evaluation) | Separate JSON; does not overwrite `decision` |
| What operationally happened | `audit_events` | Completions, blocks, resolve dispositions; integrity chain where enabled |
| Expected action + verification view | `enforcement_projection` (derived) | Not a second store; joins evaluation + optional audit via `request_id` |

**Rules that hold:** Decision evidence ≠ operational audit. Projection must not invent successful enforcement. Simulation must not claim Gateway execution.

---

## Policy Pack Model

- Packs are first-class contributors with pack id, policy id, version, obligations, and provenance chains.
- Resolver taxonomy is explicit; unresolved conflict → **REVIEW** (fail-safe), not automatic DENY-as-policy.
- UI and operator narratives are pack-agnostic (no HIPAA/Part2-specific Decision components). Domain labels exist only for display of pack/domain identifiers.
- HIPAA + Part 2 remain **acceptance fixtures**, not product forks.

---

## Decision Model

```text
Machine Decision  = evaluation.decision          (immutable)
Human Resolution  = human_resolution.*           (optional intervention)
Final Decision    = human_resolution.final_decision
                    OR machine decision when unresolved / not reviewed
```

| Disposition | Machine | Human | Final |
| --- | --- | --- | --- |
| Automatic DENY/ALLOW/… | as evaluated | — | = machine |
| Pending review | REVIEW | — | still REVIEW for enforceability / HOLD |
| AUTHORIZE | REVIEW | AUTHORIZE | ALLOW |
| DENY (human) | REVIEW | DENY | DENY |

**API note:** `explanation.operator.final_decision` historically named the **machine** outcome after pack resolution. Field retained for stability; UI and narratives now say **Machine decision**. Human final lives under `review.final_decision` / `human_resolution.final_decision`.

**Actor limitation:** Resolve API records a claimed actor string (UI often sends `approver`). Not SSO / IdP.

---

## Enforcement Model

| Layer | Meaning |
| --- | --- |
| Expected action | Derived from **final** enforceable decision (HOLD for pending REVIEW) |
| Gateway result | From correlated audit when present; `—` / UNKNOWN / NOT_EXECUTED otherwise |
| Verification | VERIFIED only when audit joins successfully; NOT_EXECUTED for simulate; UNKNOWN if missing correlation |

**REVIEW wire note:** Legacy Gateway maps REVIEW → BLOCK as a **safety hold**. Projection surfaces `REVIEW_REQUIRED` + `safety_fallback` — **not** policy-level DENY / BLOCKED.

---

## Provenance Model

```text
Rule → Obligation → Citation → Source → Authority Tier
```

- Per-pack matched rules remain distinguishable after evaluation, human resolution, and projection.
- Regulatory citations ≠ Enigma heuristics ≠ Enigma implementation controls.
- Human resolution does not strip provenance from the evaluation record.

---

## Lifecycle Matrix

| Stage | Source of truth | Persisted? | API | UI | Independently verifiable? |
| --- | --- | --- | --- | --- | --- |
| Request / context | Gateway request + mapped evaluation request | On new evals: subject/resource/action/context/ai_context/evidence | `request_context` | Request panel (omit missing) | Against request logs / eval snapshot |
| Classification | Request evidence | `evidence_in` | decision.evidence / request_context | Request + explanation | Partial (as supplied) |
| Applicable policies | PDP evaluation | `applicable_policies` | decision + list | Explanation contributions | Yes (record) |
| Machine decision | PDP | `decision`, reason, explanation | `evaluation.decision` / `decision` | Machine decision | Yes |
| Expected action | Derived | No (computed) | `consequence` / list fields | Consequence / list | Recomputable |
| Human resolution | Resolve API | `human_resolution` | `review` | Review panel | Yes (record + resolve audit) |
| Final decision | Machine or human | Derived / stored on resolution | `final_decision` | Final column / Consequence | Yes |
| Gateway enforcement | Orchestrator + audit | `audit_events` | `enforcement` | Gateway result / verification | Yes when joined |
| Provenance | Pack compile + PDP | `explanation.provenance` | decision.explanation | Explanation | Yes |
| Audit | Audit service | `audit_events` | `/audit` | Audit link | Yes |

---

## Capability Matrix (Policy → Decision → Action → Evidence → Outcome)

| Capability | Status | Notes |
| --- | --- | --- |
| **Policy** | COMPLETE | Packs, versions, lifecycle, simulate, overlays |
| **Decision** | COMPLETE | Authority store, explanation, multi-pack resolution, list/detail |
| **Action** | DERIVED | Expected action / controls from decision; no separate Action service |
| **Evidence** | PARTIAL → strong | Provenance + request context + enforcement join; not a full evidence warehouse |
| **Outcome** | DEFERRED | No outcome analytics / ROI / impact objects |

---

## Known Limitations

1. **AUTHORIZE does not re-execute** the original model request; resolution records intent and may correlate release/block audits.
2. **Resolver actor** is claimed identity, not SSO.
3. **Historical evaluations** pre-context-hardening may lack rich request fields — correctly omitted, not invented.
4. **Overview attention** is a recent evaluation window, not an operational review queue; timeframe may not fully scope eval attention.
5. **`operator.final_decision` field name** still means machine decision (documented; UI corrected).
6. **Legacy REVIEW → BLOCK** on the wire requires projection discipline (already tested).
7. Simulate vs live must be narrated; product now labels execution mode explicitly.

---

## Deferred Work

Explicitly not built / out of scope for current readiness:

- Pack #3 and additional healthcare packs/use cases  
- Outcome / analytics / ROI  
- GRC workflows, compliance/risk scoring  
- Review queues, SLA, multi-level approvals  
- SSO / identity management  
- Action service / Outcome service  
- Gateway redesign / major nav or visual redesign  
- Demo-only paths or hardcoded Decision UIs  

---

## Architectural Risks

| Severity | Risk | Mitigation / status |
| --- | --- | --- |
| Important | Legacy REVIEW→BLOCK misread as DENY | Projection + UI safety_fallback; keep tests green |
| Important | Missing audit join → false “success” | UNKNOWN / NOT_EXECUTED; never invent VERIFIED |
| Important | Post-AUTHORIZE gap (no request resume) | Documented; candidates for next increment |
| Minor | `operator.final_decision` naming debt | Documented; UI/narrative corrected |
| Minor | Overview denied counts = machine DENY, not verified BLOCKED | Documented |
| Deferred | Full identity / queue / Outcome | Intentionally deferred |

No critical authority-boundary violations found in the current stack after semantics cleanup.

---

## Surgical Corrections Made in This Audit

1. Explanation / operator narratives: **Machine decision** (not Final) for pack-resolution outcome.  
2. Operator flow step: `MACHINE_DECISION` (legacy `FINAL_DECISION` remapped in UI).  
3. Decision list / Overview: Machine vs Final / Expected action labels.  
4. Consequence panel: always show Final (= machine when no human resolution).  
5. Detail header badge labeled Machine vs Final appropriately.

No Pack #3, Outcome, or authority-model redesign.

---

## Recommended Next Product Increment

### Post-AUTHORIZE request resume (minimal)

**Choose this one.** Do not implement it in this pass.

1. **Why highest value now**  
   Machine → Human → Final → Enforcement is explainable, but AUTHORIZE still does not resume the held AI request. That is the largest remaining hole in the live governance journey operators and prospects notice after Decision narrative hardening.

2. **Problem it solves**  
   “Human authorized — what happened to the original request?” without inventing Outcome analytics or a full Action platform.

3. **Builds on**  
   Immutable machine REVIEW, `human_resolution`, `request_id` correlation, enforcement projection, audit resolve events, live request context on evaluations.

4. **Why before Pack #3 or Outcome**  
   Pack #3 adds regulatory surface without closing the live loop. Outcome measures impact after the loop works. Resume (or an explicit durable “not resumed” operational state) completes Decision → Action in the real product path.

5. **Remain deferred**  
   Pack #3, Outcome/ROI, GRC, SSO, review queues, SLA, Gateway redesign, demo-only scripts.

**Runner-up (not selected):** SSO-grade resolver identity — important for enterprise trust, but secondary to completing enforceable journey after AUTHORIZE.
