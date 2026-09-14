# Phase 4 — Enforcement, Execution, and Outcome Evidence

**Status:** Implemented (+ **Phase 4.1 hardening**)  
**Builds on:** Audit Integrity Phases 1–3B, [`EVIDENCE_ARCHITECTURE_REVIEW.md`](./EVIDENCE_ARCHITECTURE_REVIEW.md), [`PHASE_4_ENFORCEMENT_OUTCOME_GAP_ANALYSIS.md`](./PHASE_4_ENFORCEMENT_OUTCOME_GAP_ANALYSIS.md)  
**Hardening details:** [`PHASE_4_1_HARDENING.md`](./PHASE_4_1_HARDENING.md)

---

## Principle

```text
Decision ≠ Enforcement ≠ Execution ≠ Outcome
```

| Layer | Meaning |
|-------|---------|
| **Decision** | What Enigma’s policy engine decided (immutable machine decision) |
| **Enforcement** | What Gateway allowed, blocked, held, or transformed (e.g. `CLIENT_COMMIT_ALLOWED`) |
| **Execution** | What the authorized client attempted downstream (one `execution_id` per attempt) |
| **Outcome** | What the authorized client **reported** happened |

> **Outcome represents client-reported execution evidence. It does not constitute independent verification of the external system unless Enigma has an independent verification mechanism.**

Correct auditor language:

> Enigma authorized the action; the authorized client reported that execution succeeded.

Incorrect:

> Enigma verified Salesforce successfully committed the record.

---

## Evidence chain

```text
Policy Evaluation
    → Decision
    → Consequence
    → Enforcement (CLIENT_COMMIT_ALLOWED / BLOCKED / …)
    → Execution (execution_id)
    → Client Outcome Receipt
    → Outcome Audit Event (HMAC chain)
    → Checkpoint
    → External Anchor
```

Outcome events use the **existing** audit service, canonicalization, sequence allocation, hash chaining, checkpoints, and anchors. No second ledger.

---

## Outcome API

```http
POST /v1/ai/actions/outcome
Authorization: Bearer <application API key>
```

### Request

```json
{
  "application_id": "app_clinical",
  "evaluation_id": "eval_…",
  "execution_id": "exec_…",
  "outcome": "EXECUTED",
  "user": { "id": "user_clinician" },
  "request_id": "req_…",
  "agent_id": "agent_…",
  "tool_id": "update_patient_field",
  "operation": "write",
  "action": {
    "kind": "field_update",
    "target_id": "patient_x"
  },
  "metadata": { "correlation_id": "sf-outcome-…" }
}
```

Minimum required fields: `application_id`, `evaluation_id`, `execution_id`, `outcome`.

### Supported outcomes

| Status | Meaning |
|--------|---------|
| `EXECUTED` | Client observed successful downstream execution |
| `EXECUTION_FAILED` | Client observed failure |
| `EXECUTION_TIMEOUT` | Client timed out while attempting execution |
| `EXECUTION_UNKNOWN` | Client cannot determine whether execution completed |

Blocked / held states remain Decision + Enforcement evidence. Do **not** report `EXECUTED` for a DENY.

### Response (accepted)

```json
{
  "status": "accepted",
  "evaluation_id": "eval_…",
  "execution_id": "exec_…",
  "outcome": "EXECUTED",
  "audit_id": "aud_…",
  "evidence_class": "client_reported",
  "machine_decision": "ALLOW",
  "human_resolution": null,
  "enforcement": "CLIENT_COMMIT_ALLOWED"
}
```

Idempotent replay returns `"status": "idempotent"` with the original `audit_id`.

Conflict returns HTTP `409` with `reason_code: OUTCOME_CONFLICT`.

---

## Authorization binding

An Outcome is accepted only when:

1. The caller authenticates as an application API key.
2. `application_id` matches the key.
3. The evaluation exists.
4. The evaluation is not a machine `DENY`.
5. A sealed **enforcement** audit with `CLIENT_COMMIT_ALLOWED` exists for that `evaluation_id` (Outcome/conflict events are excluded from this lookup).
6. Application ownership matches evaluation / authz audit.
7. Server-derived authorization context binds the receipt (see below).
8. `(deployment_id, execution_id)` has no conflicting prior claim.

### Server-derived context (Phase 4.1)

Enigma derives the authorized execution context from the evaluation + enforcement audit:

```text
application_id, user_id, agent_id, tool_id, operation,
purpose, authorization_context, action.kind, target_id, action.field
```

- Binding for the authoritative projection and receipt hash uses **server-derived** values.
- If the client **asserts** a field that disagrees with the derived context → `409` (`TOOL_MISMATCH`, `ACTION_KIND_MISMATCH`, …).
- If the client **omits** a field → server-derived value is used (omission cannot bypass binding).

Human approval remains additive:

```text
machine_decision = REVIEW
human_resolution = AUTHORIZE
execution (resume) = RESUMED
enforcement = CLIENT_COMMIT_ALLOWED
outcome = EXECUTED
```

The machine decision is never overwritten by Outcome reporting.

---

## `execution_id`

- One stable identifier per downstream execution attempt **within a deployment**.
- Claim key: `(deployment_id, execution_id)` — deployments are isolated.
- Client-generated (Salesforce demo) or any opaque string ≤ 128 chars.
- Must be reused on Outcome API retries after network failure.
- Do **not** mint a new `execution_id` merely because the Outcome API call failed.

