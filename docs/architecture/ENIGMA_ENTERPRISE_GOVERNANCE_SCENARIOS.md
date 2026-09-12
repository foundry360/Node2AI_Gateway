# Enigma Enterprise Governance Scenario Validation

These scenarios validate Enigma's runtime governance architecture. They do not constitute legal or regulatory certification.

## 1. Purpose

The Enterprise Governance Scenario Validation Suite proves that Enigma's existing architecture correctly carries a governed AI request through the full journey:

**Identity → Context → Policy Evaluation → Decision → Consequence Resolution → Obligation → Enforcement → Evidence**

This is a validation milestone. It does **not** introduce a new policy engine, regulatory pack, healthcare PDP, or parallel enforcement path.

## 2. Scenario catalog

Automated tests live under `gateway/tests/scenarios/`. Related scenarios are consolidated into coherent files (rather than one file per title) while covering the full catalog:

| # | Scenario | File | Expected outcome |
|---|----------|------|------------------|
| 1 | Authorized Clinical AI | `clinical-ai-governance.test.ts` | ALLOW |
| 2 | Clinical AI excessive data | `clinical-ai-governance.test.ts` | REDACT / TOKENIZE (HIPAA minimum necessary) |
| 3 | Unauthorized Clinical AI | `clinical-ai-governance.test.ts` | DENY |
| 4 | Unknown / missing purpose | `clinical-ai-governance.test.ts` | REVIEW |
| 5 | Unauthorized Agent | `clinical-ai-governance.test.ts` | DENY |
| 6 | Unauthorized Tool | `clinical-ai-governance.test.ts` | DENY |
| 7 | CMS Patient Access | `cms-ai-governance.test.ts` | ALLOW |
| 8 | CMS Patient Access unauthorized app | `cms-ai-governance.test.ts` | DENY |
| 9 | CMS data scope restriction | `cms-ai-governance.test.ts` | TOKENIZE |
| 10 | Prior Authorization unauthorized submission | `cms-ai-governance.test.ts` | DENY |
| 11 | ONC HTI-1 incomplete governance evidence | `cross-domain-governance.test.ts` | REVIEW |
| 12 | HIPAA + CMS both satisfied | `cross-domain-governance.test.ts` | ALLOW |
| 13 | HIPAA DENY + CMS ALLOW | `cross-domain-governance.test.ts` | DENY (`CONSEQUENCE_DENY`) |
| 14 | HIPAA TRANSFORM + CMS ALLOW | `cross-domain-governance.test.ts` | REDACT / TOKENIZE survives |
| 15 | Model authorization (ineligible) | `model-authorization.test.ts` | DENY / `MODEL_NOT_ELIGIBLE` |
| 16 | Authorized model execution | `model-authorization.test.ts` | ALLOW + executed ∈ eligible |
| 17 | Historical governance evidence | `model-authorization.test.ts` | Durable evidence chain |
| 18 | Gateway enforcement mismatch | `model-authorization.test.ts` | UNKNOWN (not false VERIFIED) |

Helpers: `gateway/tests/scenarios/helpers.ts` (test-only fixtures; production EPA/Gateway only).

## 3. Expected governance journey

Every scenario asserts more than the final decision. Where applicable, tests verify:

1. Identity (user / application)
2. AI / agent context
3. Purpose
4. Authorization context
5. Resource / data scope
6. Applicable policy domains
7. Individual pack contributions
8. Final resolved decision
9. Obligations
10. Eligible model set
11. Gateway enforcement result
12. Whether model execution occurred
13. Audit evidence
14. Correlation of `request_id` ↔ `evaluation_id` ↔ contributions ↔ audit ↔ model/provider
15. Historical evaluation reproduces evidence **without recalculating** the decision

## 4. Architecture being validated

```text
HIPAA / Part 2 / ONC / CMS
        ↓
shared Enterprise Policy Architecture (overlays → packs)
        ↓
shared PackBackedEnterprisePdp
        ↓
shared resolvePackContributions (consequence resolution)
        ↓
one final decision + obligations + eligible_models
        ↓
one Model Gateway enforcement path
        ↓
one evidence trail (policy_evaluations + Gateway audit)
```

