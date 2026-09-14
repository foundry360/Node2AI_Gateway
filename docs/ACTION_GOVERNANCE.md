# Action Governance (Phase D)

**Status:** Implemented  
**Date:** 2026-09-14  
**Canonical architecture:** `docs/ENIGMA_ARCHITECTURE.md`  
**Product 1.0 integration contract:** [`ENIGMA_INTEGRATION_CONTRACT.md`](./ENIGMA_INTEGRATION_CONTRACT.md)  
**Depends on:** Phase A/B Agent/Tool substrate; Phase C architecture freeze  

---

## 1. What an Action is

An **Action** is the concrete attempt Enigma evaluates for governance — the thing an AI actor is trying to cause.

Examples in the current runtime:

- Model completion (`POST /v1/ai/completions`) — operation such as `summarize`
- Governed write/tool attempt (`POST /v1/ai/actions`) — `operation` + optional `action.kind` / `target_id` / safe attributes

Action is a **governed subject/context**, not a decision authority.

---

## 2. Operation vs Action

| Concept | Meaning | Example |
|---------|---------|---------|
| **Operation** | Capability / request verb | `write`, `summarize` |
| **Declared kind** | Caller-declared subtype | `field_update`, `clinical_note` |
| **Action (governed)** | Normalized attempt + server facts | Category `UPDATE`, target id, field token, write class, enforcement boundary |

Tool grants authorize **operations** (often via `action.kind ?? operation`).  
EPA Decision `action` column remains the mapped operation verb (e.g. `WRITE`).

---

## 3. Action context (Phase D)

Server-authored snapshot persisted on:

```text
policy_evaluations.ai_context.action_governance
```

Fields (`RuntimeActionFacts`):

| Field | Authority |
|-------|-----------|
| `category` | Server (`READ`/`CREATE`/`UPDATE`/`DELETE`/`EXECUTE`/`TRANSMIT`/`INVOKE`/`OTHER`) |
| `operation` | Request operation |
| `kind` | Declared request fact |
| `target_id` | Declared request fact (identifier, not payload) |
| `attributes` | **Sanitized** — safe keys only (`field`, `entity_type`, …); **values stripped** |
| `write_governance_class` | Server (reuses technology-neutral write-field classification) |
| `enforcement_boundary` | Server |
| `client_commit` | Server (from actions-path `client_commit` stamp) |

Declared `ai_context.action` is also sanitized before persistence (no `value`/`content` payloads).

---

## 4. Server-authoritative facts

Client may supply operation, kind, target_id, and attribute names.  
Client **cannot** authoritatively set:

- `category`
- `write_governance_class`
- `enforcement_boundary`

Unknown keys such as `action_category` / `write_governance_class` under `governance_context` are **rejected by the strict request schema** (HTTP 400). Even if those values were present in an internal mapping path, `buildRuntimeActionFacts` derives category and write class only from operation + action shape — never from client governance attestation.

Agent/Tool authorization remains Phase A substrate (`RuntimeActorFacts`).

---

## 5. EPA / PDP integration

```text
Runtime Actor Facts (optional)
  + Action Governance Facts
  + Interrogation / identity / purpose / …
        ↓
PackBackedEnterprisePdp
        ↓
ONE policy_evaluations record
```

Module: `gateway/src/policy/enterprise/action-governance.ts`  
Stamped in `toInputEvaluationRequest` (`map.ts`).  
Baseline facts include `action_category`, `write_governance_class`, `action_enforcement_boundary` for pack consumption.  
HIPAA write tiers continue to use server-derived write class — no Action PDP.

---

## 6. Decision architecture

**`policy_evaluations` remains authoritative.**  
No Action Decision table. No Action approval engine.

Admin detail exposes:

- `action_governance` (historical snapshot)
- `request_context` projections (`action_category`, `action_kind`, `action_field`, …)
- Existing Decision / Consequence / Review / Outcome panels

---

## 7. Enforcement boundary (explicit)

| Path | What Enigma enforces | What remains client/system dependent |
|------|----------------------|--------------------------------------|
| Completions | Block / transform / hold / model eligibility before inference | — |
| Actions DENY / unauthorized actor | HTTP block — **no** `commit_allowed` (`enforcement_boundary: denied`) | Noncompliant clients can still mutate systems of record outside Enigma |
| Actions REVIEW | Safety hold; no commit until approver AUTHORIZE + resume (`enforcement_boundary: review_required`) | Same residual if noncompliant |
| Actions ALLOW | Audit `CLIENT_COMMIT_ALLOWED` + response `commit_allowed` + `enforcement_boundary: client_commit_required` | **External DML** performed by client; Outcome is **client-reported** |

Product 1.0 API/UI classes:

- `GATEWAY_ENFORCED`
- `CLIENT_COMMIT_REQUIRED`
- `REVIEW_REQUIRED`
- `DENIED`

`enforcement_boundary` on action responses and `enforcement_integrity` on evaluation detail make this explicit.

Resume binding (Product 1.0): held Decision fields (agent, tool, operation, action kind/target/field, purpose, authorization context) must be presented again on resume. Omitting a held field is `CONTEXT_MISMATCH` — Evaluation A cannot authorize Action B by dropping identifiers.

**Enigma does not claim Gateway DML proxying where only client commitment exists.**

---

## 8. Review / Approver

Unchanged:

```text
REVIEW → Approver (governance_resolve) → resolve → resume → execution/outcome
```

End user does not approve. Machine Decision is not overwritten.

---

## 9. Outcome / Evidence

Existing `action_outcomes` + audit receipts. No `gateway/src/outcomes/`.  
Evidence can show actor, operation, action category/kind/target/field, decision, review, resume, outcome — without sensitive payloads.

---

## 10. Historical snapshots

Use evaluation-time `ai_context.action_governance` and `runtime_actor`.  
Do not reconstruct from live Agent/Tool/Application registries.

---

## 11. Healthcare compatibility

Healthcare packs continue through PackBackedEnterprisePdp.  
Write classification remains technology-neutral field tokens (not Salesforce-specific architecture).  
No HIPAA Action PDP.

---

## 12. Security invariants

All Phase C invariants preserved, plus:

- Action context cannot bypass Agent/Tool substrate or EPA
- Sensitive action payloads are not unnecessarily persisted
- Enforcement claims match the real boundary (`client_commit_required` documented)

---

## 13. Current limitations

- No universal execution proxy for arbitrary tools/systems
- Action taxonomy is minimal and extensible — not an enterprise data model
- Completions without `action` object still get a lightweight `action_governance` from operation alone
- Data/System registries deferred (not Phase D)

---

## 14. Deferred

- Data governance / catalogs / DLP
- System inventory
- Generic connector framework
- Action-specific workflow engine
- Expanding write classification beyond current allowlists without pack need

---

## 15. Implementation map

| Piece | Path |
|-------|------|
| Facts builder | `gateway/src/policy/enterprise/action-governance.ts` |
| Persist on evaluate | `gateway/src/policy/enterprise/map.ts` |
| Pack facts | `gateway/src/policy/enterprise/pack-pdp.ts`, `packs/baseline.ts` |
| Admin projection | `evaluation-query.ts`, `admin-routes.ts` |
| UI | `DecisionActionGovernancePanel`, Decision Story (`DecisionStoryPanel`), request context panel |
| Tests | `gateway/tests/unit/action-governance-phase-d.test.ts` |
