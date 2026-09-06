# Enigma — Enterprise Policy Architecture

**Enigma** is the product name for the AI Governance Gateway (appliance code remains under `gateway/`).

> Agent reasons. Policy decides. Gateway enforces.

This folder holds the **foundational architecture deliverables** required before significant EPA implementation.

| # | Deliverable | Document |
|---|-------------|----------|
| 1 | ADR: OPA/Rego vs Cedar vs alternative | [ADR-011-policy-engine-selection.md](./ADR-011-policy-engine-selection.md) |
| 2 | Enterprise Policy Architecture | [enterprise-policy-architecture.md](./enterprise-policy-architecture.md) |
| 3 | Data model | [policy-data-model.md](./policy-data-model.md) |
| 4 | Policy evaluation contract | [policy-evaluation-contract.md](./policy-evaluation-contract.md) |
| 5 | Policy lifecycle | [policy-lifecycle.md](./policy-lifecycle.md) |
| 6 | Migration plan | [policy-migration-plan.md](./policy-migration-plan.md) |
| 7 | Policy threat model | [policy-threat-model.md](./policy-threat-model.md) |
| — | AI egress placeholder | [ai-egress.md](./ai-egress.md) |
| — | HIPAA pack v3.1 (evaluation traces) | [hipaa-pack-v2.md](./hipaa-pack-v2.md) |
| — | **Healthcare Policy Packs** (HIPAA + Part 2) | [../architecture/HEALTHCARE_POLICY_PACKS.md](../architecture/HEALTHCARE_POLICY_PACKS.md) |
| — | **Healthcare Policy Domain** | [../architecture/HEALTHCARE_POLICY_DOMAIN.md](../architecture/HEALTHCARE_POLICY_DOMAIN.md) |
| — | **Healthcare Policy Resolution v0.1** | [../architecture/HEALTHCARE_POLICY_RESOLUTION.md](../architecture/HEALTHCARE_POLICY_RESOLUTION.md) |
| — | Multi-pack decision explanation (operator UX) | Policy Simulate → `DecisionExplanationView` |
| — | **Product differentiation architecture** | [../architecture/ENIGMA_PRODUCT_DIFFERENTIATION.md](../architecture/ENIGMA_PRODUCT_DIFFERENTIATION.md) |
| — | **Policy Pack Authoring Spec** | [../policy-packs/POLICY_PACK_AUTHORING_SPEC.md](../policy-packs/POLICY_PACK_AUTHORING_SPEC.md) |
| — | HIPAA v3.1 → pack contract mapping | [../policy-packs/HIPAA_V3_REFERENCE_MAPPING.md](../policy-packs/HIPAA_V3_REFERENCE_MAPPING.md) |

## Decision summary

**Domain-native Enigma PDP** (not OPA-as-architecture, not Cedar-as-architecture).  
OPA/Cedar may later back *condition expressions* only, behind the same contract.

## Implementation gate

Do not remove `DeterministicPolicyEngine` until migration phases M1–M3 in the migration plan are complete and tests prove parity.

**Next engineering step:** Customer pilot sign-off → tag `v0.1.1`; expand pack rule coverage; implement AI egress tooling when network partners are ready.

## Related

- Legacy contract (superseding in progress): [../policy-model.md](../policy-model.md)
- Security / evidence: [../security-model.md](../security-model.md)
- Platform threats: [../threat-model.md](../threat-model.md)
- ADRs: [../architectural-decisions.md](../architectural-decisions.md)
