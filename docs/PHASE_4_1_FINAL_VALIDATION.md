# Phase 4.1 Final Validation

**Nature:** Inspection-only (no code, schema, test, UI, or config changes)  
**Inputs:** `PHASE_4_IMPLEMENTATION_EVALUATION.md`, `PHASE_4_1_HARDENING.md`, `PHASE_4_ENFORCEMENT_OUTCOME.md`, `EVIDENCE_ARCHITECTURE_REVIEW.md`, traced runtime code  
**Evidence labels:** **Confirmed by code** · **Confirmed by database/schema** · **Confirmed by tests** · **Inferred** · **Not demonstrated**

---

## Executive Verdict

**PASS WITH MINOR FINDINGS**

Phase 4.1 resolves the three material Phase 4 findings on the **production PostgreSQL path**. The Enforcement → Execution → Outcome → Evidence workstream is complete for intended appliance deployment.

Remaining items are minor: multi-process Postgres concurrency is proven by schema/code but not by an integration test that hits Postgres; evidence export distinguishes receipt vs conflict via `operation` / reason codes but omits the `authoritative` metadata flag; in-memory outcome store remains weaker if misused for multi-instance deployments without Postgres.

---

## Phase 4 Findings Resolution

| Finding | Resolution |
|---------|------------|
| **HIGH** — Competing `CLIENT_OUTCOME_RECEIPT` before claim | **RESOLVED** |
| **MEDIUM** — Optional context binding | **RESOLVED** |
| **MEDIUM** — `action_outcomes` lacks append-only protection | **RESOLVED** (Postgres / schema); in-memory has no DB triggers by nature |

### Finding 1 — Concurrent competing RECEIPTs (HIGH)

| | |
|--|--|
| **Previous behavior** | Audit RECEIPT sealed before `insertIfAbsent`; races could leave multiple authoritative-looking receipts |
| **Current implementation** | Validate → derive context → pre-allocate `audit_id` → `claimAuthoritative` → **only winner** seals `CLIENT_OUTCOME_RECEIPT`; losers identical → idempotent; different → `CLIENT_OUTCOME_CONFLICT` only |
| **Evidence** | **Confirmed by code** `reportActionOutcome` claim-before-seal; **Confirmed by database/schema** `PRIMARY KEY (deployment_id, execution_id)` + `ON CONFLICT DO NOTHING`; **Confirmed by tests** concurrent identical/conflict in `audit-outcome-phase4.1.test.ts` (in-memory Gateway) |
| **Resolved** | **YES** |
| **Remaining concern** | Concurrent Gateway tests use in-memory store, not live Postgres multi-process (**Not demonstrated**). Postgres path is correct by construction; optional integration test would close the proof gap. |

### Finding 2 — Optional context binding (MEDIUM)

| | |
|--|--|
| **Previous behavior** | Client could omit action/agent/tool and skip mismatch checks |
| **Current implementation** | `deriveAuthorizedOutcomeContext` + receipt hash from **server-derived** fields; client assertions compared when present; omission uses server values |
| **Evidence** | **Confirmed by code** `outcome.ts` / `reportActionOutcome`; **Confirmed by tests** omit-binds + mismatch matrix |
| **Resolved** | **YES** |
| **Remaining concern** | Only `attributes.field` among action attributes is bound; other attribute keys are not compared (**Confirmed by code**). Residual LOW if authorization only used `field`. |

### Finding 3 — Projection append-only (MEDIUM)

| | |
|--|--|
| **Previous behavior** | `action_outcomes` uniquely keyed but UPDATEable |
| **Current implementation** | Triggers forbid UPDATE/DELETE/TRUNCATE; deployment-scoped PK |
| **Evidence** | **Confirmed by database/schema** `schema.sql` + `migrate-action-outcome-phase4.1.sql`; **Confirmed by tests** only when `DATABASE_URL` set (`it.skipIf`) — often **Not demonstrated** in memory-only CI |
| **Resolved** | **YES** (for migrated Postgres) |
| **Remaining concern** | Migration must be applied on existing volumes; memory mode has no SQL triggers. |

---

## 1. Architectural invariant

**Confirmed by code** that layers remain distinct:

