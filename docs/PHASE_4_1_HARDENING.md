# Phase 4.1 — Outcome Evidence Hardening

**Status:** Implemented  
**Builds on:** Phase 4, [`PHASE_4_IMPLEMENTATION_EVALUATION.md`](./PHASE_4_IMPLEMENTATION_EVALUATION.md), [`PHASE_4_ENFORCEMENT_OUTCOME.md`](./PHASE_4_ENFORCEMENT_OUTCOME.md)

## Objective

Resolve the Phase 4 evaluation material findings without redesigning EPA/PDP or the audit ledger:

1. **HIGH** — Concurrent receipts must not seal competing authoritative `CLIENT_OUTCOME_RECEIPT` events.  
2. **MEDIUM** — Outcome binding must use server-derived authorization context.  
3. **MEDIUM** — `action_outcomes` must be append-only like other evidence projections.

## Changes

### Atomic claim before RECEIPT

```text
Validate
  → deriveAuthorizedOutcomeContext (server)
  → pre-allocate audit_id
  → claimAuthoritative(deployment_id, execution_id)   # DB unique / in-memory atomic Map
  → winner: seal CLIENT_OUTCOME_RECEIPT (authoritative: true)
  → loser identical: 200 idempotent (no new RECEIPT)
  → loser conflict: 409 + CLIENT_OUTCOME_CONFLICT (authoritative: false)
```

Concurrency authority is the unique claim key `(deployment_id, execution_id)` via `INSERT … ON CONFLICT DO NOTHING` (Postgres) or synchronous Map claim (single-process memory).

### Authz lookup hygiene

`findClientCommitAllowedAudit` ignores Outcome/conflict events so post-receipt retries cannot rebind against the receipt itself.

### Context binding

`deriveAuthorizedOutcomeContext` + `clientOutcomeContextMismatch` in `gateway/src/audit/outcome.ts`.

### Projection protection

`migrate-action-outcome-phase4.1.sql` / `schema.sql`:

- PK `(deployment_id, execution_id)`
- Append-only triggers (UPDATE/DELETE/TRUNCATE forbidden)
- Binding columns: `user_id`, `operation`, `purpose`, `authorization_context`, `action_field`

## Files

| File | Role |
|------|------|
| `gateway/src/api/orchestrator.ts` | Claim-first Outcome flow, audit write queue, authz filter |
| `gateway/src/audit/outcome.ts` | Binding + receipt hash |
| `gateway/src/audit/outcome-store.ts` | `claimAuthoritative` |
| `gateway/db/migrate-action-outcome-phase4.1.sql` | Schema hardening |
| `gateway/db/schema.sql` | Canonical schema |
| `gateway/tests/unit/audit-outcome-phase4.1.test.ts` | Concurrency / binding / isolation tests |

## Validation results

```text
Phase 4 tests:     12/12
Phase 4.1 tests:   10/10
Full unit suite:   909/909
Gateway typecheck: PASS
Admin typecheck:   PASS
Build:             PASS
Docker:            PASS
```

## Remaining limitation

> Outcome remains client-reported execution evidence and is not independent verification of the downstream system.
