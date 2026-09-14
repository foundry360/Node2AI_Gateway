# Enigma Evidence Architecture Review

**Scope:** Inspection-only review after Audit Integrity Phase 1, Phase 2, Phase 3A, and Phase 3B  
**Date:** 2026-09-13  
**Nature:** Architecture review — no feature development; no Azure / KMS / Merkle / blockchain / new ledgers  

> **Update (Phase 4 implemented):** Client-reported Outcome receipts are now first-class via `POST /v1/ai/actions/outcome` and sealed into the existing audit chain. See [`PHASE_4_ENFORCEMENT_OUTCOME.md`](./PHASE_4_ENFORCEMENT_OUTCOME.md). The historical finding below remains accurate for the pre-Phase-4 baseline; Outcome is still **client-reported**, not independent external verification.

> Cryptographic verification is **not** legal/regulatory certification.  
> This report describes what Enigma can **prove** today versus what it can **correlate** or **project**.

---

## 1. Executive Summary

### Final question

> If a regulator or enterprise auditor provides an `evaluation_id`, can Enigma produce independently verifiable evidence proving exactly what happened, why it was allowed, blocked, or held, who or what initiated it, which policy governed it, what enforcement occurred, who approved it when required, which model actually executed, and what ultimately happened?

**Answer: YES, WITH LIMITATIONS**

### Why

Enigma already has a coherent authority split and a working cryptographic ops ledger:

| Layer | Authority today |
|-------|-----------------|
| **Decision** | `policy_evaluations` (historical Decision record) |
| **Operations** | `audit_events` (append-only hash chain + HMAC) |
| **Seal** | Signed Ed25519 checkpoints over contiguous sequence ranges |
| **Preserve** | Evidence anchors to customer-controlled storage (filesystem / S3) |
| **Verify (asymmetric)** | Checkpoint / anchor with public JWKS only |
| **Verify (full chain)** | Still requires appliance HMAC key (`GATEWAY_AUDIT_KEY`) |

An auditor can start from `evaluation_id`, load the Decision (policy version, context, obligations, human resolution, restrictions), join correlated audit via `request_id` / `evaluation_id` / `decision_hash`, and follow checkpoint → external anchor.

Limitations that prevent an unqualified **YES**:

1. **Outcome is not a first-class stored object** — especially Agent WRITE, where Enigma authorizes `commit_allowed` but does not record the client system’s actual write success/failure.
2. **Independent verification without HMAC cannot authenticate individual audit events** — only the signed checkpoint tip and matching anchor.
3. **Enforcement status is projected**, not sealed as a first-class historical fact; `UNKNOWN` is possible when correlation fails.
4. **`policy_evaluations` is mutable** (human resolution / execution / ON CONFLICT refresh) — not append-only like `audit_events`.
5. **Pack version** is historical primarily inside `explanation` JSON, not on the shallow `applicable_policies` array.
6. **Threshold leftovers** can remain uncheckpointed until time threshold or manual checkpoint (not permanently lost if defaults remain enabled).

### Architectural invariant (preserved)

```text
Policy decides.
Gateway enforces.
Audit records.
Checkpoint seals.
Anchor preserves.
Customer storage retains.
```

External anchoring is **not** on the PDP / AI request path.

---

## 2. Current Evidence Architecture

```text
Request
  → Request Context (subject / app / agent / tool / action / target / purpose / model)
  → Policy Evaluation (EPA Pack PDP)
  → Decision  ────────────────────────────  policy_evaluations  (authoritative)
  → Consequence (derived expected action)
  → Enforcement (Gateway)  ───────────────  audit_events + projection
  → Outcome  ─────────────────────────────  PARTIAL / not first-class
  → Audit Event (hash chain + HMAC)
  → Checkpoint (Ed25519, contiguous sequences)
  → Evidence Anchor + durable AnchorJob
  → External Evidence (filesystem | S3 Object Lock target)
```

### Product surfaces