| Layer | Source |
|-------|--------|
| Decision | `policy_evaluations.decision` (immutable machine) |
| Human resolution | `human_resolution` additive |
| Enforcement | Authz audit `CLIENT_COMMIT_ALLOWED` (outcome events excluded from lookup) |
| Execution claim | `action_outcomes` `(deployment_id, execution_id)` |
| Outcome | Client status + sealed RECEIPT / CONFLICT |
| Evidence | `IntegrityAuditService.record` → Phase 1–3B checkpoint/anchor |

Lifecycle:

```text
Policy Evaluation → Decision → Consequence → Enforcement
  → Execution Claim → Outcome Receipt → Audit → Checkpoint → Anchor
```

Primary paths: `POST /v1/ai/actions` → `claimAuthorizedClientCommit` / ALLOW path → `CLIENT_COMMIT_ALLOWED`; `POST /v1/ai/actions/outcome` → `reportActionOutcome`.

---

## 2–4. Concurrency & multi-process (PostgreSQL)

**Confirmed by database/schema:** unique `(deployment_id, execution_id)`.  
**Confirmed by code:** `PostgresActionOutcomeStore.claimAuthoritative` uses `INSERT … ON CONFLICT (deployment_id, execution_id) DO NOTHING RETURNING *`.

Correctness for **multiple Gateway processes sharing Postgres** does **not** depend on JS locks or in-memory Maps for the claim. Process-local `auditWriteTail` only serializes HMAC chain writes **within one process** (**Confirmed by code**).

| Case | Expected | Assessment |
|------|----------|------------|
| A — identical concurrent | One claim, one RECEIPT, others idempotent | **Confirmed by code**; **Confirmed by tests** (in-memory); Postgres multi-process **Inferred** from `ON CONFLICT` |
| B — conflicting concurrent | One claim/RECEIPT; others 409 + CONFLICT | Same |

**Concurrency Assessment:** Safe across multiple Gateway processes **when PostgreSQL is the outcome store**.

---

## 5. In-memory fallback

| Question | Answer |
|----------|--------|
| When used? | `createPhase1Gateway` / appliance without `databaseUrl`; tests (**Confirmed by code**) |
| When Postgres? | `options.db` / appliance with `DATABASE_URL` → `PostgresActionOutcomeStore` |
| Production multi-instance on memory Maps? | Would disagree — **weaker than Postgres** |
| Acceptable? | **Yes as test/dev fallback**; **operational limitation** if multi-instance memory is used in production |

Not a material integrity issue for intended Postgres appliance mode.

---

## 6. Audit ordering

**Confirmed by code:**

```text
authn → DENY/CLIENT_COMMIT_ALLOWED checks → derive/bind → receipt hash
  → get existing OR claimAuthoritative
  → (winner only) writeAudit(CLIENT_OUTCOME_RECEIPT)
```

Losing claim never seals RECEIPT (**Confirmed by code** + **Confirmed by tests**).

---

## 7. Conflict evidence

**Confirmed by code:**

- `operation: action.outcome_conflict`
- reasons: `CLIENT_OUTCOME_CONFLICT` (+ attempted outcome code)
- `metadata.authoritative: false`
- No `CLIENT_OUTCOME_RECEIPT` on conflict path
- Projection never overwritten (`ON CONFLICT DO NOTHING` / Map claim)

**Confirmed by tests** concurrent conflict case.

---

## 8–9. Binding matrix

| Context field | Server-derived | Client supplied | Compared if both set | Security significance |
| ------------- | -------------- | --------------- | -------------------- | --------------------- |
| deployment_id | Yes (`resolveDeploymentId`) | No | N/A (claim key) | Isolation |
| application_id | Authn + eval/audit | Required | Yes (mismatch → 403) | High |
| evaluation_id | Path param / body | Required | Ownership + authz | High |
| execution_id | — | Required | Claim uniqueness | High |
| user_id | held / audit / subject | Optional | Yes | Medium |
| agent_id | held / ai / audit meta | Optional | Yes | High |
| tool_id | held / ai / audit meta | Optional | Yes | High |
| operation | held / audit / eval | Optional | Yes | High |
| purpose | held / eval.context | Optional | Yes if bound known | Medium |
| authorization_context | held / eval.context | Optional | Yes if bound known | Medium |
| action.kind | held/audit/ai action | Optional | Yes | High |
| target_id | same | Optional | Yes | High |
| action.field | `attributes.field` | Optional | Yes | High |
| other attributes | Not derived | Optional | **No** | Low residual |

