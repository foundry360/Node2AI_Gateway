# Implementation Plan

**Status:** Living plan  
**Current phase:** Phases 0–7 complete + PostgreSQL persistence for identity/audit


## Phase 0 — Architecture ✅

- [x] Inspect repository (legacy import = reference only)
- [x] Architecture documentation under `/docs`
- [x] Proposed directory structure under `/gateway`
- [x] Implementation plan + ADRs
- [x] Dependencies & security risks identified
- [x] Initial database schema
- [x] API contract
- [x] Test strategy

## Phase 1 — Governance Boundary ✅

Build:

- [x] Gateway API (`POST /v1/ai/completions`)
- [x] API-key authentication bound to application
- [x] Application + user identity resolution
- [x] `request_id` / `correlation_id`
- [x] Request validation (reject security overrides)
- [x] Audit events
- [x] PolicyEngine skeleton (deterministic allow/block + eligible models)
- [x] Model Gateway interface + local stub executor (policy-approved only)

Prove:

```text
Application → Gateway → Policy → approved model stub
```

**Exit criteria:** Phase 1 acceptance tests green; no production bypass route.  
**Verified:** `cd gateway && pnpm test` — 9 tests passed (2026-09-03).

**Do not start Phase 2 until this phase remains green and is explicitly approved.**

## Phase 2 — Data Interrogation ✅

Build:

- [x] Deterministic PII / PHI / credential / financial detection
- [x] Sensitivity + intent + risk classification
- [x] Optional heuristic semantic classifier (evidence only)
- [x] Fail-closed on interrogation failure
- [x] Policy consumes structured classification (ALLOW / TOKENIZE / BLOCK)

Prove:

```text
Request → Interrogation → structured classification → Policy
```

**Notes:** `TOKENIZE` decisions fail closed with `TOKENIZE_REQUIRED` until Phase 3 implements transforms (raw sensitive content never reaches the model).

**Verified:** `cd gateway && pnpm test`

## Phase 3 — Input Enforcement ✅

Build:

- [x] Tokenization with reversible vault mappings
- [x] Redaction / masking
- [x] Fail-closed on transform or vault failure
- [x] Privileged detokenization API (not auto-invoked on responses)
- [x] Orchestrator path: Policy → Transform → Model

Prove:

```text
Sensitive request → Policy → Transform → Model
```

**Verified:** `cd gateway && pnpm test`

**Do not start Phase 4 until this phase remains green and is explicitly approved.**

## Phase 4 — Model Gateway ✅

Build:

- [x] Approved model registry
- [x] `LocalModelRuntime` abstraction (Stub + Ollama adapter)
- [x] Local model provider
- [x] External OpenAI-compatible provider adapter
- [x] SmartRouter selects only from policy-eligible models
- [x] Model Gateway never authorizes; air-gap omits external providers

Prove:

```text
Policy → eligible models → Model Gateway → execution
```

**Verified:** `cd gateway && pnpm test`

**Do not start Phase 5 until this phase remains green and is explicitly approved.**

## Phase 5 — Response Governance ✅

Build:

- [x] Response Inspector (deterministic evidence)
- [x] Response policy (`RELEASE` / `REDACT` / `BLOCK`)
- [x] Output transformation
- [x] Privileged/authorized detokenization only
- [x] Fail-closed on inspection / response-policy failure

Prove:

```text
Model → Response Inspector → Policy → Release / Transform / Block
```

**Verified:** `cd gateway && pnpm test`

**Do not start Phase 6 until this phase remains green and is explicitly approved.**

## Phase 6 — Appliance ✅

Build:

- [x] Admin read APIs (`/v1/admin/*`)
- [x] Simple governance admin console (Next.js)
- [x] Docker Compose appliance (PostgreSQL + gateway + admin)
- [x] Health checks for gateway and database

Bring up:

```bash
cd gateway && docker compose up --build
```

- Gateway: http://localhost:8080
- Admin: http://localhost:3080

**Do not start Phase 7 until this phase remains green and is explicitly approved.**

## Phase 7 — Air-Gap ✅

Build:

- [x] Air-gap deployment mode omits external providers
- [x] Model Gateway refuses non-local providers/models in air-gap
- [x] Policy filters to local models
- [x] Strict network-deny fetch helper for proofs
- [x] `docker-compose.airgap.yml` profile
- [x] Test 10: governed local path with zero external AI calls

Prove:

```text
Application → Gateway → Policy → Local Model → Response Inspector → Policy → Application
```

```bash
cd gateway
docker compose -f docker-compose.yml -f docker-compose.airgap.yml up --build
pnpm test
```

**MVP phases 0–7 complete.**

---

## Dependencies (Phase 1)

| Dependency | Use |
|------------|-----|
| Node.js 20+ | Runtime |
| TypeScript | Types |
| Fastify | HTTP API |
| Zod | Request validation |
| better-sqlite3 or pg | Persistence (SQLite for unit/CI; PostgreSQL schema is canonical) |
| Vitest | Tests |
| uuid / ulid | IDs |
| pino | Structured logs |

**Not depended on:** legacy `apps/*`, `packages/*`, Supabase, blockchain, Vercel.

## Security risks (active)

See [threat-model.md](./threat-model.md). Highest early risks:

1. Accidental bypass routes during development
2. Trusting client `application_id` / `user.id` without credential binding
3. Soft-fail on policy errors
4. Premature cloud provider coupling before network controls

## Directory structure (target)

```text
gateway/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
  src/
    index.ts
    api/
      server.ts
      routes/
        completions.ts
        health.ts
      middleware/
        auth.ts
        correlation.ts
    identity/
      types.ts
      service.ts
      store.ts
    policy/
      types.ts
      engine.ts
      rules.ts
    models/
      types.ts
      gateway.ts
      stub-local.ts
    audit/
      types.ts
      service.ts
    shared/
      ids.ts
      errors.ts
      config.ts
  db/
    schema.sql
    seed.sql
  tests/
    acceptance/
      phase1.test.ts
    unit/
docs/
  *.md (contracts)
docs/legacy/
  (imported Node2AI docs — reference only)
```