| Surface | Path | Role |
|---------|------|------|
| Decisions | Admin `/decisions`, `GET /v1/admin/evaluations` | Decision inbox |
| Decision detail | `/evaluations/:evaluationId` | Full Decision + consequence + enforcement + model governance + review |
| Audit | `/audit` | Integrity + External Evidence + event table |
| Audit detail | drawer via `GET /v1/admin/audit/:auditId` | Crypto + checkpoint + external anchor |
| Evidence export | `GET /v1/admin/audit/evidence/export` | Package (events, checkpoints, anchors) |
| Lifecycle | `GET /v1/admin/audit/lifecycle` | Uncheckpointed / unanchored health |

---

## 3. Evidence Graph

```text
evaluation_id  (policy_evaluations.evaluation_id)
    │
    ├── Policy Evaluation
    │      ├── decision (machine, immutable intent)
    │      ├── applicable_policies[{policy_id, version, pack_id}]
    │      ├── explanation.resolution.contributions[{pack_version, …}]
    │      ├── explanation.provenance.{matched_rules, sources}
    │      ├── obligations[]
    │      ├── restrictions.eligible_models   (historical snapshot)
    │      └── evidence_in / subject / resource / context / ai_context
    │
    ├── Request Context
    │      ├── subject.user_id / roles
    │      ├── subject.application_id
    │      ├── ai_context.agent_id / tool_id
    │      ├── action + ai_context.action.{kind, target_id, attributes}
    │      ├── context.purpose / authorization / recipient
    │      └── ai_context.requested_model / available_models
    │
    ├── Decision + Consequence
    │      ├── machine decision column
    │      ├── deriveDecisionConsequence() → expected_action (DERIVED)
    │      └── obligations
    │
    ├── Human Resolution (additive JSON)
    │      ├── original_decision
    │      ├── human_disposition / final_decision
    │      ├── resolved_by / resolved_at / resolution_reason
    │      └── execution.{status, resume_audit_id}
    │
    ├── Enforcement (PROJECTED)
    │      ├── findAuditForEvaluation(request_id | metadata eval ids)
    │      ├── status ALLOWED|BLOCKED|CONTROLS_APPLIED|REVIEW_REQUIRED|…
    │      └── audit_id / request_id / verified
    │
    ├── Outcome
    │      └── NOT a durable entity (see §10)
    │
    └── Audit Evidence
           ├── audit_events.evaluation_id + decision_hash
           ├── sequence_number / deployment_id / event_hash / HMAC
           ├── Checkpoint (sequence_start–end, root_hash, Ed25519)
           └── EvidenceAnchor → AnchorJob → external JSON artifact
```

### Relationship mechanics

| From → To | Mechanism | Historical? | Independently verifiable? |
|-----------|-----------|-------------|---------------------------|
| Evaluation → Audit | Soft: `request_id`, `evaluation_id`, `decision_hash` (no FK) | Audit sealed; join is soft | Hash binds Decision payload when `decision_hash` present |
| Evaluation → Policy version | `applicable_policies[].version` snapshot | Yes | Via Decision record (+ optional `decision_hash`) |
| Evaluation → Pack version | Mostly `explanation.resolution.contributions` | Yes if explanation intact | Same |
| Audit → Checkpoint | Contiguous sequence containment | Yes | Ed25519 over checkpoint; tip `root_hash` |
| Checkpoint → Anchor | `checkpoint_id` + deterministic object path | Yes | Anchor + public JWKS |
| Anchor → External object | `anchor_uri` / store get | Platform-dependent | After retrieval: public-key verify |

---

## 4. Evaluation ID Trace

Representative path: `GET /v1/admin/evaluations/:evaluationId` + joined audit + lifecycle.