**Binding Assessment:** Outcome receipts are **logically bound** to server-derived authorization context for the fields Enigma knows. Omission does not bypass (**Confirmed by code/tests**). Not a separate cryptographic binding of context beyond receipt hash + audit seal.

---

## 10. Projection integrity

**Confirmed by database/schema:** append-only triggers; PK `(deployment_id, execution_id)`.  
**Confirmed by code:** claim never overwrites.  
Still a **projection**, not a second ledger — cryptographic truth remains `audit_events` (**Confirmed by code/docs intent**).

---

## 11. Outcome state integrity

Statuses: `EXECUTED` | `EXECUTION_FAILED` | `EXECUTION_TIMEOUT` | `EXECUTION_UNKNOWN`.  
Different outcome after claim → `OUTCOME_CONFLICT`; original retained (**Confirmed by code/tests**).  
`CLIENT_COMMIT_ALLOWED` + `NOT_REPORTED` when no claim (**Confirmed by code/tests**). Authorization does not imply execution.

---

## 12–13. DENY / unauthorized / human resume

**Confirmed by code/tests:** DENY, no `CLIENT_COMMIT_ALLOWED`, wrong app, wrong eval rejected; REVIEW→AUTHORIZE→RESUME→EXECUTED preserves `machine_decision = REVIEW`.

---

## 14–15. Audit / checkpoint

**Confirmed by code:** Outcome uses `writeAudit` → `IntegrityAuditService.record` (same chain). No bypass of Phase 3B. Inclusion in checkpoints/anchors follows shared lifecycle (**Inferred**; shared path **Confirmed by code**).

---

## 16–17. Reconstruction & export

| From | Reconstruct |
|------|-------------|
| `evaluation_id` | Admin detail: decision, enforcement, outcome projection, linked audits (**Confirmed by code**) |
| `execution_id` | DB/store by `(deployment_id, execution_id)`; export metadata `execution_id` (**Confirmed by code**). Dedicated Admin lookup by execution_id alone **Not demonstrated** |

Export: top-level `operation`, `reason_codes`, sanitized metadata include `execution_id`, `outcome`, `evidence_class`, `enforcement`. `authoritative` / `deployment_id` **not** in sanitize allowlist (**Confirmed by code**) — receipt vs conflict still distinguishable via `operation` / `CLIENT_OUTCOME_RECEIPT` vs `CLIENT_OUTCOME_CONFLICT`.

---

## 18. Client trust boundary

**Confirmed by code/UI/docs:** `evidence_class: client_reported`; UI states client-reported, not independent verification. No overclaim of Salesforce verification observed.

---

## 19. Salesforce

Demo client only: `commit_allowed` → `execution_id` → DML → Queueable → Outcome API (**Confirmed by code**). Queueable failure → Enigma `NOT_REPORTED` despite local COMPLETED — **operational client gap**, not core architecture contamination.

---

## 20. Security threat model

| Attack | Result | Control | Evidence | Residual |
|--------|--------|---------|----------|----------|
| 1 Forge EXECUTED on DENY | Blocked | DENY + no authz audit | Code + tests | Low |
| 2 Other application’s evaluation | Blocked | App key + ownership | Code + tests | Low |
| 3 execution_id from other deployment | Isolated | PK includes `deployment_id` | Schema + in-memory test | Low |
| 4 Same execution_id, other evaluation | Second claim fails / conflict | Unique claim | Code | Medium ops (client must mint unique ids) |
| 5 Change target | Rejected if bound target known | TARGET_MISMATCH | Code + tests | Low if target was authorized |
| 6 Change tool | TOOL_MISMATCH | Code + tests | Low |
| 7 Change agent | AGENT_MISMATCH | Code + tests | Low |
| 8 Change action kind | ACTION_KIND_MISMATCH | Code + tests | Low |
| 9 Concurrent conflicting Outcomes | One winner; CONFLICT events | Claim + seal order | Code + in-memory tests | Postgres multi-process Not demonstrated in tests |
| 10 Modify projection via SQL UPDATE | Blocked by trigger | Schema | Schema; live PG test conditional | Apply migration |
| 11 Replay identical Outcome | Idempotent | receipt_hash | Code + tests | Low |
| 12 Outcome without CLIENT_COMMIT_ALLOWED | Blocked | Authz lookup | Code + tests | Low |