Invariant: **Agent reasons · Policy decides · Gateway enforces.**

Scenarios call the same production evaluation and enforcement paths used by normal requests (`PackBackedEnterprisePdp.evaluateLegacyRequest`, `orchestrator.completions`, Model Gateway `executeApproved`).

## 5. Cross-domain composition

Scenarios 12–14 prove multi-pack contribution retention and single decision resolution:

- Both HIPAA and CMS contributions are preserved when both apply.
- One `evaluation_id`, one enforcement projection, no duplicate PDP.
- Restrictive consequences win: HIPAA DENY + CMS ALLOW → DENY with `basis = CONSEQUENCE_DENY` (not REVIEW; no human override of DENY).
- Restrictive transforms (HIPAA minimum necessary REDACT/TOKENIZE) survive CMS ALLOW.

Not-applicable CMS/ONC must not contribute a false ALLOW when suspended or marked not applicable.

## 6. Model authorization evidence

Tests distinguish:

| Concept | Meaning |
|---------|---------|
| **Available** | Registered and active in the model registry |
| **Eligible** | Authorized by the policy decision (`restrictions.eligible_models`) |
| **Selected** | Chosen by the Model Gateway |
| **Executed** | Provider/model that actually ran |

Invariant: `selected_model ∈ eligible_models`. An ineligible or disabled model must not execute (`MODEL_NOT_ELIGIBLE` / Gateway error).

Historical evaluations persist `restrictions.eligible_models` (including `[]` on DENY/REVIEW) and hydrate without recalculation from current policy state.

## 7. Enforcement verification

Policy correctness alone is not success. Scenario 18 constructs a controlled mismatch between an ALLOW evaluation and Gateway audit evidence and expects enforcement verification `UNKNOWN` (or the existing canonical unverified state)—not a false claim of successful enforcement.

Blocked requests must not release model output. Successful requests must execute only an eligible model. REVIEW must hold rather than silently ALLOW.

## 8. Historical evidence

After a governed request, scenarios retrieve:

- durable `policy_evaluations` record
- correlated Gateway audit event

and assert that historical evidence establishes what was requested, which policies applied, the decision, obligations, eligible models, selected model, provider, and enforcement—**without** re-running policy against current pack state.

## 9. Test results

Run:

```bash
cd gateway
npx vitest run tests/scenarios
npx vitest run
npx tsc --noEmit
```

Results are recorded in the completion report for the change that introduced or updated the suite. Re-run before treating the suite as green on a new branch.

## 10. Known limitations

- Scenarios use synthetic healthcare context and local/stub models only—no Salesforce, Epic, CMS, ONC, or cloud provider network calls.
- Outcomes assert **current pack semantics** (e.g. HIPAA minimum necessary may resolve to `REDACT` rather than `TOKENIZE`). Scenarios accept the existing canonical transform; they do not invent a new transformation mechanism.
- Live output-path tests avoid prompt text that the local stub echoes as residual PHI; input-path PDP scenarios still cover PHI classification fixtures.
- AI-risk packs (NIST/OWASP/EU/ISO/SOC2/etc.) are suspended in PDP fixtures so healthcare domain behavior is isolatable—the same pattern used by existing pack unit tests.
- The suite does **not** certify HIPAA, CMS Interoperability, ONC HTI-1, or Part 2 compliance.
- Organization of files consolidates recommended titles (`payer-ai-governance`, `patient-access-ai`, etc.) into domain-coherent files; coverage of the catalog is complete.

## Related documents

- [POLICY_CONSEQUENCE_RESOLUTION.md](./POLICY_CONSEQUENCE_RESOLUTION.md)
- [HEALTHCARE_POLICY_DOMAIN.md](./HEALTHCARE_POLICY_DOMAIN.md)
- [HEALTHCARE_POLICY_PACKS.md](./HEALTHCARE_POLICY_PACKS.md)
- [HEALTHCARE_POLICY_RESOLUTION.md](./HEALTHCARE_POLICY_RESOLUTION.md)
