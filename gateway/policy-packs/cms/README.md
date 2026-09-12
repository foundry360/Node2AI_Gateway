# CMS Interoperability & AI Governance (Thin) — Healthcare Pack #4

**Pack ID:** `pack_cms`  
**Version:** 1.0.0  
**Domain:** healthcare  
**Authority:** `auth_cms`

## Purpose

Operationalize selected CMS interoperability, access, prior-authorization workflow, API/FHIR, data-exchange, and AI/agent governance concepts as executable Enigma runtime policies.

Enigma provides executable governance controls **aligned to** applicable CMS concepts. It does **not** represent itself as a legal compliance determination or substitute for CMS certification or legal/regulatory analysis.

## Policy families

- Applicability
- Patient Access
- Provider Access
- Payer-to-Payer
- Prior Authorization (one family — not the entire pack)
- API / FHIR Governance
- Data Exchange
- AI / Agent Governance

## Applicability gate

Controls apply only when:

1. Request includes `REGULATORY_APPLICABILITY:CMS`, **and**
2. `governance_context.healthcare_interop.applicability` is not `not_applicable`

Healthcare + AI alone does **not** imply CMS applicability.  
`unknown` does **not** auto-REVIEW; restrictive rules require `applicable`.

## Runtime context

```
Request
  → REGULATORY_APPLICABILITY:CMS
  → governance_context.healthcare_interop { workflow, authz, scope, PA stage, API/FHIR, … }
  → cms_pack_v1 / cms_pack_v1_output
  → Decision + obligations
  → Gateway enforcement
  → policy_evaluations provenance
```

## Deliberately not implemented

- Complete CMS regulatory universe
- Full Prior Authorization product / CRD/DTR/PAS
- Complete FHIR specification
- CMS certification / legal compliance determinations
- Separate CMS PDP, audit store, or UI
