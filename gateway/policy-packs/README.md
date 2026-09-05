# Enigma Policy Packs

Versioned, docs-as-code governance content that compiles into the **generic EPA** runtime.

> **AGENT REASONS. POLICY DECIDES. GATEWAY ENFORCES.**

## Reference pack

| Pack | Path | Spec |
| --- | --- | --- |
| **HIPAA v3** (Pack #1) | [`hipaa/`](./hipaa/) | [Authoring Spec](../../docs/policy-packs/POLICY_PACK_AUTHORING_SPEC.md) · [HIPAA Mapping](../../docs/policy-packs/HIPAA_V3_REFERENCE_MAPPING.md) |

## How to author a new pack

1. **Copy the structure** from `hipaa/` (do not fork the PDP or orchestrator).
2. **Fill** `manifest.json`, `sources/`, `ontology/`, `definitions/`, `classifications/`, `obligations/`, `controls/`, `rules/`, `mappings/`, `tests/`.
3. **Respect semantics**
   - Classification ≠ applicability
   - Obligation ≠ Enigma control ≠ gateway enforcement
   - LOCAL/PRIVATE ≠ “compliant”
   - Explicit `purpose=unknown` must not silently ALLOW
4. **Validate** against [`schema/manifest.schema.json`](./schema/manifest.schema.json) and vocabulary in [`schema/pack-contract.schema.json`](./schema/pack-contract.schema.json).
5. **Implement** a pack compiler module under `gateway/src/policy/enterprise/packs/<name>/` that:
   - loads docs-as-code
   - emits EPA `policy_versions` seed rows
   - registers interpreters on `PackPolicyMeta.interpreter`
6. **Wire** overlay dispatch in `regulatory.ts` (generic loop — one branch per interpreter id).
7. **Seed** via `gateway/db/seed-epa.sql` (or migrate) without HIPAA-/framework-specific tables.
8. **Test** classification, applicability, policy decisions, enforcement, and regressions under `gateway/tests/`.

## What you should not do

- Add `HipaaPdp` / `Soc2Gateway` / framework-specific DB schemas
- Hard-code regulatory decisions in the orchestrator
- Let the LLM decide ALLOW/DENY/TOKENIZE/RELEASE
- Mutate historical `policy_versions` content hashes
- Label controls-satisfied as “certified” / “HIPAA approved”

## Runtime path

```text
policy-packs/<pack>/  →  compile  →  EPA tables / snapshot
                                  →  PackBackedEnterprisePdp
                                  →  Gateway enforcement + audit
```

## Schemas

| File | Purpose |
| --- | --- |
| `schema/manifest.schema.json` | Manifest required fields |
| `schema/pack-contract.schema.json` | Shared enums (requirement types, decisions, ranks) |