---

## 21. Test adequacy

| Invariant | Covered? |
|-----------|----------|
| Concurrent identical / conflicting | Yes (in-memory Gateway) |
| DB uniqueness / ON CONFLICT | Code + conditional PG test |
| Cross-app / eval / DENY / no authz | Yes |
| Cross-deployment claim isolation | In-memory store unit test |
| Tool/agent/op/action/target/field | Yes |
| Human resume preserves REVIEW | Yes |
| Projection mutation | Conditional on DATABASE_URL |
| Audit RECEIPT singularity under concurrency | Yes (in-memory) |
| Live multi-process Postgres race | **Not demonstrated** |
| Evidence export authoritative flag | **Not demonstrated** (flag not exported) |
| Checkpoint/anchor specifically for Outcome | Shared path only |

Test counts (12/12, 10/10, 909/909) are consistent with a green suite but do not by themselves prove multi-process Postgres races.

---

## 22. Regression

No evidence Phase 4.1 redesigned EPA/PDP, packs, model auth, or Phase 1–3B pathways. Outcome remains an extension of existing audit sealing (**Confirmed by code**; suite green **Confirmed by prior validation run**).

---

## 23. Production-readiness ratings

| Property | Rating |
|----------|--------|
| Authorization integrity | **STRONG** |
| Execution correlation | **STRONG** |
| Concurrency integrity (Postgres) | **STRONG** (design) / **ADEQUATE** (test proof) |
| Projection integrity | **STRONG** (with migration applied) |
| Audit integrity | **STRONG** |
| Evidence reconstruction | **ADEQUATE** |
| Trust-boundary accuracy | **STRONG** |

---

## Security Assessment

Unauthorized forge of `EXECUTED` against DENY / foreign app / missing authz is blocked server-side. Context substitution for known authorization fields is rejected. Concurrent conflicting submissions cannot replace the authoritative claim on the Postgres path. Residual risks are client honesty (inherent), unique `execution_id` hygiene, and migration/application of append-only triggers.

## Concurrency Assessment

**Yes — safe across multiple Gateway processes using PostgreSQL** as the outcome store, via unique `(deployment_id, execution_id)` and claim-before-RECEIPT. In-memory Maps are not multi-process safe.

## Binding Assessment

**Yes — logically bound** to server-derived authorization context for fields Enigma knows; omission cannot bypass. Not an additional asymmetric signature over context.

## Projection Assessment

**Yes — adequately protected** under Postgres with Phase 4.1 migration (append-only + unique claim). Remains a projection, not a second cryptographic ledger.

## Evidence Assessment

```text
Policy → Decision → Consequence → Enforcement
  → Execution claim → Outcome → Audit → Checkpoint → Anchor
```

is supported by the current implementation for governed client-commit writes.

## Test Adequacy

**ADEQUATE** for single-process and logical invariants; **PARTIAL** for multi-process Postgres race proof and unconditional append-only CI coverage.

## Remaining Limitations

### Technical
- Multi-process Postgres concurrency not covered by a dedicated integration test  
- Export omits `authoritative` / `deployment_id` metadata keys (still distinguishable via operation/reason codes)  
- Non-`field` action attributes unbound  

### Operational
- Phase 4.1 migration must be applied on existing DBs  
- Multi-instance memory mode must not be used as production Outcome authority  
- Client Queueable delivery gaps → `NOT_REPORTED`  

### Client trust

> Outcome remains client-reported execution evidence and is not independent verification of the downstream system.

---

## Required Follow-Up

**No Phase 4.1 implementation work is required for the Enforcement → Execution → Outcome evidence workstream to be considered complete on the intended PostgreSQL appliance path.**

Optional polish (not blockers):

1. Add a Postgres multi-connection concurrent claim integration test.  
2. Include `authoritative` (and optionally `deployment_id`) in evidence-export sanitize allowlist.  
3. Ensure CI applies `migrate-action-outcome-phase4.1.sql` where Postgres tests run.

Do **not** require Phase 5 architecture for these items.
