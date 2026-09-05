# Healthcare Policy Packs

**Status:** Active  
**Scope:** Healthcare Domain pack inventory and architecture proof  
**Invariant:** Packs contribute · Platform resolves · Gateway enforces

Related:

- [HEALTHCARE_POLICY_DOMAIN.md](./HEALTHCARE_POLICY_DOMAIN.md)
- [HEALTHCARE_POLICY_RESOLUTION.md](./HEALTHCARE_POLICY_RESOLUTION.md)

---

## 1. Healthcare Domain

```text
Healthcare Domain
    ├── HIPAA v3.1          (Pack #1 — reference)
    └── 42 CFR Part 2 v1.0  (Pack #2 — architecture validation)
```

The Healthcare Domain is a governance area (`domain_id: healthcare`). It is **not** a policy pack. It holds pack membership and cross-pack contracts. Regulatory text and executable rules live only inside packs.

---

## 2. HIPAA as Pack #1

| Field | Value |
| --- | --- |
| Pack ID | `pack_hipaa` |
| Version | `3.1.0` |
| Role | Reference implementation |
| Status | Complete — do not reopen as a feature workstream |

HIPAA remains the template for provenance, overlay registration, and controls-vs-obligations separation.

---

## 3. 42 CFR Part 2 as Pack #2

| Field | Value |
| --- | --- |
| Pack ID | `pack_42_cfr_part_2` |
| Name | 42 CFR Part 2 |
| Domain | `healthcare` |
| Version | `1.0.0` |
| Interpreters | `part2_pack_v1` / `part2_pack_v1_output` |

**Part 2 is implemented as a policy pack, not as a standalone compliance application.**

It is a representative, authoritative MVP covering:

1. Applicability (`§ 2.11` / `§ 2.12`)
2. Confidentiality / identification (`§ 2.13`)
3. Use and disclosure restrictions
4. Consent (`§ 2.31` / `§ 2.33`)
5. Redisclosure notice (`§ 2.32`)
6. Proceedings-related protections (scoped)
7. Interaction with HIPAA via the **generic** resolver (no Part2>HIPAA universal override)

Docs-as-code root: `gateway/policy-packs/part2/`  
Runtime: `gateway/src/policy/enterprise/packs/part2/`

---

## 4. Pack independence

Each pack:

- Loads and compiles on its own
- Registers overlay interpreters via the generic registry
- Evaluates against request facts independently
- Emits its own decision, obligations, controls, and provenance

Part 2 evaluates without HIPAA (suspend HIPAA overlays in tests). HIPAA evaluates without Part 2 when Part 2 is not applicable (`part2_pack_v1_skip_not_applicable`).

---

## 5. Generic resolution

```text
HIPAA Pack ──┐
Part 2 Pack ─┼──→ resolvePackContributions() ──→ Decision + Resolution + Provenance
             │
Gateway ←────┘  (enforces decision only)
```

There is no `Part2PolicyResolver`, `HipaaPart2Resolver`, `Part2PDP`, or Part-2-specific Gateway branch.

---

## 6. Conflict taxonomy

| Category | Meaning |
| --- | --- |
| `AGREEMENT` | Same decision family (e.g. DENY + DENY) |
| `COMPLEMENTARY` | Compatible allow/transform decisions with distinct obligations/controls |
| `RESTRICTIVE` | Compatible stronger restriction (e.g. ALLOW + REVIEW → REVIEW) |
| `CONFLICT` | Incompatible decisions (e.g. ALLOW + DENY) |
| `UNRESOLVED` | Conflict without declared precedence → `REVIEW` + `POLICY_CONFLICT_UNRESOLVED` |

DENY + DENY remains **AGREEMENT** even when deny-side obligations differ.

---

## 7. Precedence model

- **Authority tier ≠ precedence.** CFR tier 1 describes source class; it does not auto-win.
- No universal `Part 2 > HIPAA` relationship.
- Precedence only via declared `PackPolicyMeta.precedence`:

```json
{
  "priority": 200,
  "basis": "DECLARED_POLICY_PRECEDENCE",
  "overrides_pack_ids": ["pack_hipaa"]
}
```

Use only when the regulatory relationship and Enigma policy model justify it. Default product posture: no declared Part 2 override of HIPAA; unresolved conflicts go to REVIEW.

---

## 8. Multi-pack provenance

Combined decisions preserve both chains:

```text
Decision
├── HIPAA → Rule → Obligation → Citation → Source → Authority tier
├── 42 CFR Part 2 → Rule → Obligation → Citation → Source → Authority tier
└── Resolution → category · basis · contributingPackIds
```

Exact citations (e.g. `42 CFR § 2.13`, `42 CFR § 2.31`) attach when Part 2 rules fire. Vague pack-level citations are not used as sole provenance for executable rules.

---

## 9. Gateway separation

The Gateway receives a generic decision payload (decision, controls/obligations, reason codes, provenance, resolution). It does **not** interpret HIPAA, Part 2, SUD, or CFR.

```text
REGULATORY OBLIGATION → ENIGMA POLICY DECISION → ENIGMA CONTROL → GATEWAY ENFORCEMENT
```

`TOKENIZE`, `LOCAL_MODEL_ONLY`, detokenization, and approval workflows are Enigma controls — not automatic Part 2 mandates.

---

## 10. Deliberately NOT implemented

- Part 2 assessment questionnaires / scorecards / dashboards / certification workflows
- Full SUD clinical ontology or healthcare data ontology
- Regulatory document browser or Part-2-specific UI
- Part-2-specific PDP / Gateway / conflict resolver
- Every Part 2 provision (court-order pathways §2.64/§2.65 left out of executable MVP)
- HITECH, CMS, ONC Information Blocking as additional packs
- Pack #3 of any kind

---

## Architecture proof (Pack #2 Definition of Done)

> **Part 2 can be added without creating Part-2-specific logic inside the core evaluator, resolver, PDP, or Gateway.**

If a future authority requires new capability, improve the **generic** abstraction once and demonstrate it with multiple packs — do not add regulatory-specific runtime forks.