| Item | Classification | Notes |
|------|----------------|-------|
| `evaluation_id` | **PRESENT** | PK |
| `request_id` | **PRESENT** | Column; soft correlator |
| `deployment_id` | **PARTIAL** | On audit/checkpoints; not a column on `policy_evaluations` |
| application | **PRESENT** | `subject.application_id` |
| user/subject | **PRESENT** | `subject.user_id` (+ roles) |
| agent | **PRESENT** / **PARTIAL** | `ai_context.agent_id` / `subject.agent_id` when supplied |
| tool | **PRESENT** / **PARTIAL** | `ai_context.tool_id` when supplied |
| action | **PRESENT** | Top-level `action` + `ai_context.action` |
| target | **PARTIAL** | `ai_context.action.target_id` / hold context — not first-class column |
| purpose | **PRESENT** | `context.purpose` when supplied |
| authorization context | **PRESENT** | `context.authorization` when supplied |
| requested model | **PRESENT** | `ai_context.requested_model` |
| authorized model set | **PRESENT** | `restrictions.eligible_models` (post-migration); legacy may be `not_recorded` |
| executed model | **PRESENT** on completions via audit `model_selected`; **PARTIAL/MISSING** on Agent WRITE client-commit |
| policy + version | **PRESENT** | `applicable_policies` |
| policy pack id | **PRESENT** | `pack_id` on applicable list |
| pack version | **PARTIAL** | Prefer explanation contributions; not on shallow applicable list |
| regulatory source | **PRESENT** | Provenance `source_ids` / `sources` in explanation |
| decision | **PRESENT** | Machine `decision` |
| obligations | **PRESENT** | JSONB |
| consequence | **DERIVABLE** | API projection, not stored |
| human resolution | **PRESENT** when REVIEW resolved | Additive JSON |
| enforcement | **DERIVABLE** | Projection from audit join |
| outcome | **MISSING** as entity; **PARTIAL** via audit `response_decision` / HTTP status |
| audit event | **PRESENT** when Gateway wrote audit | Soft join |
| audit sequence | **PRESENT** on Phase-1 sealed events | |
| checkpoint | **PRESENT** after threshold/time/manual | May lag |
| external anchor | **PRESENT** when anchoring configured + job succeeded | Else NOT CONFIGURED / PENDING / FAILED |

**Rule used:** PRESENT only if stored for that evaluation (or sealed ops event), not merely inferable from today’s packs/registry.

---

## 5. Historical Truth Analysis

### What is historically snapshotted

- Machine decision, reason, obligations  
- `applicable_policies` with **policy version** and pack id  
- Subject / context / ai_context / evidence_in  
- Explanation provenance (matched rules, source ids, citations)  
- Resolution contributions (including **pack_version** when written)  
- `restrictions.eligible_models` at evaluation time (when recorded)  
- Human resolution fields (additive; preserves `original_decision`)  
- Audit chain (append-only) once sealed  

### What must not be re-derived from current state

Documented product intent (and Models work): eligibility / authorization must **not** be recalculated from today’s model registry or active pack MAX(version) when reconstructing a past Decision. Live PDP reload uses current catalog for **new** evaluations only.

### Risks to historical truth

| Risk | Severity | Detail |
|------|----------|--------|
| `policy_evaluations` UPDATEs | **ARCHITECTURAL RISK** | Human resolution, execution, and `ON CONFLICT` refresh mutate the Decision row — not an append-only Decision ledger |
| Pack version not on `applicable_policies` | **HARDEN** | Shallow consumers can miss `pack_version` |
| Enforcement recomputed | **HARDEN** | Status is join-time projection; audit facts are historical, labels are not sealed |
| Legacy evaluations without `restrictions` | **GAP** (legacy) | `eligibility: not_recorded` — must not invent empty authorized sets |
| Full policy text not embedded | **HARDEN** | Version id is stored; full policy body may require retaining versioned catalog artifacts separately |

**Policy v1 yesterday / Policy v2 today:** Yes — `applicable_policies[].version` on the evaluation should still show v1. Do **not** re-resolve against today’s active pack for that historical Decision.

---

## 6. Human Approval Trace

Expected lifecycle:

```text
Machine Decision REVIEW
  → Human Approver AUTHORIZE|DENY
  → execution AUTHORIZED_NOT_RESUMED → RESUMED
  → Client commit / Gateway resume
  → Enforcement audit
```

### What evidence proves today

