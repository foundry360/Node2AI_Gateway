# Phase 4 Implementation Evaluation

**Nature:** Inspection-only (no code, schema, test, UI, or config changes)  
**Evaluated against:** `EVIDENCE_ARCHITECTURE_REVIEW.md`, `PHASE_4_ENFORCEMENT_OUTCOME_GAP_ANALYSIS.md`, `PHASE_4_ENFORCEMENT_OUTCOME.md`, Audit Integrity Phases 1–3B, and traced runtime code  
**Primary implementation:** `GatewayOrchestrator.reportActionOutcome`, `action_outcomes`, Salesforce demo client (contract only)

Evidence labels used below:

| Label | Meaning |
|-------|---------|
| **Confirmed by code** | Directly observed in implementation |
| **Inferred** | Logical consequence of confirmed behavior; not separately tested |
| **Not demonstrated** | Claimed or desirable, but not shown by code path or tests |

---

## Executive Verdict

**PASS WITH MATERIAL FINDINGS**

Phase 4 correctly closes the core evidence gap identified in the architecture review: Enigma can now preserve **client-reported** downstream execution results as first-class append-only audit evidence, bound to prior `CLIENT_COMMIT_ALLOWED`, without redesigning EPA/PDP or creating a second ledger.

The architecture and trust-boundary language are substantially correct. Material findings remain around **concurrent race handling** (audit sealed before projection insert), **optional/weak action-context binding**, and **projection-table integrity controls** that are weaker than Phases 1–3B append-only tables.

---

## 1. Architecture

**Is the Phase 4 architecture correct?**

**Mostly yes — Confirmed by code.**

| Layer | Representation | Collapsed? |
|-------|----------------|------------|
| Decision | `policy_evaluations.decision` (immutable machine) | No |
| Human resolution | `human_resolution` additive | No |
| Enforcement | Existing audit `CLIENT_COMMIT_ALLOWED` + projection | No new Enforcement table (intentional) |
| Execution | Client `execution_id` | Distinct identifier |
| Outcome | Audit `action.outcome` + `action_outcomes` projection | Distinct statuses |
| Evidence | Existing `IntegrityAuditService.record` | Same chain |

Runtime / API / UI / docs preserve `Decision ≠ Enforcement ≠ Execution ≠ Outcome` in the happy path.

**Soft collapses (not fatal):**

- Outcome audit reason codes re-stamp `CLIENT_COMMIT_ALLOWED` alongside `CLIENT_OUTCOME_*` (**Confirmed by code** in `reportActionOutcome`) — correlative, not a Decision overwrite.
- Admin UI nests client outcome under both `outcome` and `execution.client` (**Confirmed by code**) — dual presentation, same projection source.
- Enforcement remains projected, not a first-class table — consistent with gap analysis; not an Outcome collapse.

---

## 2. Security

**Can an unauthorized client forge or misbind an Outcome?**

**Unauthenticated forge: No — Confirmed by code.** Missing/invalid API key → `401 UNAUTHORIZED`.

**Cross-application forge: Largely prevented — Confirmed by code.**

1. `body.application_id` must match authenticated application.  
2. Authz audit `application_id` must match.  
3. Evaluation subject / held application (when present) must match.  
4. Prior `CLIENT_COMMIT_ALLOWED` for that `evaluation_id` is required.

Wrong-application test exists and rejects (**Confirmed by code** + test).

**Cross-evaluation attach without authz: Prevented — Confirmed by code.** No `CLIENT_COMMIT_ALLOWED` for the evaluation → `403 OUTCOME_NOT_AUTHORIZED`.

**DENY → EXECUTED: Prevented — Confirmed by code.** Explicit `DENY` reject + authz-audit requirement (defense in depth).

**Residual misbind risk (authorized application, same evaluation):**

