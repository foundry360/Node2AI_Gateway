# Healthcare Policy Resolution v0.1

**Status:** Active (consequence model updated)  
**Scope:** Generic multi-pack evaluation, conflict detection, precedence, combined provenance  
**Packs in domain:** HIPAA, 42 CFR Part 2, ONC/HTI-1, CMS

**Authoritative consequence model:** [POLICY_CONSEQUENCE_RESOLUTION.md](./POLICY_CONSEQUENCE_RESOLUTION.md)

Related:

- [HEALTHCARE_POLICY_DOMAIN.md](./HEALTHCARE_POLICY_DOMAIN.md)
- [HEALTHCARE_POLICY_PACKS.md](./HEALTHCARE_POLICY_PACKS.md)

---

## Principle

```text
Packs contribute. The platform resolves. The gateway enforces.
```

Regulatory intelligence stays in policy packs. Resolution is regulatory-agnostic and **consequence-based**:

```text
Explicit DENY is never weakened by ALLOW / TOKENIZE / REVIEW from another pack.
```

**Authority tier ≠ precedence.**  
**No universal HIPAA > CMS / Part 2 > HIPAA ranking.**

---

## Flow

```text
Request
  → Context / Classification
  → Applicable Policy Packs (registry)
  → Independent Pack Contributions
  → Generic Policy Resolver (consequence composition)
  → Final Decision + Controls
  → Gateway Enforcement
  → Audit / Provenance
```

Implementation:

| Piece | Location |
| --- | --- |
| Contribution + resolve | `gateway/src/policy/enterprise/policy-resolution.ts` |
| Collect via registry | `overlay-registry.ts` → `applyRegisteredOverlays` |
| Explanation / conflicts | `PolicyDecision.explanation.resolution`, `conflicts[]` |
| Consequence model doc | `POLICY_CONSEQUENCE_RESOLUTION.md` |

---

## Conflict / consequence summary

| Pair | Result |
| --- | --- |
| DENY + DENY | AGREEMENT → DENY |
| ALLOW + DENY | RESTRICTIVE → **DENY** (`CONSEQUENCE_DENY`) |
| ALLOW + TOKENIZE | RESTRICTIVE → TOKENIZE |
| ALLOW + REVIEW | RESTRICTIVE → REVIEW |
| Distinct ALLOW obligations | COMPLEMENTARY → ALLOW (union) |

Non-applicable packs contribute nothing.

All contributions remain in `resolution.contributions` for explainability.

---

## Precedence

`PackPolicyMeta.precedence` remains for rare declared policy-level conflicts that are not covered by consequence composition. It is **not** a regulatory hierarchy and **cannot** make ALLOW defeat DENY.

---

## Provenance

`explanation.provenance.matched_rules[]` retains **all** contributing packs’ rule → obligation → citation chains.

`explanation.resolution` records category, basis (`CONSEQUENCE_DENY` | `COMPOSE_RESTRICTIVE` | …), contributing pack ids, and per-contribution summaries.
