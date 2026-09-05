# HIPAA Policy Pack v3.1 — Reference Mapping

**Pack:** `pack_hipaa` · **Version:** `3.1.0`  
**Role:** Policy Pack **#1** / reference implementation of the [Policy Pack Authoring Specification](./POLICY_PACK_AUTHORING_SPEC.md).

This document maps HIPAA v3/v3.1 artifacts and runtime behavior onto the generic Enigma contract. It does **not** redefine HIPAA decision semantics.

**v3.1 delta:** End-to-end provenance — compiled obligations/sources join into `explanation.provenance` at decision time.

---

## 1. Identity

| Spec concept | HIPAA value |
| --- | --- |
| Pack id | `pack_hipaa` |
| Display name | `HIPAA` |
| Domain | `hipaa` (UI label: **HIPAA**) |
| Pack version | `3.1.0` |
| Scope | `AI_DATA_GOVERNANCE` |
| Explicit non-claim | `not: HIPAA_COMPLIANCE_CERTIFICATION` |
| Classification profile | `hipaa_class_profile_v3` |
| Input policy | `pol_hipaa_phi_local` **v3** · interpreter `hipaa_pack_v3` |
| Output / release policy | `pol_hipaa_release` **v2** · interpreter `hipaa_pack_v3_output` |

### Immutable history

| Version id | Status | Interpreter |
| --- | --- | --- |
| `pv_pol_hipaa_phi_local_v1` | suspended | `hipaa_overlay_v1` |
| `pv_pol_hipaa_v2` | suspended | `hipaa_pack_v2` |
| `pv_pol_hipaa_v3` | **active** | `hipaa_pack_v3` |
| `pv_pol_hipaa_release_v1` | suspended | `hipaa_pack_v2_output` |
| `pv_pol_hipaa_release_v2` | **active** | `hipaa_pack_v3_output` |

---

## 2. Directory → contract mapping

| Spec layer | HIPAA path |
| --- | --- |
| Manifest | `gateway/policy-packs/hipaa/manifest.json` |
| Sources + authority hierarchy | `sources/index.json` + `sources/cfr|hhs|nist/` |
| Ontology | `ontology/index.json` |
| Definitions | `definitions/hipaa.json` |
| Classifications | `classifications/phi.json` |
| Applicability | Embedded in profile (`regulatory.applicability`) + rule conditions `regulatory_applicability` |
| Obligations | `obligations/index.json` |
| Controls | `controls/technical.json` |
| Rules (input + release) | `rules/index.json` (`phase`: `input` \| `output`) |
| Enforcement mappings | `mappings/enigma-enforcement.json` |
| Tests index | `tests/index.json` → `gateway/tests/unit/regulatory-packs.test.ts` |
| Compiler | `gateway/src/policy/enterprise/packs/hipaa/compile.ts` |
| Runtime interpreters | `gateway/src/policy/enterprise/packs/hipaa/pack-v2.ts` (`applyHipaaPackV3*`) |
| Compiled bundle | `gateway/src/policy/enterprise/packs/hipaa/compiled-bundle.ts` |

---

## 3. Semantic model mapping

| Spec distinction | HIPAA v3 implementation |
| --- | --- |
| health-sensitive ≠ PHI | Profile marks `ENIGMA_HEALTH_SENSITIVE_CONTEXT`; pack skip if not PHI |
| PHI → HIPAA applicability | `REGULATORY_APPLICABILITY:HIPAA` / `hipaaApplicable()` |
| PII ≠ PHI | EMAIL alone → PII; EMAIL + health context → PHI |
| LOCAL ≠ HIPAA approved | Reason `HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED` |
| TOKENIZE = Enigma option | `ENIGMA_TOKENIZE_SELECTED` · `requirement_type: IMPLEMENTATION_OPTION` |
| Detokenize = Enigma release | `ENIGMA_RELEASE_AUTHORIZED_DETOKENIZATION` |
| purpose unknown | Explicit `purpose=unknown` → `REVIEW` |

---

## 4. Classification profile layers

`applyHipaaClassificationProfile()` returns:

```text
detection: { entity_types, health_context, lexicon_hits }
classification: { sensitivity, health_sensitive }
regulatory: { applicability[], regulatory_classification? }
reason_codes[], profile_id
```

Bound in interrogation (`HybridDataInterrogator`); never authorizes.

---

## 5. Rules → decisions

