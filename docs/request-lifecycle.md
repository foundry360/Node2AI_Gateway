# Request Lifecycle

**Status:** Architectural contract

## Sequence

```text
1.  Receive POST /v1/ai/completions
2.  Assign request_id + correlation_id
3.  Authenticate credential → organization + application binding
4.  Resolve user identity (authoritative store; not header-only trust)
5.  Validate request schema (reject security override flags)
6.  Load application constraints (allowed models/datasets/operations)
7.  Data Interrogation → classification + intent + risk evidence
8.  PolicyEngine.evaluateRequest → decision + eligible models
9.  If BLOCK → audit + return blocked response
10. Apply transforms (tokenize/redact/mask) if required; fail → BLOCK
11. Select model from eligible set only
12. Model Gateway executes approved request
13. Continue to Response Lifecycle
```

## Phase 1 subset

Phase 1 implements steps 1–6, 8–9, 11–12 with:

- Stub interrogation (default `Internal` / low risk) sufficient for policy inputs
- Stub/mock approved model executor behind Model Gateway interface
- Full audit of decisions

Fail-closed behavior for policy and auth is mandatory in Phase 1.

## Correlation

Every hop logs the same `correlation_id`:

```text
Application → Gateway → Policy → Model → Response → Audit
```

## Bypass prevention (application layer)

- Single public execution route
- Auth binds key → application_id (client cannot impersonate another app via body alone)
- Requested `model` is a hint; PolicyEngine determines eligibility
- No `sanitize_*=false` controls
