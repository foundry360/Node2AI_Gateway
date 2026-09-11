# ONC HTI-1 Predictive DSI (Thin) — Healthcare Pack #3

**Pack ID:** `pack_onc_hti1`  
**Version:** 1.0.0  
**Domain:** healthcare  
**Authority:** `auth_onc_hti1`

## Purpose

Operationalize selected ONC HTI-1 Final Rule concepts for **predictive decision support / algorithm transparency** as executable Enigma runtime policies.

Enigma provides executable governance controls **aligned to** applicable ONC/HTI-1 concepts. It does **not** represent itself as a legal compliance determination or substitute for ONC certification or legal/regulatory analysis.

## Applicability gate

Controls apply only when:

1. Request includes `REGULATORY_APPLICABILITY:ONC_HTI1`, **and**
2. `governance_context.predictive_dsi.applicability` is not `not_applicable`

Healthcare + AI alone does **not** imply HTI-1 applicability.

## Runtime context

```
Request
  → classification.reason_codes includes REGULATORY_APPLICABILITY:ONC_HTI1
  → governance_context.predictive_dsi { applicability, algorithm/model, intended use, FAVES, … }
  → onc_hti1_pack_v1 / onc_hti1_pack_v1_output
  → Decision (ALLOW | DENY | REVIEW) + obligations
  → Gateway enforcement (REVIEW → human-resolution hold)
  → policy_evaluations provenance
```

## Policies (rules)

| Rule | Purpose | Typical decision |
|------|---------|------------------|
| ONC-R-DSI-IDENTITY | High-risk clinical predictive identity | DENY |
| ONC-R-DSI-UNSUPPORTED-CONTEXT | Clinical predictive without identity | REVIEW |
| ONC-R-DSI-UNKNOWN-APPLICABILITY | Unknown HTI-1 applicability + high-risk clinical | REVIEW |
| ONC-R-DSI-INTENDED-USE | Clinical predictive intended use | REVIEW |
| ONC-R-DSI-TRANSPARENCY | High-risk transparency / source attributes | REVIEW |
| ONC-R-DSI-FAVES | High-risk FAVES evidence | REVIEW |
| ONC-R-DSI-RISK-MANAGEMENT | High-risk risk-management evidence | REVIEW |
| ONC-R-DSI-HUMAN-OVERSIGHT | High-risk clinical human oversight | REVIEW |
| ONC-R-DSI-VERSION-GOVERNANCE | Stale / changed version governance | REVIEW |
| ONC-R-DSI-CONTROLS-SATISFIED | Evidence satisfied | ALLOW |
| ONC-R-DSI-OUT-RELEASE | Output release when controls satisfied | ALLOW |

## Source traceability

- `regulatory_reference`: 89 FR 1192 (HTI-1) — Predictive DSI / algorithm transparency / FAVES concepts (`src_onc_hti1`)
- Runtime gates and outcomes are **ENIGMA_HEURISTIC** interpretations of those concepts, not the regulatory text itself

## Deliberately not implemented

- Full ONC Health IT Certification Program
- Complete HTI-1 source-attribute catalog
- Information Blocking as a regulatory program
- USCDI / FHIR interoperability enforcement
- CMS / Prior Authorization
- Legal compliance determinations
- Complete model registry or AI risk-management platform