---

## Atomic claim and concurrency (Phase 4.1)

```text
Validate authz + context
  → pre-allocate audit_id
  → atomically claim (deployment_id, execution_id) in action_outcomes
  → winner seals CLIENT_OUTCOME_RECEIPT
  → losers: identical hash → idempotent (no second RECEIPT)
            different hash → 409 + CLIENT_OUTCOME_CONFLICT only
```

**One execution claim has one authoritative Outcome.** Competing Gateway processes cannot create two authoritative `CLIENT_OUTCOME_RECEIPT` events for the same claim: the database unique constraint (or in-process atomic Map claim) is the concurrency authority; RECEIPT is sealed only after a successful claim.

---

## Idempotency and conflicts

| Case | Behavior |
|------|----------|
| Same claim + identical receipt hash | `200` `idempotent`; **no** second `CLIENT_OUTCOME_RECEIPT` |
| Same claim + different outcome/context hash | `409 OUTCOME_CONFLICT`; original retained |
| Conflict evidence | `operation: action.outcome_conflict`, reason `CLIENT_OUTCOME_CONFLICT`, `authoritative: false` — never a RECEIPT |

Projection table `action_outcomes` is an **append-only claim/idempotency index**. Cryptographic evidence remains in `audit_events`.

---

## Salesforce integration

Files: `salesforce-healthcare-demo/.../EnigmaGatewayService.cls`

```text
evaluateWriteAction → commit_allowed
    → generate execution_id
    → DML (insert/update)
    → enqueue OutcomeReportQueueable
    → POST /v1/ai/actions/outcome
```

| Local result | Reported outcome |
|--------------|------------------|
| DML success | `EXECUTED` |
| Known DML / validation failure | `EXECUTION_FAILED` |
| Cannot determine completion | `EXECUTION_UNKNOWN` |

Outcome reporting is **async** (`Queueable` + `Database.AllowsCallouts`) because Salesforce prohibits callouts after DML in the same transaction.

Local `COMPLETED` / `ERROR` without a successful Outcome report still means Enigma may show `NOT_REPORTED` until the queue delivers.

---

## Timeout / unknown semantics

Use `EXECUTION_UNKNOWN` when the client cannot establish whether the downstream system accepted the write (e.g. network loss after a possible commit). Do not invent `EXECUTED` or `EXECUTION_FAILED` under uncertainty.

If Enigma authorized but the client never reports:

```text
Enforcement: CLIENT_COMMIT_ALLOWED
Outcome: NOT_REPORTED
```

---

## Audit evidence

Accepted Outcomes seal as `operation: action.outcome` with reason codes:

- `CLIENT_OUTCOME_RECEIPT` (authoritative only; `metadata.authoritative: true`)
- `CLIENT_OUTCOME_EXECUTED` | `CLIENT_OUTCOME_EXECUTION_FAILED` | …

Enforcement correlation is recorded in metadata as `enforcement: CLIENT_COMMIT_ALLOWED` (not as a reason code that would be mistaken for the authz event).

Conflicts seal as `operation: action.outcome_conflict` with `CLIENT_OUTCOME_CONFLICT` and `authoritative: false`.

Metadata includes `evaluation_id`, `execution_id`, `deployment_id`, `outcome`, `evidence_class: client_reported`, bound action kind/target/field (no raw note bodies).

Evidence export sanitizes these safe metadata fields into the package.

---

## UI

Decision detail (`/evaluations/:id`) shows:

- Enforcement Consequence (existing)
- **Client Execution Outcome** — status, execution id, reporter, reported-at, evidence class, link to outcome audit

Navigation is unchanged.

---

## Security model

- Same Gateway trust boundary as `/v1/ai/actions` (application API key + license gate).
- Not an unrestricted assertion API: requires prior enforcement `CLIENT_COMMIT_ALLOWED`.
- Server-derived binding; client mismatches rejected.
- No raw PHI / clinical note bodies stored for Outcome proof.
- Machine decision remains authoritative; Outcome is additive evidence.
- `action_outcomes` is append-only (no UPDATE/DELETE/TRUNCATE).

---

## Limitations

1. Outcome is **client-reported**, not independent verification of any downstream system.
2. If the client never reports, Enigma only proves authorization (`CLIENT_COMMIT_ALLOWED` + `NOT_REPORTED`).
3. Salesforce Outcome delivery depends on Queueable success / retries (demo client only).
4. Full event-chain HMAC verification still requires the appliance audit signing key (unchanged from Phases 1–3B). Checkpoints/anchors remain independently verifiable with public JWKS.
5. No first-class Enforcement table (projection + sealed authz audit remain sufficient).

---

## Migration

```text
gateway/db/migrate-action-outcome-phase4.sql
gateway/db/migrate-action-outcome-phase4.1.sql
```

Phase 4 creates the projection; Phase 4.1 adds deployment-scoped PK, binding columns, and append-only triggers. Also reflected in `gateway/db/schema.sql`.

---

## Tests

```text
gateway/tests/unit/audit-outcome-phase4.test.ts
gateway/tests/unit/audit-outcome-phase4.1.test.ts
```
