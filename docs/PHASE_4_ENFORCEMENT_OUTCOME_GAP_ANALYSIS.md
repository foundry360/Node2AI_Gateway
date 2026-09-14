# Phase 4 Gap Analysis — Enforcement, Execution, and Outcome Evidence

**Nature:** Inspection-only (no Phase 4 implementation)  
**Builds on:** [`EVIDENCE_ARCHITECTURE_REVIEW.md`](./EVIDENCE_ARCHITECTURE_REVIEW.md), Audit Integrity Phases 1–3B  
**Primary example:** Agent WRITE via Salesforce demo + Gateway `POST /v1/ai/actions`

---

## Executive answers (required)

### Question 1

**Can Enigma currently prove that an authorized Agent WRITE actually occurred in the downstream system?**

```text
NO
```

Enigma proves **authorization to commit** (`action: commit_allowed` + sealed audit with `CLIENT_COMMIT_ALLOWED`). Salesforce (or any client) performs DML **after** that response and does **not** report success/failure back to Enigma. Downstream `COMPLETED` / DML errors exist only in the Salesforce process (`GovernedWriteResult`), not in Enigma persistence.

### Question 2

**Can Enigma currently prove what happened when downstream execution fails or becomes uncertain?**

```text
NO
```

Enigma has no Outcome / execution-result API or table for client-commit writes. Cases B–D (client fail before DML, timeout, lost client response after DML) are invisible to Enigma. Enigma can only prove that it issued authorization (or blocked / held for review).

### Question 3

**What is the minimum architectural change required to make Outcome first-class?**

Add a **client-reported Outcome receipt** bound to an existing `evaluation_id` (and preferably the authorizing `request_id` / a client `execution_id`), persisted as **append-only audit evidence** (and optionally a small immutable Outcome projection row), **after** enforcement/authorization — never on the PDP path. Do not invent a second Decision ledger.

### Question 4

**Should Enforcement become a first-class evidence record, or can the current architecture support the requirement without one?**

**Mostly without a new Enforcement table.** Enforcement is already **observed** in sealed `audit_events` and **projected** for UI. Phase 4 should:

1. Harden correlation (prefer `evaluation_id` on the event, document join rules).  
2. Optionally stamp a stable `enforcement_status` (or equivalent reason codes) onto the **authorization audit event** at write time so UI does not solely re-derive.  

A separate Enforcement table is optional; sealing observed enforcement facts into the existing audit chain is enough for “first-class evidence.”

### Question 5

**What should Phase 4 implement first?**

1. **Outcome receipt API** for client-commit (`evaluation_id` + `execution_id` + result status).  
2. **Seal Outcome as audit event(s)** under the existing HMAC chain / checkpoints.  
3. **Salesforce (and other clients) report COMPLETED / FAILED** after DML.  
4. **Idempotent upsert / conflict rules** for duplicate/conflicting reports.  
5. Then harden enforcement projection + Decision lifecycle history (append-only evaluation events) if still needed.

---

## 1. Agent WRITE lifecycle (traced)

```text
Salesforce Agent / Apex
  → EnigmaGatewayService.updatePatientFieldGoverned / appendClinicalNoteGoverned
  → evaluateWriteAction → HTTP POST {Endpoint}/v1/ai/actions
  → gateway/src/api/server.ts  app.post('/v1/ai/actions')
  → GatewayOrchestrator.actions()
  → Identity authenticate + actionRequestSchema
  → Pack PDP evaluate (or resume_evaluation_id path)
  → policy_evaluations persist
  → (REVIEW) attachHeldRequest + 403 safety_hold
  → (ALLOW path) writeAudit(CLIENT_COMMIT_ALLOWED) + HTTP 200 { action: 'commit_allowed' }
  → Salesforce if AUTHORIZED: DML insert/update
  → Salesforce returns COMPLETED|ERROR to agent UI  ✗ not sent to Enigma
```

### Exact files / functions