| Fact | Status |
|------|--------|
| Original machine decision | **PASS** — column unchanged; copied to `human_resolution.original_decision` |
| Approver identity | **PASS** — `resolved_by` |
| Disposition + final_decision | **PASS** |
| Timestamp + reason | **PASS** |
| Resume lifecycle | **PASS** — `execution` + `resume_audit_id` |
| Resolve audit event | **PASS** — `operation: evaluation_resolve` |
| End user ≠ approver | **PASS** if actors are distinct in subject vs `resolved_by` |
| AUTHORIZE alone = verified ALLOWED | **Not claimed** — resume + completion audit required |

### Gaps

- Approver **role** / organizational authority is not a structured field (free-text / actor string).  
- Content-fallback resume without `resume_evaluation_id` weakens binding (transitional).  
- `decision_hash` includes disposition codes but excludes free-text reason and actor (by design for stable hashing) — actor proves via evaluation JSON + resolve audit, not via hash alone.

---

## 7. Agent Governance Trace

Agent WRITE (`POST /v1/ai/actions`) is **client-commit**: Gateway authorizes; the application commits.

```text
End User → Application → Agent → Tool → declared action/target
  → PDP → Decision → (REVIEW → AUTHORIZE → resume) → commit_allowed
  → audit CLIENT_COMMIT_ALLOWED
  → [client system writes — outside Enigma]
```

| Concern | Assessment |
|---------|------------|
| Distinguish user / app / agent / tool / approver | **ADEQUATE** when context is fully supplied |
| Action / target / field class | **ADEQUATE** via `ai_context.action` + HIPAA field-class helpers |
| Actual write success in Salesforce/EHR | **GAP** — no first-class outcome receipt |

---

## 8. Model Authorization Trace

```text
Requested (ai_context)
  → Authorized set (restrictions.eligible_models)   [historical]
  → Executed (audit.model_selected / provider)        [completions]
  → authorization_match projection
```

| Path | Strength |
|------|----------|
| Completions | **STRONG** when audit joined |
| Agent WRITE / client-commit | **PARTIAL** — executed model often N/A (`client-commit`); match `not_applicable` |
| Historical eligibility | **STRONG** when `restrictions` recorded; **GAP** on pre-migration rows |

Do not rebuild historical authorization from today’s Models registry.

---

## 9. Enforcement Verification

```text
Decision → Expected consequence → Actual Gateway audit → EnforcementProjection
```

Statuses: `ALLOWED` | `BLOCKED` | `CONTROLS_APPLIED` | `REVIEW_REQUIRED` | `FAILED` | `NOT_EXECUTED` | `UNKNOWN`

| Requirement | Result |
|-------------|--------|
| Distinguish UNKNOWN from successful enforcement | **PASS** — explicit `UNKNOWN` when join fails |
| Safety hold ≠ policy DENY | **PASS** — REVIEW pending + Gateway BLOCK → `REVIEW_REQUIRED` / `safety_fallback` |
| Soft correlation only | **HARDEN** — no FK; prefer `request_id` then metadata eval ids |

---

## 10. Outcome Analysis

**Outcome is not a durable Enigma entity.** Distinctions today:

| Concept | Representation |
|---------|----------------|
| Decision | `policy_evaluations.decision` (+ human `final_decision`) |
| Enforcement | Projected from audit |
| Outcome | Implicit: `response_decision`, HTTP body, Agent WRITE `commit_allowed` |

**Missing for regulated reconstruction of Agent WRITE:** customer-system commit receipt (success/failure, record id, timestamp) bound to `evaluation_id`.

Do not invent Outcome architecture in this review — record the gap only.

---

## 11. Audit Integrity

### Coverage by path (conceptual)

| Path | Decision recorded? | Audit sealed? |
|------|--------------------|---------------|
| ALLOW completions | Yes | Yes (RELEASE) |
| ALLOW_WITH_CONTROLS | Yes | Yes (transforms reflected) |
| REVIEW → AUTHORIZE → resume | Yes + human_resolution | Resolve audit + resume/completion audit |
| DENY / BLOCK | Yes | Yes (BLOCK) |
| Agent WRITE approve | Yes | Yes (`CLIENT_COMMIT_ALLOWED`) |
| Agent WRITE hold | Yes + held_request | Fail-closed response; resolve later |

