# Policy Consequence Resolution

**Status:** Active  
**Scope:** Domain-neutral multi-pack decision / obligation composition  
**Implementation:** `gateway/src/policy/enterprise/policy-resolution.ts`

Related:

- [HEALTHCARE_POLICY_RESOLUTION.md](./HEALTHCARE_POLICY_RESOLUTION.md) (healthcare domain notes)
- [ENIGMA_END_TO_END_GOVERNANCE_JOURNEY.md](./ENIGMA_END_TO_END_GOVERNANCE_JOURNEY.md)

---

## 1. Purpose

When multiple policy packs apply to one request, Enigma must produce:

```text
ONE governance decision
ONE obligation / transform set
ONE enforcement projection
ONE evidence trail
```

Packs **contribute**. The platform **resolves**. The Gateway **enforces**.

Resolution is **consequence-based**, not regulatory hierarchy.

```text
Not:  HIPAA > CMS > ONC
Yes:  explicit DENY cannot be weakened by ALLOW
```

---

## 2. Decisions vs obligations

| Concept | Role | Examples |
| --- | --- | --- |
| **Decision consequence** | What happens to the request | `ALLOW`, `DENY`, `REVIEW`, `TOKENIZE`, `REDACT`, `BLOCK_OUTPUT` |
| **Obligations / controls** | Constraints that accompany the outcome | `TOKENIZE_PII`, `ROUTE_LOCAL`, `LOCAL_MODEL_ONLY`, `REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION`, `LOG_GOVERNANCE_EVENT` |
| **Transforms** | Data mutations for controlled execution | `{ type: TOKENIZE, targets: [...] }` |
| **Eligible models** | Enforcement projection for routing | `eligible_models[]` intersection |

Obligations may coexist with `ALLOW` without becoming `REVIEW`.  
`DENY` means the action is prohibited — it is not an approval workflow.

---

## 3. Operational decision semantics

| Decision | Operational meaning |
| --- | --- |
| `ALLOW` | Automatic execution permitted (subject to obligations / model eligibility) |
| `TOKENIZE` / `REDACT` | Controlled execution after transforms |
| `REVIEW` | Human decision genuinely required; Gateway holds (`eligible_models=[]`) |
| `DENY` / `BLOCK_OUTPUT` | Action prohibited; not human-review eligible; no resume |

Routing (`ROUTE_LOCAL`, `RESTRICT_MODEL`) and data restrictions are **obligations / eligibility constraints**, not separate decision engines.

---

## 4. Cross-domain contribution model

```text
Request
  → Baseline interpretation
  → Independent pack overlays (clone of baseline each)
  → PackEvaluationContribution[] (applicable only)
  → resolvePackContributions()
  → materializeResolvedOutcome()
  → toEpaDecision → policy_evaluations
  → Gateway enforcement
```

Non-applicable packs (`applicability:not_applicable` / skip markers) contribute **nothing**.

---

## 5. Consequence resolution principles

1. **Never weaken an explicit restrictive consequence.**  
   `DENY` + anything weaker → final `DENY`.
2. **Compose compatible controls.**  
   Obligations and transforms **union**; eligible models **intersect** when both sides supply non-empty lists.
3. **REVIEW is an exception path**, not a default for disagreement.  
   Use `REVIEW` when a pack (or composed packs) genuinely require human judgment — not merely because two packs disagreed and one said ALLOW while another said DENY.
4. **No regulatory pack ranking.**  
   Authority tier ≠ precedence. Declared `PackPolicyMeta.precedence` remains for rare mutually exclusive non-deny conflicts; it cannot override an explicit `DENY` consequence.
5. **Preserve every applicable contribution** in evidence, even when it does not determine the final decision.

---

## 6. Decision composition matrix

| A | B | Final decision | Obligations / transforms | Rationale |
| --- | --- | --- | --- | --- |
| ALLOW | ALLOW | ALLOW | union | Agreement / complementary |
| ALLOW | TOKENIZE | TOKENIZE | union | Restrictive compose |
| ALLOW | REDACT | REDACT | union | Restrictive compose |
| ALLOW | REVIEW | REVIEW | union | Human intervention required |
| ALLOW | DENY | **DENY** | union (approval obligations stripped) | Consequence deny |
| TOKENIZE | REDACT | TOKENIZE or REDACT | **union both transforms** | Same transform family |
| TOKENIZE | REVIEW | REVIEW | union | Restrictive toward REVIEW |
| TOKENIZE | DENY | **DENY** | transforms cleared | Denial prohibits execution |
| REVIEW | DENY | **DENY** | approval obligations stripped | Denial beats hold |
| REVIEW | REQUIRE_APPROVAL* | REVIEW | keep approval | Same human path |
| DENY | DENY | DENY | union (non-approval) | Agreement |
| DENY | ROUTE_LOCAL* | DENY | routing ignored for execution | Denial prohibits route |
| ALLOW | LOCAL_MODEL_ONLY* | ALLOW | union + model intersect | Constraint, not REVIEW |