| Step | Location |
|------|----------|
| SF field update entry | `salesforce-healthcare-demo/.../EnigmaGatewayService.cls` → `updatePatientFieldGoverned` |
| SF clinical note entry | same → `appendClinicalNoteGoverned` |
| SF Enigma call | `evaluateWriteAction` → `POST /v1/ai/actions` |
| Gateway route | `gateway/src/api/server.ts` |
| Orchestrator | `gateway/src/api/orchestrator.ts` → `actions`, `claimAuthorizedClientCommit`, `resumeAuthorizedEvaluation` |
| Request schema | `gateway/src/api/validation.ts` → `actionRequestSchema` |
| PDP / Decision | `gateway/src/policy/enterprise/*` → `policy_evaluations` |
| Hold / resume | `decision-resume.ts`, `held_request`, `execution` JSON |
| Human AUTHORIZE | `POST /v1/admin/evaluations/:id/resolve` → `human_resolution` |
| Audit seal | `writeAudit` → `IntegrityAuditService.record` |
| Enforcement UI | `enforcement-projection.ts` → `projectEnforcementResult` / `findAuditForEvaluation` |

---

## 2. `commit_allowed` — exact meaning

| Question | Finding |
|----------|---------|
| Where generated | Enigma Gateway only — `orchestrator.actions` success body and `claimAuthorizedClientCommit` success body |
| Conditions that cause it | Policy path yields non-blocking decision (ALLOW / controls path) **or** successful resume of AUTHORIZE’d `client_commit` hold; audit write succeeds (or fail-closed if audit fails) |
| Conditions that prevent it | Validation/auth failure; PDP DENY/REVIEW/REQUIRE_APPROVAL (held); context mismatch on resume; `ALREADY_RESUMED`; audit write failure when fail-closed |
| Client-generated? | **No** — Salesforce only **interprets** HTTP 200 + `status=approved` + `action=commit_allowed` as `AUTHORIZED` |
| Persisted? | **Indirectly** — audit reason code `CLIENT_COMMIT_ALLOWED` + `response_decision: RELEASE` + metadata `client_commit: true`; HTTP body itself is not a DB row |
| Cryptographic representation | Yes, as sealed audit event fields (HMAC chain); not a separate Outcome signature |
| Means execution occurred? | **No** — means **Enigma authorized the client to execute** |

```text
ENIGMA AUTHORIZATION  =  commit_allowed / CLIENT_COMMIT_ALLOWED
CLIENT EXECUTION      =  Salesforce DML (outside Enigma)
```

---

## 3. Downstream execution (Salesforce)

| Question | Finding |
|----------|---------|
| Where DML runs | Same Apex transaction **after** gate returns `AUTHORIZED` (`insert Clinical_Note__c`, `update Patient__c`, etc.) |
| Result returned to Enigma? | **No** |
| Enigma receives success/fail/timeout/partial? | **No** |
| Does Enigma know write happened? | **No** |

Local Salesforce statuses (`GovernedWriteResult.status`): `AUTHORIZED` (gate only), `COMPLETED` (DML ok), `HELD`, `ERROR` — **client-local only**.

---

## 4. Correlation identifiers

| Identifier | Origin | Persisted (Enigma) | Crosses boundary | Unique for execution? |
|------------|--------|--------------------|------------------|------------------------|
| `evaluation_id` | Gateway PDP / hold | `policy_evaluations`, audit metadata, SF `evaluationId` | Yes (response → SF) | Decision-scoped; **not** DML instance |
| `request_id` | Gateway per `/actions` call | audit, evaluation `request_id`, SF `requestId` | Yes | Authz request; new id on resume/retry call |
| `correlation_id` | Client metadata or Gateway | audit | Yes | Session-ish (`sf-write-{ts}`) |
| `application_id` | Request + API key | evaluation subject / audit | Yes | Tenant app |
| `user.id` | Request body | subject / audit | Yes (demo often `user_clinician`) | Not SF UserId unless mapped |
| `agent_id` / `tool_id` | Request | ai_context / held | Yes | Context, not execution |
| `action.kind` / `target_id` / field attrs | Request | held + audit metadata | Yes | Action identity |
| `resume_evaluation_id` | Client on retry | Used to claim hold | Yes | Continues Decision |
| Salesforce `UserInfo.getUserId()` | SF metadata only | In request metadata if sent | One-way | Not used as Enigma PK |
| Salesforce record Id after insert | DML | **Not in Enigma** | No | Would identify execution if reported |
| `execution_id` (client) | — | **Does not exist** | — | Needed for Phase 4 |
| Transaction / DML id | SF | **Not in Enigma** | No | |