### Integrity properties

- Append-only triggers on `audit_events`  
- Deployment-scoped sequences  
- Hash chain + HMAC (`GATEWAY_AUDIT_KEY`)  
- Optional `input_hash` / `response_hash` (content not stored)  
- Decision binding via `evaluation_id` + `decision_hash`  

### Gaps

- Soft FK to evaluations  
- Incomplete binding if evaluation missing at write time (`decision_hash` null)  
- Metrics process-local  

---

## 12. Checkpoint Coverage (Phase 3B)

| Property | Behavior |
|----------|----------|
| Contiguous ranges | Next checkpoint starts at `last.sequence_end + 1` |
| Overlap | Prevented by unique `(deployment_id, sequence_start|end)` + locks |
| Skip holes | No intentional skips; catch-up chunks forward from tip of last CP |
| Empty CP | Refused |
| Defaults | 500 events **or** 900 seconds |
| Catch-up | ≤5 checkpoints/tick, each ≤ event threshold |
| Leftovers | Events below threshold remain until **time** trigger or **manual** checkpoint |

**Permanently uncheckpointed?** Only if time threshold is disabled **and** no manual checkpoint — not the default. With defaults, leftovers are eventually sealed.

Conceptual healthy series:

```text
1–500 → 501–1000 → 1001–1500
```

Not:

```text
1–500 → 501–1000 → 1501–2000   (1001–1500 missing)
```

---

## 13. External Anchoring (Phase 2 / 3A)

```text
Checkpoint → EvidenceAnchor (append-only history)
          → AnchorJob (durable, mutable ops state)
          → External artifact (canonical JSON, no secrets/PHI)
```

Artifact contains: deployment, checkpoint id, sequence range, event_count, root_hash, key_id, checkpoint_signature, created_at.

| Property | Status |
|----------|--------|
| Deterministic object path | **PASS** |
| No overwrite / conflict detection | **PASS** (`ANCHOR_CONFLICT`) |
| Idempotent identical put | **PASS** |
| Retry / FAILED / manual retry | **PASS** |
| Async vs governance | **PASS** |
| S3 optional; filesystem air-gap | **PASS** |
| Object Lock enforced by Enigma | **No** — customer platform |

---

## 14. Independent Verification

| What | Requirements | Result |
|------|--------------|--------|
| Anchor authenticity (checkpoint signature) | Anchor JSON + public JWKS | **Verifiable offline** |
| Checkpoint matches external object | Same + optional hash compare | **Verifiable** |
| Full event chain authenticity | **HMAC key** + events | **Not independent of appliance secret** |
| Sequence / tip vs root_hash | Events + checkpoints (+ HMAC for event auth) | Package verify uses HMAC |
| Evidence package | Events + checkpoints + anchors; `policy-evaluations.jsonl` currently placeholder | **PARTIAL** |

**Independent verifier must NOT require:** Enigma runtime, PostgreSQL, checkpoint private key, AWS credentials (after artifact retrieval), or — for **anchor-only** verify — HMAC.

**Independent verifier still cannot (today):** prove every event body under the tip without HMAC or an asymmetric event-seal design.

Note: `verifyIndependentAnchor` reports signature validity; it does not recompute the tip from exported events.

---

## 15. Tamper Testing (analysis)

| Attack | Expected detection |
|--------|-------------------|
| Modify sealed audit event | HMAC / event_hash failure (**with key**) |
| Delete event in range | Sequence gap / chain break (**with events + verify**) |
| Insert event | Chain / sequence failure |
| Modify checkpoint | Ed25519 signature failure |
| Modify external anchor | Content / signature / `ANCHOR_CONFLICT` |
| Modify `policy_evaluations` Decision | **Not directly hash-chained**; detected only if `decision_hash` on audit no longer matches recomputed Decision payload — **PARTIAL** |
| Bypass DB triggers as superuser | Outside application guarantees |

