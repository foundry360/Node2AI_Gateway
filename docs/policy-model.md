# Policy Model

**Status:** Legacy contract — migrating to [Enigma Enterprise Policy Architecture](./enigma/README.md)  
**Authority:** PolicyEngine is the sole authorization decision point (legacy interface preserved during migration).

> **Enigma target:** Subject / Resource / Action / Context / AI Context / Evidence → PDP → Decision + Obligations → PEP.  
> See [enigma/enterprise-policy-architecture.md](./enigma/enterprise-policy-architecture.md). JSON metadata is **not** the architecture.

## Decision vocabulary

### Request (input) decisions

| Decision | Meaning |
|----------|---------|
| `ALLOW` | Proceed without content transform |
| `TOKENIZE` | Reversible substitution before model |
| `REDACT` | Irreversible removal/replacement |
| `MASK` | Partial obfuscation |
| `TRANSFORM` | Other approved transform |
| `BLOCK` | Do not execute |

### Response decisions

| Decision | Meaning |
|----------|---------|
| `RELEASE` | Return content to client |
| `TRANSFORM` / `REDACT` | Modify then release |
| `BLOCK` | Do not return model content |

## Evaluation order

```text
Request
  → PolicyEngine.evaluateRequest(context)
  → Eligible models[]
  → SmartRouter selects ONLY from eligible set
  → Execute
  → ResponseInspector evidence
  → PolicyEngine.evaluateResponse(context)
  → Release / transform / block
```

**Never** route first and authorize later.

## Rule shape (logical)

Rules are conjunctions over attributes. Examples:

```text
IF sensitivity = PHI
AND user.role = clinician
AND application = approved_clinical_app
AND model ∈ approved_local_models
THEN ALLOW

IF sensitivity = PHI
AND model.provider = public_cloud
THEN BLOCK

IF sensitivity = PII
AND approved_external_model = true
THEN TOKENIZE

IF application.trust_level = untrusted
THEN BLOCK

IF operation = write
AND user lacks write permission
THEN BLOCK
```

## Context schema (inputs)

```text
user { id, roles, permissions, status }
application { id, type, environment, status, allowed_* }
organization { id, status, configuration }
classification { sensitivity, entities, confidence, reason_codes }
dataset { id, classification, permissions }   # when present
operation
requested_model (hint; may be null)
available_models[]
environment { connected | airgap, ... }
risk { level, reason_codes }
```

## Outputs

```json
{
  "decision": "ALLOW | TOKENIZE | REDACT | MASK | TRANSFORM | BLOCK",
  "reason_codes": ["string"],
  "eligible_models": ["model_id"],
  "transforms": [{ "type": "tokenize", "targets": ["PII"] }],
  "policy_ids": ["pol_..."],
  "policy_version": 1
}
```

## Storage & administration

- Policies are versioned records in PostgreSQL.
- **Enable/disable is enforced:** if `pol_phase2_core` or `pol_phase5_response` is `disabled` in the store, evaluation returns `BLOCK` with `POLICY_DISABLED`.
- **Rule JSON is metadata in v1:** the admin-editable `rules` document describes intent for operators; binding decisions still come from `DeterministicPolicyEngine` code. Editing JSON does not change runtime predicates until a later release wires rule compilation.
- Policy status/version changes are privileged admin operations (audited separately from completion audit).

## AI usage boundary

Semantic classifiers may emit sensitivity, intent, and risk **evidence**. They must not emit binding `ALLOW`/`BLOCK` decisions consumed as authorization.