**Immutability:** Decision `decision` column is intended immutable; `human_resolution` / `execution` / held mutate the same row. Audit events are append-only.

---

## 5. Enforcement analysis

### Nature of current enforcement

```text
CORRELATED + DERIVED (projected)
```

Not a persisted Enforcement entity. Observed facts live in `audit_events`; UI status is computed by `projectEnforcementResult(record, audit)`.

### Why `UNKNOWN`

From `enforcement-projection.ts` (non-exhaustive but authoritative):

- No linked audit after human resolve (“no Gateway enforcement record yet”)  
- Human DENY without verified block audit  
- AUTHORIZE but resume not yet `RESUMED` (or only resolution audit present)  
- Missing / mismatched join via `findAuditForEvaluation`  
- Various incomplete Gateway reports  

`findAuditForEvaluation`: prefer `request_id` match; else metadata `evaluation_id` / `response_evaluation_id`; prefer non-`evaluation_resolve` completion audit.

### Status meanings (projection)

| Status | Meaning in code |
|--------|-----------------|
| `ALLOWED` | Completion audit shows allow/release without hard block; controls not emphasized |
| `BLOCKED` | Block audit / DENY path verified |
| `CONTROLS_APPLIED` | Transforms ≠ none/failed on audit |
| `REVIEW_REQUIRED` | Pending REVIEW / safety hold semantics |
| `FAILED` | Hard failure / resume failed |
| `NOT_EXECUTED` | Simulate / not attempted |
| `UNKNOWN` | Cannot verify Gateway enforcement from join |

### Checkpoints

Enforcement **labels** are not checkpoint fields. The underlying **audit events** (including `CLIENT_COMMIT_ALLOWED`) enter the hash chain and thus checkpoints once sequenced.

**Classification:** enforcement evidence facts = **DIRECTLY OBSERVED** in audit; status enum = **DERIVED/CORRELATED**.

---

## 6. Outcome analysis

**No first-class Outcome** object/table/API in Gateway (`outcome` / `execution_result` / `commit_result` not in orchestrator Outcome lifecycle).

| Outcome fact | Current implementation | Authoritative source | Historical? |
|--------------|------------------------|----------------------|-------------|
| Enigma authorized | `commit_allowed` + audit `CLIENT_COMMIT_ALLOWED` | Gateway | Yes (audit) |
| Client received authorization | Implied by HTTP 200 handling in Apex | Client memory/logs | Not in Enigma |
| Client attempted execution | DML try block in Apex | Salesforce | Not in Enigma |
| Client execution succeeded | SF `status=COMPLETED` | Salesforce | Not in Enigma |
| Client execution failed | SF `status=ERROR` | Salesforce | Not in Enigma |
| Client execution timed out | SF HTTP timeout / DML timeout | Salesforce | Not in Enigma |
| Result unknown | Default Enigma view after authz | — | Enigma cannot distinguish |
| Partial execution | Not modeled | — | — |

Post-enforcement Enigma records today: sealed **authorization** audit (+ Decision/resume lifecycle). Nothing after client DML.

---

## 7. Actual evidence gap (Agent WRITE)

### Proven today

```text
Enigma evaluated the request.
Enigma produced ALLOW / REVIEW / DENY (machine decision).
If REVIEW: Approver AUTHORIZE|DENY (human_resolution; machine decision preserved).
If AUTHORIZE + resume: Enigma resumed that Decision (execution.RESUMED).
Enigma permitted the commit (commit_allowed + CLIENT_COMMIT_ALLOWED audit).
```