---

## 16. Retention Boundary

| Term | Applies to |
|------|------------|
| **Tamper-evident** | Audit hash chain + HMAC (appliance trust domain) |
| **Cryptographically verifiable** | Checkpoints (asymmetric); anchors with public key |
| **Externally anchored** | Signed checkpoint statements in customer store |
| **Customer-controlled** | Bucket/directory, IAM, retention policy |
| **WORM / immutable** | Only where customer platform enforces it (e.g. S3 Object Lock) — **not** claimed for filesystem or Enigma DB alone |

Enigma must not claim absolute immutability for every deployment.

---

## 17. Evidence Reconstruction Exercises

### A. Agent WRITE — update patient phone

```text
User → Salesforce → Agent → Tool → update_patient_field / phone
  → PDP → ALLOW_WITH_CONTROLS or REVIEW
  → Gateway authorize commit_allowed
  → Audit sealed
  → Checkpoint / Anchor (ops ledger)
```

| Auditor question | Supported? |
|------------------|------------|
| Who / app / agent / tool / action / target | Yes if context supplied |
| Policy + version | Yes |
| Enforcement authorize | Yes via audit |
| Phone actually updated in EHR | **No** (Outcome gap) |

### B. Clinical note write — REVIEW

```text
REVIEW → Approver AUTHORIZE → resume (client_commit) → commit_allowed → audit
```

Machine decision preserved; approver in `human_resolution`; resume execution tracked. Actual note persistence still outside Enigma.

### C. Unauthorized external transmission — DENY

```text
DENY → Gateway BLOCK → audit → checkpoint → optional anchor
```

Well supported for Decision + blocked enforcement evidence.

---

## 18. Regulated-Industry Auditor Questions

| Question | Answerability |
|----------|---------------|
| Who initiated? | Strong if `subject.user_id` present |
| What did AI attempt? | Strong via action / ai_context / held_request |
| Where (app/tool/target)? | Adequate when context complete |
| Why (purpose/auth)? | Adequate when context complete |
| Which policy/version? | Strong |
| Regulatory context? | Strong via provenance; pack version deeper in explanation |
| Decision? | Strong |
| Consequence / controls? | Strong (obligations + transforms on audit) |
| Who approved? | Strong when REVIEW resolved |
| What happened (enforcement)? | Strong when audit joined; UNKNOWN if not |
| What ultimately happened (business outcome)? | **Weak for WRITE** |
| Crypto verify ops ledger? | Strong with HMAC; checkpoint/anchor with public key |
| Externally preserved? | Strong when anchoring configured and ANCHORED |

---

## 19. Evidence Quality Score

| Area | Score |
|------|-------|
| 1. Identity evidence | **ADEQUATE** |
| 2. Request context | **ADEQUATE** |
| 3. Agent/tool evidence | **ADEQUATE** |
| 4. Action/target evidence | **ADEQUATE** |
| 5. Policy evidence | **STRONG** |
| 6. Historical policy provenance | **ADEQUATE** (harden pack_version surfacing) |
| 7. Decision evidence | **STRONG** |
| 8. Consequence evidence | **ADEQUATE** (derived) |
| 9. Human approval evidence | **STRONG** |
| 10. Model authorization evidence | **STRONG** (completions) / **PARTIAL** (WRITE) |
| 11. Enforcement evidence | **ADEQUATE** |
| 12. Outcome evidence | **GAP** |
| 13. Audit integrity | **STRONG** |
| 14. Checkpoint integrity | **STRONG** |
| 15. External anchoring | **STRONG** (when configured) |
| 16. Independent verification | **PARTIAL** (asymmetric for checkpoints/anchors; HMAC for full chain) |
| 17. Retention boundary | **ADEQUATE** (terminology must stay precise) |

---

## 20. Findings

### PASS