\* Obligation / routing codes accompany a decision; they are not ResolutionDecision values.

Resolution basis when denial wins over a non-deny contribution:

```text
category: RESTRICTIVE
basis:    CONSEQUENCE_DENY
reason:   RESOLUTION_CONSEQUENCE_DENY
```

---

## 7. Precedence behavior

`PackPolicyMeta.precedence` is preserved for **declared policy-level conflicts** that are not resolved by consequence composition.

It is **not**:

- a HIPAA > CMS hierarchy
- an authority-tier override
- a way for ALLOW to defeat DENY

If ALLOW declares overrides over a DENY pack, DENY still wins via `CONSEQUENCE_DENY`.

True `CONFLICT` → `UNRESOLVED` → `REVIEW` remains available for future mutually exclusive **non-deny** outcomes that cannot be composed safely.

---

## 8. Conflict handling (current vocabulary)

For current decision vocabulary (`ALLOW` / `DENY` / `REVIEW` / `TOKENIZE` / `REDACT` / `BLOCK_OUTPUT`):

```text
DENY + ALLOW     → DENY (CONSEQUENCE_DENY)
DENY + TOKENIZE  → DENY (CONSEQUENCE_DENY)
DENY + REVIEW    → DENY (CONSEQUENCE_DENY)
ALLOW + REVIEW   → REVIEW (COMPOSE_RESTRICTIVE)
ALLOW + TOKENIZE → TOKENIZE (COMPOSE_RESTRICTIVE)
```

Evidence always retains both contributions.

---

## 9. Transformation composition

- Transforms **union by type**, merging target lists.
- `TOKENIZE` + `REDACT` coexist; both remain enforceable.
- When final decision is `DENY` / `BLOCK_OUTPUT`, transform execution intents are cleared (action prohibited).
- Order of packs does not erase another pack’s targets.

---

## 10. Routing / model restriction

- `ROUTE_LOCAL`, `RESTRICT_MODEL`, `LOCAL_MODEL_ONLY` are obligations.
- Final `eligible_models` is the intersection of contributing non-empty eligibility sets (when all contributors supply models).
- `DENY` / `REVIEW` always project `eligible_models = []`.
- A permissive pack cannot re-introduce a model another applicable pack removed, when intersection applies.

---

## 11. Approval composition

| Pair | Result |
| --- | --- |
| ALLOW + REVIEW(+REQUIRE_APPROVAL) | REVIEW — existing human-resolution hold |
| TOKENIZE + REVIEW(+REQUIRE_APPROVAL) | REVIEW — hold; transforms retained for post-authorize path |
| DENY + REQUIRE_APPROVAL | **DENY** — approval obligation stripped; not review-eligible |

Human AUTHORIZE cannot revive a machine `DENY`.

Human AUTHORIZE authorizes **continuation of that specific governed Decision** (via `resume_evaluation_id` on `POST /v1/ai/actions`). It does **not** create standing write permission. Exact-content matching remains only as a compatibility fallback when no evaluation ID is supplied. See [policy-evaluation-contract.md](../enigma/policy-evaluation-contract.md#governed-action-continuation-resume_evaluation_id).

---

## 12. Evidence / provenance

For every multi-pack evaluation:

```text
resolution.contributions[]     — what each pack said
resolution.category / basis    — how Enigma resolved
provenance.matched_rules[]     — rule → obligation → citation chains
applicable_policies[]          — all contributing policies
reason_codes[]                 — including RESOLUTION_* markers
```

Example:

```text
HIPAA → DENY
CMS   → ALLOW
Final → DENY
basis → CONSEQUENCE_DENY
```

---

## 13. Enforcement behavior

| Final decision | Gateway expectation |
| --- | --- |
| DENY | BLOCK — no downstream model execution |
| REVIEW | HOLD / safety block — human resolve then optional resume |
| TOKENIZE / REDACT | APPLY_CONTROLS then execute on eligible models |
| ALLOW | Execute (with any non-transform obligations) |

Correlation: `request_id` ↔ `policy_evaluations` ↔ audit.

---

## 14. Examples

### Explicit denial vs permissive pack

```text
Pack A: DENY
Pack B: ALLOW + LOG
→ DENY
→ contributions retained
→ eligible_models = []
→ not human-review eligible
```

### Controlled execution

```text
Pack A: ALLOW
Pack B: TOKENIZE (mrn)
→ TOKENIZE
→ transform applied before egress
```

### Genuine human review

```text
Pack A: ALLOW
Pack B: REVIEW + REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION
→ REVIEW
→ existing human-resolution workflow
```

---

## 15. Non-goals

- No OPA / Cedar / external PDP
- No per-regulation resolver
- No Agent WRITE changes in this model
- No new regulatory packs required for consequence resolution