| Rule id | Phase | Decision | Spec meaning |
| --- | --- | --- | --- |
| `HIPAA-R-INPUT-EXTERNAL-DENY` | input | DENY | PHI + external; controls not satisfied |
| `HIPAA-R-INPUT-WRITE-DENY` | input | DENY | PHI write/export/share |
| `HIPAA-R-INPUT-INSUFFICIENT-EVIDENCE` | input | REVIEW | Insufficient evidence / unknown purpose |
| `HIPAA-R-INPUT-CONTROLS-SATISFIED` | input | ALLOW_WITH_CONTROLS | Local/private **and** controls satisfied — not “compliant” |
| `HIPAA-R-INPUT-TOKENIZE-OPTION` | input | TRANSFORM→TOKENIZE | Enigma implementation option |
| `HIPAA-R-OUT-RESIDUAL-PHI-BLOCK` | output | BLOCK_OUTPUT | Residual plaintext PHI |
| `HIPAA-R-OUT-RELEASE-EVAL` | output | AUTHORIZED_DETOKENIZATION | Enigma release decides; gateway enforces |

---

## 6. Obligation → control → enforcement

| Obligation (regulatory) | Control (Enigma) | Enforcement actions |
| --- | --- | --- |
| `HIPAA-OBL-TRANSMISSION` | `ctrl_transmission_security` | `NO_EXTERNAL_TRANSMISSION`, `DENY` |
| `HIPAA-OBL-PHI-PROTECTION` | `ctrl_tokenization`, `ctrl_processing_environment` | `TOKENIZE`, `LOCAL_MODEL_ONLY` |
| `HIPAA-OBL-DISCLOSURE` | `ctrl_output_inspection`, `ctrl_authorized_release` | `BLOCK_OUTPUT`, `AUTHORIZE_DETOKENIZATION` |
| `HIPAA-OBL-AUDIT` | `ctrl_audit_logging` | `LOG_GOVERNANCE_EVENT` |

See `mappings/enigma-enforcement.json`.

---

## 7. Compilation → EPA

`compileHipaaPack()` produces:

- Pack snapshot policies for memory/default merge (`regulatoryPackExtras()`)
- Seed version records for `policy_versions` (`gateway/db/seed-epa.sql`)

Interpreters registered on `PackPolicyMeta.interpreter` and dispatched in `applyRegulatoryOverlays()`.

**No HIPAA-specific tables.** Uses generic EPA only.

---

## 8. Canonical scenarios (acceptance examples)

### Scenario A — Public cloud + PHI

```text
Classification = PHI
Applicability = HIPAA
Controls = not satisfied (unauthorized_external)
Decision = DENY (baseline PHI_PUBLIC_CLOUD_BLOCKED + HIPAA reinforce)
```

### Scenario B — Local + PHI + known purpose

```text
Classification = PHI
Applicability = HIPAA
Controls = satisfied
Decision = ALLOW (+ LOCAL_MODEL_ONLY, …)
Reason = HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED
```

**Do not label:** HIPAA compliant.

### Scenario C — Tokenized round trip

```text
PHI → ENIGMA_TOKENIZE_SELECTED → model sees tokens
→ inspect → ENIGMA_RELEASE_AUTHORIZED_DETOKENIZATION → gateway detokenizes
```

### Scenario D — Health-sensitive, not PHI

```text
health_sensitive = true
Applicability = (none)
HIPAA pack skipped
```

### Scenario E — Email

```text
EMAIL alone → PII
EMAIL + patient/clinical context → PHI + HIPAA applicability
```

### Scenario F — Explicit unknown purpose

```text
purpose = unknown → REVIEW
HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING
```

---

## 9. Source authority (HIPAA)

| Rank | Class | Examples in pack |
| --- | --- | --- |
| 1 | CFR | 45 CFR Parts 160 / 164 |
| 2 | HHS/OCR | De-identification guidance |
| 4 | NIST | SP 800-66r2 (implementation only) |

NIST must not alone authorize regulatory DENY.

---

## 10. How this proves pack independence

HIPAA behavior is produced by:

1. Pack content under `gateway/policy-packs/hipaa/`
2. Pack compiler + interpreter registration
3. Generic `PackBackedEnterprisePdp` overlay loop

The orchestrator does not contain HIPAA decision logic. Future packs (HITRUST, SOC 2, PCI, GDPR) follow the same pattern: content + compile + register interpreter — not a new PDP class.