- Machine Decision authority in `policy_evaluations` with policy version snapshot  
- Human resolution additive; machine decision not overwritten  
- Audit append-only hash chain + Decision binding (`evaluation_id` / `decision_hash`)  
- Contiguous, concurrency-safe checkpoints; empty checkpoint prevention  
- Async external anchoring; failure isolation from PDP  
- Filesystem air-gap + optional S3 adapter  
- Admin navigation Decision ↔ Audit when correlation exists  
- Model requested / authorized / executed projection for completions  

### HARDEN

| Item | Location | Why | Severity |
|------|----------|-----|----------|
| Elevate `pack_version` onto `applicable_policies` or export | `policy-resolution` / evidence export | Avoid shallow-miss of pack provenance | Medium |
| Prefer sealed enforcement summary or stronger join | `enforcement-projection.ts` | Reduce `UNKNOWN` / drift | Medium |
| Persist lifecycle metrics | `lifecycle-metrics.ts` | Process-local only | Low |
| Fill `policy-evaluations.jsonl` in evidence package | `evidence.ts` | Export incomplete for Decision reconstruction | Medium |
| Document leftover checkpoint behavior ops runbooks | Phase 3B | Time threshold must stay enabled or manual CP required | Low |

### GAP

| Item | Current | Why it matters | Severity | Recommended remediation (do not implement here) |
|------|---------|----------------|----------|--------------------------------------------------|
| First-class Outcome / client-commit receipt | Authorize only | Cannot prove EHR/CRM write completed | **High** (WRITE) | Optional signed client outcome callback bound to `evaluation_id` |
| Asymmetric full-chain verify | HMAC required for events | Independent auditor needs shared secret for event auth | **High** (independence) | Future: per-event asymmetric seals or inclusion proofs under checkpoint |
| Direct Decision-row tamper chain | Evaluations mutable | Altered Decision may only fail when rehashed vs `decision_hash` | **Medium** | Append-only Decision evidence events or versioned evaluation history |

### ARCHITECTURAL RISK

| Item | Behavior | Risk | Severity |
|------|----------|------|----------|
| Mutable `policy_evaluations` | UPDATE for resolution/execution/upsert | Historical Decision row is not an append-only evidence ledger | **High** |
| Soft audit↔evaluation correlation | No FK | Orphaned or mis-joined enforcement projections | **Medium** |
| Claiming “immutable evidence” for filesystem / DB | App-level append-only only | Overstatement vs WORM | **Medium** (comms) |

---

## 21. Recommended Next Steps

Ordered by evidence value (still **not** implementing in this review):

1. **Outcome receipt for Agent WRITE** — bind client commit result to `evaluation_id` without putting storage on the PDP path.  
2. **Evidence export completeness** — include Decision snapshots (`policy_evaluations`) correlated by `evaluation_id` in the export package.  
3. **Decision history / append-only evaluation evidence** — preserve machine Decision immutably even as resolution/execution advance.  
4. **Independent event verification roadmap** — reduce reliance on HMAC for external auditors (asymmetric event seals or Merkle inclusion under checkpoints).  
5. **Surfacing pack_version** on applicable policy refs and Audit/Decision UI.  
6. **Keep Phase 3B defaults** (event + time thresholds) in production; alert on `oldest_unanchored` / uncheckpointed age.  

Explicitly **out of scope** still: Azure adapter, KMS/HSM, Merkle productization, blockchain, new PDP, navigation redesign.

---

## 22. Final Answer (restated)

**YES, WITH LIMITATIONS.**

Enigma can, for a given `evaluation_id`, reconstruct **who/what/why/which policy/what decision/who approved/what the Gateway enforced**, and can cryptographically support the **ops audit ledger** (HMAC chain) plus **independently verifiable checkpoints and external anchors** (public key). It cannot yet fully prove **business Outcome** for client-commit writes, cannot give auditors a full event-chain proof **without** the HMAC secret, and must not over-claim WORM immutability where the customer platform does not enforce it.

```text
Policy decides. → Gateway enforces. → Audit records.
Checkpoint seals. → Anchor preserves. → Customer storage retains.
```

That chain is real. Closing the Outcome and independent-event-auth gaps is what turns **YES, WITH LIMITATIONS** into an unqualified regulated-industry **YES**.