### Not proven today

```text
Salesforce actually committed the DML successfully.
Salesforce failed / timed out / partially wrote.
Which Salesforce record Id was created/updated.
Whether the client ignored DENY and wrote anyway (unless separate detective controls).
```

---

## 8. Human approval interaction

```text
Machine Decision REVIEW
  → Approver AUTHORIZE (human_resolution; original_decision preserved)
  → execution AUTHORIZED_NOT_RESUMED
  → Client POST /v1/ai/actions with resume_evaluation_id
  → claimAuthorizedClientCommit → resumeAuthorizedEvaluation
  → audit CLIENT_COMMIT_ALLOWED → commit_allowed
  → Client DML (unreported)
```

| Proof | Mechanism |
|-------|-----------|
| Machine decision | `policy_evaluations.decision` |
| Human authorization | `human_resolution` + resolve audit |
| Resume | `execution.status=RESUMED` + resume audit id |
| Client commit authorization | `commit_allowed` + `CLIENT_COMMIT_ALLOWED` |
| Actual execution | **Missing** |

Approver (`resolved_by`) is distinct from end-user (`subject.user_id`) when clients send distinct identities (demo often uses a fixed `user_clinician` — operational hygiene, not architecture failure).

---

## 9. `policy_evaluations` mutation analysis

Update paths (`pg-repository.ts`):

| Mutation | Category |
|----------|----------|
| Initial insert of machine `decision`, policies, explanation, restrictions | Immutable historical fact (intended) |
| `ON CONFLICT DO UPDATE` refreshing decision/explanation fields | **Potentially dangerous** if it rewrites machine Decision; mitigated by product intent but schema allows upsert |
| `human_resolution` UPDATE | Legitimate lifecycle state |
| `held_request` attach | Legitimate lifecycle |
| `execution` UPDATE (resume states) | Execution lifecycle state |

**Auditor risk:** Reading only the current row shows latest lifecycle overlay. Machine `decision` is supposed to stay REVIEW while `human_resolution` / `execution` advance — **confirm in ops that upsert never changes machine decision after first write**. Cleanest Phase 4 direction: **append-only evaluation lifecycle events** (or versioned evaluation evidence) while keeping a current projection row for UI.

---

## 10. Existing lifecycle mechanisms (strongest base for Phase 4)

| Concept | Exists as |
|---------|-----------|
| EVALUATED / DECIDED | `policy_evaluations` + explanation |
| REVIEW_REQUESTED | machine `REVIEW` + `held_request` |
| AUTHORIZED (human) | `human_resolution` |
| RESUMED | `execution` |
| ENFORCED (Gateway authz) | `audit_events` (`CLIENT_COMMIT_ALLOWED` / BLOCK) |
| EXECUTION_* / OUTCOME_RECORDED | **Do not exist** |

**Strongest Phase 4 base:** existing **append-only `audit_events` hash chain** (+ Decision binding), not a new ledger. Outcome reports should become sealed audit events (and optionally a thin Outcome index table for query).

---

## 11–12. Recommended Phase 4 architecture & Outcome semantics

Preferred conceptual model (aligned with product language):

```text
Policy Evaluation → Decision → Consequence → Enforcement → Execution → Outcome
```

**Recommended shape (minimum):**

| Layer | Implementation choice |
|-------|------------------------|
| Decision | Keep `policy_evaluations` |
| Consequence | Keep derived projection |
| Enforcement | Keep audit-observed + projection; optionally stamp status codes on authz audit |
| Execution / Outcome | **New:** client Outcome receipt → sealed audit event(s) keyed by `evaluation_id` + `execution_id` |

### Semantics actually necessary (client-commit)