- `action`, `agent_id`, `tool_id` checks run **only if the client supplies them**. Omitting them skips mismatch checks (**Confirmed by code**).
- `user`, `purpose`, `authorization_context`, `operation`, and `action.attributes` (e.g. field) are **not** validated against the authorized hold/authz audit (**Confirmed by code**).
- Therefore an authorized app that already holds `CLIENT_COMMIT_ALLOWED` for evaluation E can report `EXECUTED` with stripped context. That is not cross-evaluation injection, but it weakens forensic action-binding.

**Severity:** MEDIUM for context omission; not an open forge for other apps.

---

## 3. Integrity

**Does Outcome evidence correctly enter the existing cryptographic audit chain?**

**Yes for accepted receipts — Confirmed by code.**

Path:

```text
reportActionOutcome
  → writeAudit → withDecisionBinding
  → IntegrityAuditService.record
  → canonicalization / SHA-256 / HMAC / sequence / prev hash
  → inner audit_events append
  → Phase 3B checkpoint thresholds (same service)
  → Phase 2/3A anchoring (same lifecycle worker)
```

No parallel Outcome ledger, second hash chain, or Outcome-specific crypto (**Confirmed by code**).

**Nuances:**

| Fact | In event hash / HMAC? | Where stored |
|------|------------------------|--------------|
| Outcome status | Partially via `reason_codes` (`CLIENT_OUTCOME_EXECUTED`, …) | reason_codes + metadata |
| `evaluation_id` | Yes (top-level after binding) | evaluation_id |
| `execution_id` | **No** | metadata only |
| `evidence_class` | No | metadata |

This matches pre-existing audit metadata patterns (**Confirmed by code** in `canonicalEventPayload`). Outcome **events** are cryptographically equivalent to other operational audits; the **execution_id string itself** is not a canonical hashed field.

**Race integrity caveat:** see §5 / Findings — concurrent losers can leave extra `CLIENT_OUTCOME_RECEIPT` events that are not the projection winner.

---

## 4. Correlation

**Can Enigma reliably connect `evaluation_id → execution_id → outcome`?**

| Direction | Mechanism | Confidence |
|-----------|-----------|------------|
| `evaluation_id` → Outcome | `action_outcomes` by evaluation + admin detail API | **STRONG** — Confirmed by code |
| `evaluation_id` → Enforcement | `findClientCommitAllowedAudit` / enforcement projection | **ADEQUATE** — Confirmed by code |
| `execution_id` → Outcome row | PK lookup in `action_outcomes` | **STRONG** at DB — Confirmed by code |
| `execution_id` → Admin UI | No dedicated admin route by `execution_id` | **PARTIAL** — Not demonstrated in API/UI |
| Export reconstruction | Sanitized metadata includes `execution_id`, `outcome`, `evaluation_id` | **ADEQUATE** — Confirmed by code |

Binding of Outcome to authorization uses sealed `CLIENT_COMMIT_ALLOWED` for the same `evaluation_id` (**Confirmed by code**), not mere evaluation existence.

**Orphan risk:** If audit write succeeds and projection insert fails, a receipt audit may exist without `action_outcomes` row (**Inferred** from write-before-insert ordering). Client retry may create a second receipt audit.

---

## 5. Idempotency

**Are duplicate and conflicting receipts handled correctly under concurrency?**

### Single-threaded / sequential (Confirmed by code + tests)

| Case | Behavior |
|------|----------|
| Same `execution_id` + identical receipt hash | `200` `idempotent` |
| Same `execution_id` + different outcome | `409 OUTCOME_CONFLICT`; projection untouched; conflict audit appended |
| Projection insert | `ON CONFLICT (execution_id) DO NOTHING` (Postgres) / Map check (memory) — never overwrites |

### Concurrent (Confirmed by code; **Not demonstrated** by tests)

Happy-path order:

1. `getByExecutionId`  
2. If absent → **`writeAudit(RECEIPT)`**  
3. Then `insertIfAbsent`

**Case A — identical concurrent receipts:** Both may pass step 1, both seal RECEIPT audits, one wins insert; loser returns idempotent pointing at winner’s `audit_id`. **Extra RECEIPT audit remains in the chain** (orphan relative to projection).

