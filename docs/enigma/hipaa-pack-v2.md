# HIPAA Pack v3.1 — Architecture & Evaluation Traces

**Pack:** `pack_hipaa` · **Version:** 3.1.0  
**Interpreters:** `hipaa_pack_v3` / `hipaa_pack_v3_output`  
**Classification profile:** `hipaa_class_profile_v3`  
**Policies:** `pol_hipaa_phi_local` v3 · `pol_hipaa_release` v2  

Historical versions (`pv_pol_hipaa_phi_local_v1`, `pv_pol_hipaa_v2`, `pv_pol_hipaa_release_v1`) remain **immutable** and suspended.

**Scope:** AI / data governance for PHI — **not** a HIPAA compliance certification.

**v3.1:** Provenance & evidence hardening — decisions carry Rule → Obligation → Exact Citation → Source → Authority Tier without changing decision semantics.

## Semantic model

| Concept | Kind | Meaning |
| --- | --- | --- |
| **health-sensitive** | Enigma operational | Health-related context that may warrant Enigma controls. **Not** a legal HIPAA classification. |
| **PHI** | Regulatory + Enigma sensitivity | Triggers HIPAA pack applicability. |
| **LOCAL / PRIVATE** | Enigma environment control | May help satisfy processing controls. **≠ HIPAA approved / compliant.** |

Layers on every classification profile result:

1. **DETECTION** — entities, lexicon hits  
2. **CLASSIFICATION** — Enigma sensitivity + health_sensitive flag  
3. **REGULATORY APPLICABILITY** — e.g. `HIPAA` when PHI evidence warrants it  

Classification evidence distinguishes **ENIGMA_HEURISTIC** elevation from **regulatory_reference** (e.g. `45 CFR 160.103`).

## Requirement types

| Type | Meaning |
| --- | --- |
| `REGULATORY_REQUIREMENT` | Obligation grounded in CFR/HHS |
| `DERIVED_CONTROL` | Enigma-derived rule from regulatory material |
| `IMPLEMENTATION_OPTION` | Enigma mechanism (TOKENIZE, LOCAL_MODEL_ONLY, detokenize, …) |

## Evidence chain

```
FACT → CLASSIFICATION → REGULATORY APPLICABILITY → POLICY → RULE
  → OBLIGATION → EXACT CITATION → SOURCE → AUTHORITY TIER
  → DECISION → CONTROL → ENFORCEMENT → AUDIT
```

Structured on `PolicyDecision.explanation.provenance` and persisted in `policy_evaluations.explanation`.

Matched breadcrumbs include `rule_id`, `obligation:…`, `control:…`, `source:…`, `requirement_type:…`.

---

## Scenario A — Public cloud (utilization management)

**Evidence:** Patient + MRN + clinical information → **PHI**, HIPAA applicable.  
**Purpose:** `utilization_management`  
**Environment:** public cloud model  

| Step | Result |
| --- | --- |
| Identify | PHI + `REGULATORY_APPLICABILITY:HIPAA` |
| Baseline | `DENY` · `PHI_PUBLIC_CLOUD_BLOCKED` |
| HIPAA v3 | Reinforces deny · controls not satisfied for external env |
| Enforce | Nothing sent · audit |

**Decision:** `DENY`  
**Language:** Applicable controls **not** satisfied — **not** “HIPAA violation certificate.”

---

## Scenario B — Local/private + controls satisfied

Same PHI. Purpose: `utilization_management`. Environment: local model. Trusted clinical clinician.

| Step | Result |
| --- | --- |
| Identify | PHI |
| Baseline | `ALLOW` · local eligible |
| HIPAA v3 | `HIPAA-R-INPUT-CONTROLS-SATISFIED` |
| Reason | `HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED` |
| Enforce | Model runs · output inspected independently · audit |

**Decision:** `ALLOW` with Enigma obligations (`LOCAL_MODEL_ONLY`, …)  

**Do not say:** “HIPAA compliant.”  
**Do say:** “Applicable HIPAA policy controls satisfied for this evaluation.”

---

## Scenario C — Tokenized round trip

| Step | Owner |
| --- | --- |
| Identify → TOKENIZE | Enigma implementation option (`ENIGMA_TOKENIZE_SELECTED`) |
| Model receives/returns tokens | Gateway / model |
| Inspect output | Inspector |
| Release policy | Enigma (`HIPAA-R-OUT-RELEASE-EVAL`) informed by HIPAA obligations |
| `ENIGMA_RELEASE_AUTHORIZED_DETOKENIZATION` | Policy decides |
| Detokenize | **Gateway enforces** |

HIPAA itself does **not** issue the detokenization command.

Residual plaintext PHI → `HIPAA_PHI_OUTPUT_NOT_AUTHORIZED` / `BLOCK_OUTPUT`.

Explicit `purpose=unknown` → `REVIEW` · `HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING` (never silently approved).

---

## Activate path

1. Docs-as-code: `gateway/policy-packs/hipaa/`  
2. `compileHipaaPack()` → EPA versions `pv_pol_hipaa_v3`, `pv_pol_hipaa_release_v2`  
3. Suspend prior active versions without mutating their content hashes/rules  
4. PDP overlays via `listActiveOverlays(phase)`  

No HIPAA-specific database tables. Reusable for HITRUST / SOC2 / PCI / GDPR packs.