| Status | Needed? | Meaning |
|--------|---------|---------|
| `AUTHORIZED` | Already (authz) | Enigma permitted commit |
| `BLOCKED` | Already | Enigma denied / blocked |
| `HELD_FOR_APPROVAL` | Already (REVIEW) | Waiting human |
| `EXECUTION_STARTED` | Optional | Client began DML (nice-to-have) |
| `EXECUTED` / `SUCCESS` | **Yes** | Client reports successful external commit |
| `EXECUTION_FAILED` | **Yes** | Client reports failure before/at commit |
| `EXECUTION_TIMEOUT` | **Yes** | Client uncertainty / timeout |
| `EXECUTION_UNKNOWN` | **Yes** | Explicit unknown (better than silence) |
| `PARTIALLY_EXECUTED` | Later | Multi-step writes |

Keep:

```text
Decision ≠ Enforcement ≠ Execution ≠ Outcome
```

---

## 13. External system boundary (protocol sketch — not implemented)

```text
Client → Enigma /v1/ai/actions → commit_allowed
Client executes
Client → Enigma Outcome API (new) → sealed Outcome audit
```

| Question | Recommendation |
|----------|----------------|
| Callback needed? | Prefer **client-initiated report** (pull/push from client), not Enigma calling Salesforce |
| Second API? | **Yes** — e.g. `POST /v1/ai/outcomes` or `/v1/ai/actions/:evaluation_id/outcome` (authz with same app key) |
| Reuse `/actions`? | Possible but conflates authz with outcome; separate is clearer |
| Client `execution_id`? | **Required** for idempotency |
| Retries | Same `execution_id` + same result → idempotent success |
| Duplicates / conflicts | Same id + different result → `OUTCOME_CONFLICT` (append conflict evidence; do not silently overwrite) |

---

## 14. Failure scenarios — what Enigma can prove

| Case | Enigma can prove today |
|------|------------------------|
| **A** Authz + client success | Authz only — **not** success |
| **B** Authz + client fails before DML | Authz only — failure invisible |
| **C** Authz + timeout / uncertain DML | Authz only |
| **D** Authz + DML ok + client dies before report | Authz only (same as A from Enigma’s view) |
| **E** REVIEW → AUTHORIZE → resume → success | Decision + human + resume + authz — **not** DML success |
| **F** DENY + client writes anyway | Enigma DENY/block audit — **not** detective proof of illicit DML |

---

## 15. Idempotency (recommendation)

```text
evaluation_id + execution_id  →  unique Outcome identity
```

- Second identical `EXECUTED` → idempotent OK  
- `EXECUTED` then `EXECUTION_FAILED` (or reverse) → **conflict record**; retain both append-only; surface `OUTCOME_CONFLICT` for auditors  

Existing architecture already patterns this via anchors (`ANCHOR_CONFLICT` / no overwrite).

---

## 16. Enforcement as evidence

Desired future clarity:

```text
Decision: ALLOW_WITH_CONTROLS
Enforcement: CONTROLS_APPLIED | ALLOWED (authz audit)
Execution: EXECUTED | FAILED (client report)
Outcome: SUCCESS | EXECUTION_FAILED
```

Today: Decision + authz audit exist; Execution/Outcome do not. Enforcement status is projected. **Phase 4 priority is Outcome receipt**; enforcement hardening is secondary.

---

## 17. Full-chain verification implication

Outcome/enforcement facts should:

- Remain under the **existing audit HMAC chain** and Phase 3B checkpoints  
- Appear in evidence export as audit events (and Decision refs)  
- **Not** require new crypto primitives for Phase 4  

Independent public-key verify continues to cover **checkpoints/anchors**; full event authenticity still needs HMAC unless a later phase adds asymmetric event seals.

---

## 18. Reconstruction exercises

### Scenario 1 — Low-risk phone update

```text
ALLOW → commit_allowed → SF update Patient__c
```

**Auditor today:** Decision, context, authz audit, optional checkpoint/anchor. **Cannot prove** phone field changed.

### Scenario 2 — Clinical note REVIEW

```text
REVIEW → AUTHORIZE → resume → commit_allowed → insert Clinical_Note__c
```

**Auditor today:** Full human lifecycle + authz. **Cannot prove** note row exists.

### Scenario 3 — Prohibited transmit DENY

```text
DENY → Gateway block audit
```