**Case B — conflicting concurrent outcomes:** Both may seal **RECEIPT** audits for different outcomes; one projection wins; loser hits insert conflict and returns `409` **without** going through the dedicated conflict-audit branch (that branch only runs when `existing` was found **before** write). Result: chain can contain two `CLIENT_OUTCOME_RECEIPT` events disagreeing on outcome while projection stores only the winner.

**Case C — same execution_id, different evaluation_ids:** Receipt hashes differ (hash includes `evaluation_id`) → conflict / insert loss. Second evaluation cannot claim that `execution_id` (**Confirmed by code**). Globally unique `execution_id` is enforced.

**Case D — different applications:** Application mismatch rejects before insert if authz/eval binding fails; if somehow same `execution_id` reused after App A stored it, App B gets conflict/idempotency against App A’s row (**Inferred**).

**Case E — race:** Correctness for unique projection depends on DB unique PK; correctness for **single RECEIPT audit** does **not** — application-level check-then-act is not transactional with audit seal.

**Verdict:** Sequential idempotency/conflict semantics match the desired model. **Under concurrency, silent projection overwrite is prevented, but silent dual RECEIPT audits are possible.** Material finding.

---

## 6. Evidence Reconstruction

**Given `evaluation_id`:** An operator can load Decision detail and obtain Decision, human resolution, enforcement projection, client outcome (if reported), and open linked audit events (**Confirmed by code**). Checkpoint/anchor for a specific outcome audit follow existing Phase 1–3B admin audit detail paths (**Inferred** from unchanged integrity service).

**Given only `execution_id`:** Reconstructible from `action_outcomes` or export metadata (**Confirmed by code** at storage/export layer). **Not demonstrated** as a first-class Admin API/UI lookup.

**Authz without report:** Remains `CLIENT_COMMIT_ALLOWED` + `NOT_REPORTED` — does not fabricate success (**Confirmed by code** + test).

---

## 7. Checkpoint / Anchor

**Does Outcome participate correctly in Phase 1–3B evidence preservation?**

**Yes — Confirmed by code.** Outcomes call the same `IntegrityAuditService.record`; no bypass of sequence/checkpoint/anchor lifecycle.

They can be delayed by the same Phase 3B thresholds/time/catch-up rules as any other event (**Inferred**). Unit test verifies chain seal and sequence presence; full anchor participation for Outcome specifically is **Not demonstrated** beyond shared infrastructure.

---

## 8. Human Approval

**Does Phase 4 preserve machine decision / human resolution distinction?**

**Yes — Confirmed by code** + test:

```text
machine_decision = REVIEW (unchanged)
human_resolution = AUTHORIZE
resume → CLIENT_COMMIT_ALLOWED
outcome = EXECUTED (additive)
```

`reportActionOutcome` does not call `saveHumanResolution` or mutate `decision`. Resume single-use (`ALREADY_RESUMED`) remains upstream of Outcome.

---

## 9. Client Trust Boundary

**Is client-reported evidence correctly distinguished from independent verification?**

**Yes in core surfaces — Confirmed by code / docs.**

| Surface | Representation |
|---------|----------------|
| API | `evidence_class: "client_reported"` |
| Audit metadata | `evidence_class`, `client_outcome_report` |
| UI | “Client-reported… Not independent verification…” |
| Docs | Explicit limitation language |

Does **not** claim Enigma verified Salesforce DML (**Confirmed**). Remaining limitation is inherent: trust the authorized client’s report.

---

## 10. Salesforce

**Does the reference integration correctly consume the generic Outcome contract without contaminating Enigma?**

**Yes as a client — Confirmed by code** in `EnigmaGatewayService.cls`:

```text
commit_allowed → newExecutionId() → DML → OutcomeReportQueueable → POST /v1/ai/actions/outcome
```

