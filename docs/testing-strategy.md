# Testing Strategy

**Status:** Architectural contract

## Philosophy

Test-first for security-critical paths. A component is not complete without automated tests proving fail-closed behavior.

## Layers

| Layer | Scope |
|-------|-------|
| Unit | Policy rules, validation, identity resolution, transformers |
| Integration | API → identity → policy → model stub → audit |
| E2E / acceptance | The 10 MVP proofs below |
| Network / air-gap | Documented + automated where feasible |

## MVP acceptance tests

| # | Name | Expected |
|---|------|----------|
| 1 | Normal request | `ALLOW` → approved response |
| 2 | Unauthorized model | `BLOCK` |
| 3 | Sensitive data | `TOKENIZE` or `BLOCK` per policy (Phase 2+) |
| 4 | Sanitization failure | `BLOCK` (Phase 3+) |
| 5 | Restricted response content | `BLOCK` (Phase 5+) |
| 6 | Unauthorized detokenization | remain tokenized / `BLOCK` (Phase 5+) |
| 7 | Application bypass | Documented network architecture (no code bypass path) |
| 8 | Client override flags | Rejected / ignored |
| 9 | PolicyEngine failure | `BLOCK` |
| 10 | Air-gap | Local success, no external provider |

## Phase 1 required proofs

Must pass before Phase 2:

- Test 1 — Normal governed request
- Test 2 — Unauthorized model blocked
- Test 8 — Client override rejected
- Test 9 — PolicyEngine failure → BLOCK
- Test 7 — Documented (deployment + threat model); assert no ungoverned execution route exists in API surface

## Isolation rules

- Production router must not mount bypass executors
- Tests may inject failing PolicyEngine / transform doubles
- Prefer deterministic stubs over live cloud calls in CI