**Auditor today:** Strong for “Enigma blocked.” **Cannot prove** client did not bypass (out of band).

---

## 19. Gap matrix

| Capability | Current State | Evidence Source | Confidence | Gap | Recommended Direction |
|------------|---------------|-----------------|------------|-----|------------------------|
| Decision | First-class | `policy_evaluations` | **STRONG** | Mutable lifecycle overlay | Append-only Decision history later |
| Consequence | Derived | `deriveDecisionConsequence` | **ADEQUATE** | Not stored | Keep derived |
| Enforcement | Projected from audit | `audit_events` + projection | **ADEQUATE** | `UNKNOWN` on join miss | Stamp/join harden; optional sealed status |
| Execution authorization | `commit_allowed` | HTTP + audit | **STRONG** | Confused with Outcome | Keep name; document boundary |
| Execution attempt | Client-only | Apex try | **GAP** | Not reported | Optional `EXECUTION_STARTED` |
| Execution result | Client-only | Apex COMPLETED/ERROR | **GAP** | Not in Enigma | Outcome receipt API |
| Outcome | Missing | — | **GAP** | First-class missing | Append-only Outcome events |
| Human approval | Additive JSON + audit | `human_resolution` | **STRONG** | Approver role soft | Keep; optional role field later |
| Model execution | N/A on WRITE | — | **PARTIAL** | Expected for completions only | `not_applicable` OK |
| Audit correlation | Soft ids | `request_id` / `evaluation_id` | **ADEQUATE** | No FK | Prefer eval id + execution id |
| Checkpoint | Phase 3B | checkpoints | **STRONG** | Leftovers until time/manual | Keep defaults |
| External anchor | Phase 2/3A | anchors | **STRONG** | Optional config | Keep async |

---

## 20. Recommended Phase 4 (smallest coherent path)

Move from:

> “Enigma authorized the action”

to:

> “Enigma governed the action and can prove what the client reported as ultimately happened.”

### Implement first (ordered)

1. **Outcome receipt API** (app-authenticated) accepting `evaluation_id`, `execution_id`, result enum, optional external record id / error, timestamp.  
2. **Persist as sealed `audit_events`** (reason codes like `CLIENT_EXECUTION_SUCCEEDED` / `FAILED` / `TIMEOUT` / `UNKNOWN`) with Decision binding.  
3. **Idempotency + conflict** on `(evaluation_id, execution_id)`.  
4. **Update Salesforce demo** to report after DML (success and failure).  
5. **Admin UI / Decision detail** — show Outcome alongside projected Enforcement (do not rename Audit nav).  
6. **Evidence export** — include Outcome audit events (and later Decision snapshots).  
7. **Harden enforcement projection** / optional sealed enforcement status on authz audits.  
8. **Decision lifecycle append-only** (if mutation risk remains).  

### Explicitly defer

Azure, KMS/HSM, Merkle, blockchain, new PDP, new audit ledger, automatic full evidence archival.

### Addresses checklist

| Concern | How |
|---------|-----|
| 1. Enforcement evidence | Observed audit + optional stamped status |
| 2. Execution evidence | Client Outcome reports |
| 3. First-class Outcome | Receipt + sealed audit (+ thin index if needed) |
| 4. Human approval | Unchanged; Outcome attaches after resume/authz |
| 5. Correlation | `evaluation_id` + `execution_id` (+ `request_id`) |
| 6. Idempotency | Unique execution id; conflict append |
| 7. Historical integrity | Append-only Outcome audits; don’t overwrite Decision |
| 8. Audit/checkpoint | Same chain / Phase 3B worker |
| 9. Independent verification | Same as today (HMAC for events; public key for checkpoints/anchors) |

---

## Architectural invariant (unchanged)

```text
Policy decides.
Gateway enforces.
Audit records.
Checkpoint seals.
Anchor preserves.
Customer storage retains.
```

Phase 4 should only add: **Client reports Outcome → Audit records Outcome** — still off the synchronous policy-decision path for AI completions, and never a prerequisite for PDP authorization itself (report after the fact; authz remains independent).
