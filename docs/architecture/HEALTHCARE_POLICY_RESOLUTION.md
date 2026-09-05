# Healthcare Policy Resolution v0.1

**Status:** Active  
**Scope:** Generic multi-pack evaluation, conflict detection, precedence, combined provenance  
**Packs in domain:** HIPAA v3.1 (Pack #1), 42 CFR Part 2 v1.0 (Pack #2)

Related:

- [HEALTHCARE_POLICY_DOMAIN.md](./HEALTHCARE_POLICY_DOMAIN.md)
- [HEALTHCARE_POLICY_PACKS.md](./HEALTHCARE_POLICY_PACKS.md)

---

## Principle

```text
Packs contribute. The platform resolves. The gateway enforces.
```

Regulatory intelligence stays in policy packs. Resolution is regulatory-agnostic:

```text
pack · policy · rule · obligation · citation · source · authority
precedence · conflict · control · decision
```

**Authority tier ≠ precedence.**  
`authority_tier = 1` describes source authority. It does **not** automatically override another pack.

**No universal Part 2 > HIPAA precedence.** Conflicts without declared precedence → `POLICY_CONFLICT_UNRESOLVED` → `REVIEW`.

---

## Flow

```text
Request
  → Context / Classification
  → Applicable Policy Packs (registry)
  → Independent Pack Contributions
  → Generic Policy Resolver
  → Final Decision + Controls
  → Gateway Enforcement
  → Audit / Provenance
```

```text
HIPAA Pack ──┐
Part 2 Pack ─┼──→ resolvePackContributions() ──→ Decision
Pack N     ──┘
```

Implementation:

| Piece | Location |
| --- | --- |
| Contribution + resolve | `gateway/src/policy/enterprise/policy-resolution.ts` |
| Collect via registry | `overlay-registry.ts` → `applyRegisteredOverlays` |
| Explanation / conflicts | `PolicyDecision.explanation.resolution`, `conflicts[]` |

---

## Pack contribution

Each active overlay is applied to a **clone** of the baseline result. A contribution includes:

```text
pack_id, policy_id, policy_version
decision, reason_codes
rule_ids, obligation_ids, obligations
controls, transforms
provenance, precedence?, applicable
```

Skipped packs (not applicable) leave skip markers only.

---

## Conflict model

| Category | Meaning |
| --- | --- |
| `NONE` | No multi-pack interaction |
| `AGREEMENT` | Same decision (e.g. DENY + DENY). Deny agreements stay AGREEMENT even when obligation sets differ. |
| `COMPLEMENTARY` | Compatible allow/transform decisions with distinct obligations/controls |
| `RESTRICTIVE` | Compatible stronger restriction (e.g. ALLOW + TOKENIZE → TOKENIZE) |
| `CONFLICT` | Decisions cannot both be satisfied (e.g. ALLOW vs DENY) |
| `UNRESOLVED` | CONFLICT without valid declared precedence |

**DENY + DENY is agreement, not conflict.**

---

## Precedence

Declared on `PackPolicyMeta.precedence`:

```json
{
  "priority": 100,
  "basis": "DECLARED_POLICY_PRECEDENCE",
  "overrides_pack_ids": ["pack_other"]
}
```

Resolution of CONFLICT:

1. Explicit `overrides_pack_ids` wins  
2. Else both have priorities → higher `priority` wins  
3. Else → `REVIEW` (`POLICY_CONFLICT_UNRESOLVED`)

Authority tier on citations is **never** used as an automatic override.

---

## Resolution outcomes

Uses existing decision vocabulary: `ALLOW` | `TOKENIZE` | `DENY` | `REVIEW` | …

Complementary example:

```text
Pack A: ALLOW + control X
Pack B: ALLOW + control Y
→ ALLOW, controls X+Y, category COMPLEMENTARY
```

Conflict without precedence:

```text
Pack A: ALLOW
Pack B: DENY
→ REVIEW + conflicts[]
```

---

## Provenance

`explanation.provenance.matched_rules[]` retains **all** contributing packs’ rule → obligation → citation chains.

`explanation.resolution` records category, basis, contributing pack ids, and per-contribution summaries.

---

## Persistence

Stored on existing `policy_evaluations.explanation` (includes `resolution` + provenance).  
`conflicts` array maps to `PolicyConflictRecord` (aligns with `policy_conflicts` schema concepts). No new tables in v0.1.

---

## Future pack onboarding

1. Author pack + register interpreter  
2. Optionally set `precedence` metadata  
3. Contributions merge via registry + resolver  
4. No PDP forks  

Do not select the next real healthcare pack in this document.
