# Enigma — Policy data model (PostgreSQL)

**Status:** Design for EPA migration  
**Principle:** Core policy relationships are relational and queryable. JSONB is allowed for flexible condition metadata only — not as the architecture.

## Entity relationship (logical)

```text
policy_packs
    └── policies
            └── policy_versions          (immutable once activated)
                    ├── policy_scopes
                    ├── policy_subjects
                    ├── policy_resources
                    ├── policy_actions
                    ├── policy_conditions
                    ├── policy_obligations
                    ├── policy_tests
                    └── policy_approvals

policy_evaluations
    ├── links request_id / evaluation_id
    └── policy_conflicts (per evaluation)

organizations / tenants isolate rows (tenant_id / organization_id)
```

Existing `policies` table (opaque `rules` JSONB) remains during migration as **legacy**; new tables are additive. See [policy-migration-plan.md](./policy-migration-plan.md).

---

## Tables

### `policy_packs`

| Column | Type | Notes |
|--------|------|-------|
| pack_id | TEXT PK | e.g. `pack_enterprise_baseline` |
| name | TEXT | |
| domain | TEXT | enterprise \| hipaa \| financial \| legal \| custom |
| description | TEXT | |
| status | TEXT | draft \| active \| retired |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `policies`

Logical policy identity (stable across versions).

| Column | Type | Notes |
|--------|------|-------|
| policy_id | TEXT PK | |
| pack_id | TEXT FK nullable | |
| organization_id | TEXT FK nullable | null = platform/enterprise |
| name | TEXT | |
| description | TEXT | |
| owner | TEXT | |
| domain | TEXT | |
| created_by | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `policy_versions`

| Column | Type | Notes |
|--------|------|-------|
| policy_version_id | TEXT PK | |
| policy_id | TEXT FK | |
| version | INTEGER | monotonic per policy_id |
| status | TEXT | draft \| review \| approved \| active \| suspended \| retired \| archived |
| priority | INTEGER | higher = evaluated earlier within same tier |
| scope_tier | TEXT | platform \| enterprise \| regulatory \| tenant \| bu \| application \| agent \| default |
| effective_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ nullable | |
| approved_by | TEXT nullable | |
| activated_at | TIMESTAMPTZ nullable | |
| activated_by | TEXT nullable | |
| changelog | TEXT | |
| content_hash | TEXT | hash of version body for integrity |
| created_at | TIMESTAMPTZ | |
| created_by | TEXT | |

**Invariant:** Once `status = active` (or after activation event), version row content is **immutable**. Changes → new `version`.

Unique: `(policy_id, version)`.

### `policy_scopes`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| policy_version_id | TEXT FK | |
| scope_type | TEXT | enterprise \| tenant \| application \| role \| … |
| scope_value | TEXT | id or `*` |

### `policy_subjects`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| policy_version_id | TEXT FK | |
| subject_type | TEXT | user \| role \| group \| application \| agent \| service \| tenant \| any |
| match | JSONB | structured matcher (not free-form code) |

### `policy_resources`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| policy_version_id | TEXT FK | |
| resource_type | TEXT | |
| classification | TEXT nullable | extensible label |
| match | JSONB | |

### `policy_actions`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| policy_version_id | TEXT FK | |
| action | TEXT | SUMMARIZE \| GENERATE \| … |

### `policy_conditions`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| policy_version_id | TEXT FK | |
| condition_key | TEXT | e.g. `ai.execution`, `context.deployment_mode` |
| operator | TEXT | eq \| neq \| in \| not_in \| gte \| … |
| value | JSONB | |
| effect_hint | TEXT nullable | matched → contribute to decision |

### `policy_obligations`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| policy_version_id | TEXT FK | |
| obligation | TEXT | TOKENIZE_PII \| LOCAL_MODEL_ONLY \| … |
| parameters | JSONB | e.g. targets, model allowlist |
| on_decision | TEXT | when decision ∈ {ALLOW, TOKENIZE, …} apply |

### `policy_approvals`

| Column | Type | Notes |
|--------|------|-------|
| approval_id | TEXT PK | |
| policy_version_id | TEXT FK | |
| action | TEXT | submit_review \| approve \| reject \| activate \| suspend \| retire |
| actor | TEXT | |
| comment | TEXT | |
| created_at | TIMESTAMPTZ | |

### `policy_tests`

| Column | Type | Notes |
|--------|------|-------|
| test_id | TEXT PK | |
| policy_version_id | TEXT FK | |
| name | TEXT | |
| fixture | JSONB | PolicyEvaluationRequest sample |
| expect_decision | TEXT | |
| expect_obligations | JSONB | |
| required | BOOLEAN | must pass to activate |
| last_result | TEXT | pass \| fail \| never_run |
| last_run_at | TIMESTAMPTZ | |

### `policy_evaluations`

Governance evidence companion (also mirrored into audit chain fields as today).

| Column | Type | Notes |
|--------|------|-------|
| evaluation_id | TEXT PK | |
| request_id | TEXT | |
| phase | TEXT | input \| output \| simulate |
| organization_id | TEXT | |
| subject | JSONB | snapshot |
| resource | JSONB | |
| action | TEXT | |
| context | JSONB | |
| ai_context | JSONB | |
| evidence_in | JSONB | |
| decision | TEXT | |
| reason | TEXT | |
| applicable_policies | JSONB | [{policy_id, version, pack_id}] |
| obligations | JSONB | |
| explanation | JSONB | matched/rejected |
| created_at | TIMESTAMPTZ | |

### `policy_conflicts`

| Column | Type | Notes |
|--------|------|-------|
| conflict_id | TEXT PK | |
| evaluation_id | TEXT FK | |
| policy_a | TEXT | id@version |
| policy_b | TEXT | |
| conflict_type | TEXT | decision \| obligation |
| detail | JSONB | |
| resolution | TEXT | precedence \| deny_unresolved |
| created_at | TIMESTAMPTZ | |

### Classification registry (extensible)

### `classification_labels`

| Column | Type | Notes |
|--------|------|-------|
| label | TEXT PK | PHI, PII, … |
| description | TEXT | |
| pack_id | TEXT nullable | owning pack |
| active | BOOLEAN | |

---

## Indexes (minimum)

- `policy_versions (status, effective_at, expires_at)`
- `policy_versions (policy_id, version)`
- `policy_scopes (scope_type, scope_value)`
- `policy_evaluations (request_id)`, `(organization_id, created_at)`
- `policies (organization_id)`

## Tenant isolation

- All tenant-scoped rows carry `organization_id` / tenant scope.
- Platform policies: `organization_id IS NULL` + `scope_tier = platform|enterprise|regulatory`.
- Admin APIs must filter by authenticated tenant; cross-tenant access is a security defect (see threat model).

## Migration from legacy `policies.rules` JSONB

1. Keep legacy table read/write for admin until cutover.
2. Seed EPA tables from Baseline + response packs corresponding to current engine behavior.
3. Comparison mode records mismatches in `policy_evaluations` / audit.
4. Deprecate legacy JSON as architecture after parity.