| Topic | Assessment |
|-------|------------|
| Generic API | Correct fields; not Salesforce-specific on Gateway |
| execution_id | Generated before DML; passed through Queueable |
| Success/failure | `EXECUTED` / `EXECUTION_FAILED` |
| Queueable gap | DML success + failed enqueue/delivery → Enigma stays `NOT_REPORTED` (correct honesty) |
| Retry | Queueable HTTP failure is not auto-retried with same id in code reviewed — operational gap for the **demo client**, not Gateway architecture |

Salesforce is not part of core Enigma architecture (**Confirmed** — demo package only).

---

## Lifecycle trace (Agent WRITE)

**Confirmed by code:**

```text
POST /v1/ai/actions
  → authenticateApiKey
  → policy.evaluateRequest → policy_evaluations
  → (REVIEW) hold / human AUTHORIZE / resume_evaluation_id
  → writeAudit(CLIENT_COMMIT_ALLOWED) + HTTP commit_allowed
  → [client] execution_id
  → [client] downstream DML
  → POST /v1/ai/actions/outcome
      → require CLIENT_COMMIT_ALLOWED audit for evaluation_id
      → writeAudit(CLIENT_OUTCOME_*)
      → action_outcomes insertIfAbsent
  → IntegrityAuditService sequence/hash/HMAC
  → Phase 3B checkpoint / Phase 2–3A anchor (shared path)
```

Identifiers: `evaluation_id`, `request_id`, `execution_id`, `audit_id`, `application_id`, optional agent/tool/action.

---

## 11. Findings

| Severity | Finding | Evidence | Recommendation |
| -------- | ------- | -------- | -------------- |
| **HIGH** | Concurrent conflicting receipts can each seal a `CLIENT_OUTCOME_RECEIPT` before unique insert; projection keeps one winner; chain may show disagreeing receipts without the pre-insert conflict-audit path | `reportActionOutcome` writes audit before `insertIfAbsent`; race branch returns 409 without conflict-audit write | Phase 4.1: insert/claim projection first (or transactional advisory lock), then seal exactly one RECEIPT; seal CONFLICT only for losers |
| **MEDIUM** | Identical concurrent receipts can create duplicate RECEIPT audits; idempotent response cites winner’s `audit_id` only | Same write-before-insert ordering | Claim `execution_id` before audit; or detect duplicate RECEIPTs in verify tooling |
| **MEDIUM** | Action/agent/tool binding is optional (omit fields → skip checks); user/purpose/authz context/attributes not bound | Conditional checks in `reportActionOutcome`; schema makes fields optional | Require action kind (+ target when present on authz); bind user when held_request exists |
| **MEDIUM** | `action_outcomes` has no append-only triggers / no FK to evaluations or audit events; UPDATE/DELETE possible with DB credentials | `migrate-action-outcome-phase4.sql` vs audit_events forbid triggers | Add forbid UPDATE/DELETE triggers; optional FK or integrity job |
| **MEDIUM** | `execution_id` lives in metadata, not canonical event hash fields | `canonicalEventPayload` vs outcome metadata | Accept as Phase 1 pattern, or promote `execution_id` into a hashed extension later |
| **LOW** | `audit.list()` full scan to find `CLIENT_COMMIT_ALLOWED` | `findClientCommitAllowedAudit` | Index/query by evaluation_id + reason code at scale |
| **LOW** | Multiple outcomes per evaluation possible; UI shows latest only | `getLatestByEvaluationId` | Surface outcome history if multi-attempt becomes real |
| **LOW** | Salesforce Queueable: enqueue/HTTP failure → lasting `NOT_REPORTED` despite local COMPLETED | Apex best-effort catch; no retry loop observed | Client-side durable retry with same `execution_id` (client concern) |
| **INFORMATIONAL** | No Admin API to resolve by `execution_id` alone | Routes inspected | Optional lookup endpoint for auditors |
| **INFORMATIONAL** | Re-stamping `CLIENT_COMMIT_ALLOWED` on Outcome reason_codes | Outcome audit write | Document as correlation aid; avoid treating as second enforcement |

---

## 12. Missing Tests

