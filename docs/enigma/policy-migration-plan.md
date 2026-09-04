# Enigma — Policy migration plan

**Status:** Binding migration strategy  
**Rule:** Do not break the existing gateway. Do not let legacy JSON remain permanent architecture.

## Current state (as of `v0.1.1-rc.1`)

| Component | Reality |
|-----------|---------|
| `DeterministicPolicyEngine` | Hard-coded predicates in TypeScript |
| `policies.rules` JSONB | Operator metadata; enable/disable enforced |
| Orchestrator | Calls `PolicyEngine.evaluateRequest` / `evaluateResponse` |
| Tests | 56 gateway tests depend on current decisions |

## Target state

| Component | Reality |
|-----------|---------|
| Enterprise PDP | Evaluates relational policy versions + packs |
| Baseline + response packs | Encode today’s behavior as data |
| Adapter | Legacy `PolicyEngine` interface preserved |
| Admin | Lifecycle UI/API |
| Legacy engine | Deprecated, then removed after parity |

---

## Phases

### Phase M0 — Contracts & schema (docs + additive DDL)

**Status:** Documentation deliverables (this folder).  

- ADR-011 accepted  
- Architecture, data model, contract, lifecycle, threat model published  
- Additive SQL migration drafted (not destructive)

**Exit:** Review sign-off to implement.

### Phase M1 — Contract types + adapter shell (**Prototype**)

**Status:** Complete (code under `gateway/src/policy/enterprise/`).

- Add `gateway/src/policy/enterprise/` types matching the evaluation contract  
- `EnterprisePolicyAdapter` implements existing `PolicyEngine` by calling a PDP stub that **delegates to** `DeterministicPolicyEngine` (behavior unchanged)  
- `GATEWAY_POLICY_ENGINE=legacy|enterprise|compare` (default **enterprise**)  
- All existing tests green + adapter unit tests  

**Exit:** Adapter in path; zero decision drift.

### Phase M2 — Repository + Baseline pack seed (**Prototype → Production**)

**Status:** Complete.

- EPA tables: `gateway/db/schema-epa.sql` + `seed-epa.sql` (Compose init 04/05)
- In-memory `InMemoryPolicyRepository` + Baseline / Response pack snapshot
- `PackBackedEnterprisePdp` interpreters `baseline_input_v2` / `baseline_output_v5`
- Default `GATEWAY_POLICY_ENGINE=enterprise` uses pack PDP; `compare` enforces legacy and records mismatches
- TEST 001–005 unit coverage  

**Exit:** Pack vs legacy comparison green on baseline fixtures; existing gateway suite green.

### Phase M3 — EPA authoritative (**Production**)

**Status:** Complete.

- EPA pack PDP is source of truth for `enterprise` and `shadow` modes  
- `shadow`: EPA authoritative + legacy dual-run mismatch reporting  
- `compare`: legacy authoritative (rollback)  
- Fail closed on PDP throw / `fail_closed` decisions  
- Admin MVP: `/v1/admin/policy-packs`, `.../validate`, `.../simulate`, `.../activate`, `.../suspend`  
- Activation gated on Baseline TEST 001–005  

**Exit:** Gateway suite green on EPA-only default; admin lifecycle tests green.

### Phase M4 — Admin UX + packs + retire legacy

**Status:** Complete (legacy engine retained for rollback soak).

- Admin Policies UI: pack-grouped lifecycle (validate / simulate / activate / suspend); Enigma branding  
- Rules JSON moved to deprecated metadata editor  
- Regulatory pack frameworks: HIPAA (active overlay), Financial + Legal (draft/suspended until activated)  
- `DeterministicPolicyEngine` marked `@deprecated`; still available via `GATEWAY_POLICY_ENGINE=legacy|compare`  
- No hard-coded regulatory branches in orchestrator services — overlays live in pack layer  

**Exit:** Suite green; admin typecheck green; regulatory overlay tests green.

### Post-M4 soak (complete)

- Live pilot checks (completion, integrity, EPA simulate/validate) + automated `epa-soak` test + PILOT Test 11  
- `PostgresPolicyRepository` loads EPA tables on appliance bootstrap  
- Approve ≠ activate (`GATEWAY_POLICY_APPROVER_KEY` / `GATEWAY_POLICY_ACTIVATOR_KEY`)  
- Appliance requires `GATEWAY_VAULT_KEY` (no admin-key fallback); vault upsert on conflict  
- Client runtime errors sanitized to reason codes  
- Expanded Financial WRITE / Legal EXPORT overlays; policy detail UI; [ai-egress.md](./ai-egress.md)  
- `legacy`/`compare` modes require `GATEWAY_ALLOW_LEGACY_ENGINE=true` (`DeterministicPolicyEngine` retained only for explicit rollback)

---

## Adapter shape

```text
Orchestrator
    ↓
PolicyEngine (legacy interface)
    ↓
EnterprisePolicyAdapter
    ↓
Enterprise PDP  ←→  Policy Repository
    ↓
Decision + Obligations
    ↓
PEP (existing transform / models / response / audit)
```

Comparison mode:

```text
legacy_decision vs epa_decision
 → record mismatch (audit / policy_evaluations)
 → enforce legacy until M3 cutover flag
```

Cutover flag (example): `GATEWAY_POLICY_ENGINE=legacy|compare|enterprise`.

---

## Behavioral parity checklist (minimum)

Migrate these as Baseline pack policies + obligations:

1. Untrusted application → DENY  
2. Inactive application → DENY  
3. Operation not allowlisted → DENY  
4. Credential content → DENY  
5. PHI + public cloud → DENY / ROUTE_LOCAL constraints  
6. PHI requires clinical app + clinician (pack-scoped; not core hard-code forever)  
7. PII / Financial → TOKENIZE obligation  
8. Air-gap → local models only  
9. Response: tool/action, credential, PHI block; PII redact; detokenize privileged  

---

## Rollback

- Keep `GATEWAY_POLICY_ENGINE=legacy` until M3 soak complete  
- EPA tables additive — dropping cutover flag reverts authority without schema destroy  
- Never activate EPA-only without required policy_tests green  

---

## What we will not do

- Rebuild the gateway  
- Replace audit hash-chain with blockchain  
- Make MCP required  
- Ship a new JSON if/then DSL as “the architecture”  
- Hard-code `if (phi)` in orchestrator/services once packs exist  