Phase 4 suite `audit-outcome-phase4.test.ts` is **12/12** for covered cases. Important gaps (**Not demonstrated**):

- Concurrent identical receipts  
- Concurrent conflicting receipts  
- Same `execution_id` across two evaluations  
- Cross-evaluation injection with valid authz on another eval  
- Omitted action context (should document current allow/deny policy)  
- User mismatch vs held_request  
- Attribute/field substitution  
- `EXECUTION_TIMEOUT` path  
- Audit-success / projection-failure orphan + retry  
- Conflict audit presence and chain linkage  
- Explicit checkpoint covering Outcome sequence_end  
- Explicit external anchor for Outcome-bearing checkpoint  
- Evidence export package contains Outcome metadata end-to-end  
- REQUIRE_APPROVAL / REVIEW-without-resume cannot report  
- Malformed / oversize `execution_id`

---

## 13. Remaining Limitations

### Architectural

- Outcome remains **client-reported**, not independent verification of external systems.  
- Enforcement remains projected from audit (by design).  
- Full event authenticity still requires appliance HMAC key (Phase 1–3B unchanged).

### Implementation

- Write-before-insert race (material).  
- Optional context binding.  
- Projection table lacks append-only DB guards.  
- `execution_id` not in canonical hash payload.

### Operational

- Authz-without-report stays `NOT_REPORTED` until client delivers receipt.  
- Large audit scans for authz lookup.  
- Demo Queueable delivery failures.

### Client trust

- Compromised authorized application API key can still assert false `EXECUTED` for evaluations it was allowed to commit — inherent to the model; mitigated by binding to `CLIENT_COMMIT_ALLOWED`, not eliminated.

---

## 14. Recommended Next Step

**Phase 4.1 hardening required**

Do **not** start Phase 5 architecture. Prefer a focused hardening pass:

1. Make Outcome acceptance concurrency-safe (claim `execution_id` before sealing RECEIPT; single RECEIPT winner).  
2. Tighten mandatory action-context binding for client-commit evaluations.  
3. Add append-only protections on `action_outcomes`.  
4. Add concurrent + orphan + export/anchor coverage tests.

---

## Answers to evaluation questions (summary)

| # | Question | Answer |
|---|----------|--------|
| 1 | Architecture correct? | **Yes, with soft presentation dual-paths; core invariant held** |
| 2 | Unauthorized forge/misbind? | **Cross-app/DENY blocked; same-app weak context omission remains** |
| 3 | Integrity chain? | **Yes via existing audit service; race can duplicate RECEIPTs** |
| 4 | Correlation? | **Strong via evaluation_id; execution_id strong in DB/export, weak in Admin UI** |
| 5 | Idempotency under concurrency? | **Projection safe; audit multiplicity not safe** |
| 6 | Reconstruction? | **Yes from evaluation_id; partial from execution_id alone** |
| 7 | Checkpoint/anchor? | **Participates via shared Phase 1–3B path** |
| 8 | Human approval? | **Preserved** |
| 9 | Client trust boundary? | **Correctly stated** |
| 10 | Salesforce? | **Valid generic client; Queueable delivery gap is client-side** |

---

## Product-level evaluation

Phase 4 **materially strengthens** the claim:

> Enigma governs AI actions from policy to proof.

Enigma can now credibly demonstrate:

```text
Policy → Decision → Enforcement → (client) Execution → (client-reported) Outcome → Evidence
```

**What Enigma can prove (Confirmed by code):**

- Policy evaluated and Decision recorded.  
- Gateway authorized client commit (`CLIENT_COMMIT_ALLOWED`) or blocked.  
- Human AUTHORIZE/resume when applicable.  
- Authorized client submitted Outcome receipt X for `execution_id` Y (when reported).  
- That receipt was sealed into the audit chain (subject to race caveats above).

**What remains client-reported / unproven independently:**

- That Salesforce (or any external system) actually committed.  
- Completeness if the client never reports (`NOT_REPORTED`).

That distinction is the correct Phase 4 boundary.
