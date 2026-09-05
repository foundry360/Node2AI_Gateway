# Enigma Policy Pack Authoring Specification

**Status:** Normative platform contract  
**Reference implementation:** HIPAA Policy Pack v3 (`gateway/policy-packs/hipaa/`)  
**Runtime abstraction:** Generic EPA (`gateway/db/schema-epa.sql` + `PackBackedEnterprisePdp`)  
**Schema version:** `1.0.0`

---

## 1. Core principles

> **AGENT REASONS. POLICY DECIDES. GATEWAY ENFORCES.**

> **EVIDENCE → INTELLIGENCE → POLICY → DECISION → ENFORCEMENT → PROOF**

| Role | May do | Must never do |
| --- | --- | --- |
| **Agent / LLM** | Interpret context, explain policy, summarize evidence, assist reasoning | Independently decide ALLOW, DENY, ALLOW_WITH_CONTROLS, TOKENIZE, DETOKENIZE, LOCAL_MODEL_ONLY, RELEASE, BLOCK |
| **Policy engine (PDP)** | Deterministic evaluation of pack rules against facts | Invent regulatory authority; certify compliance |
| **Gateway (PEP)** | Enforce decisions (block, route, tokenize, detokenize, audit) | Reinterpret regulatory meaning |

Enigma is a **governance, policy decision, enforcement, and evidence** platform.  
It does **not** automatically certify that an organization is HIPAA / HITRUST / SOC 2 / PCI / GDPR compliant.

Prefer decision language:

`APPLICABLE` · `NOT_APPLICABLE` · `ALLOW` · `ALLOW_WITH_CONTROLS` · `DENY` · `REVIEW` · `CONFLICT` · `TOKENIZE` · `BLOCK_OUTPUT`

Avoid unless separately defined:

`COMPLIANT` · `CERTIFIED` · `HIPAA_APPROVED`

---

## 2. What is a Policy Pack?

A **Policy Pack** is a:

> versioned, deployable, machine-readable governance content layer that translates authoritative regulatory or organizational requirements into classifications, applicability conditions, obligations, controls, rules, enforcement mappings, evidence requirements, and deterministic policy decisions.

A Policy Pack is **not**:

- a RAG knowledge base or PDF corpus
- a prompt or LLM persona
- an assessment questionnaire
- a compliance certification
- hard-coded regulatory logic inside the orchestrator

### Platform equation

```text
Generic Runtime  +  Policy Pack  =  Regulatory / governance behavior
```

Adding a framework (HITRUST, SOC 2, PCI DSS, GDPR, …) should primarily add pack content and compile into the **generic EPA** model — not introduce `HipaaPdp`, `Soc2Gateway`, or framework-specific DB tables.

---

## 3. Compilation and runtime pipeline

Extracted from the current implementation:

```text
Policy Pack Docs-as-Code
        ↓  compile*(Pack) / seed
Generic EPA Model
  (policy_packs, epa_policies, policy_versions, …)
        ↓
PackBackedEnterprisePdp
  baseline interpreter → regulatory overlays → decision
        ↓
EnterprisePolicyAdapter / Gateway orchestrator
        ↓
Enforcement (block / tokenize / route / release / detokenize)
        ↓
Audit / Proof
```

**Reference paths**

| Layer | Location |
| --- | --- |
| Docs-as-code packs | `gateway/policy-packs/<pack>/` |
| Compiler (HIPAA ref) | `gateway/src/policy/enterprise/packs/hipaa/compile.ts` |
| EPA schema | `gateway/db/schema-epa.sql` |
| PDP | `gateway/src/policy/enterprise/pack-pdp.ts` |
| Overlay dispatch | `gateway/src/policy/enterprise/packs/regulatory.ts` |
| Facts / interpreters | `gateway/src/policy/enterprise/packs/baseline.ts` |
| Lifecycle | `gateway/src/policy/enterprise/lifecycle.ts` |

---

## 4. Standard pack directory structure

**Canonical target** (adapt names to existing packs; do not create parallel trees):

```text
gateway/policy-packs/<pack_id_short>/
├── manifest.json
├── sources/                 # primary / guidance / implementation
│   └── index.json           # authority hierarchy + catalog
├── ontology/
│   └── index.json
├── definitions/
│   └── *.json
├── classifications/
│   └── *.json               # Detection → Classification → Applicability
├── obligations/
│   └── index.json
├── controls/
│   └── *.json               # Enigma implementation options
├── rules/
│   └── index.json           # input + output / release rules
├── mappings/
│   └── enigma-enforcement.json
└── tests/
    └── index.json
```

**HIPAA v3 note:** Applicability, release, evidence, and enforcement live inside classification profile, rules (phase=`output`), mappings, and reason-code evidence — not as separate top-level folders yet. New packs may add `applicability/`, `release/`, `evidence/`, `enforcement/` when content warrants it; they must still compile into EPA + interpreters, not a second runtime.

---

## 5. Manifest contract

Machine-readable schema: `gateway/policy-packs/schema/manifest.schema.json`

### Required fields

| Field | Immutable after activate? | Notes |
| --- | --- | --- |
| `pack_id` | Yes | Stable id, e.g. `pack_hipaa` |
| `name` | No (display) | Display name, e.g. `HIPAA` |
| `pack_version` | Versioned | Semver pack content version |
| `status` | Lifecycle | `draft` \| `active` \| `retired` |
| `domain` | Prefer stable | Catalog domain key (`hipaa`, `pci`, …) |
| `scope` | Prefer stable | e.g. `AI_DATA_GOVERNANCE` |
| `not` | Prefer stable | Explicit non-claims (e.g. not a certification) |
| `interpreters.input` / `.output` | Versioned | Registered PDP interpreter ids |
| `policies[]` | Versioned | `policy_id`, `version`, `phase`, `name` |
| `classification_profile_id` | Versioned | Bound profile id |

### Recommended / optional

| Field | Notes |
| --- | --- |
| `description` | Human summary |
| `authority` | Primary authority label (e.g. HHS/OCR) |
| `jurisdiction` | e.g. `US` |
| `effective_date` | Pack effective date |
| `supersedes` | Prior pack_version |
| `source_hierarchy` | Pointer to sources/index hierarchy |
| `compiler_version` / `schema_version` | Tooling compatibility |
| `compatibility` | Preserved policy_ids; prior version suspension |
| `semantic_notes` | Non-normative author guidance |

`pack_id` and historical `policy_version_id` / `content_hash` rows must remain reproducible.

---

## 6. Source authority model

Formal hierarchy (from HIPAA `sources/index.json`, generalized):

| Rank | Class | Role |
| --- | --- | --- |
| 1 | Primary authority | Enacted law / CFR / official regulatory text |
| 2 | Official regulatory guidance | Agency OCR / official interpretations |
| 3 | Other official federal guidance | Non-primary federal guidance |
| 4 | Implementation guidance | NIST and similar — **not** legal authority alone for DENY |
| 5 | Recognized standards | HITRUST, PCI DSS, ISO, industry frameworks |
| 6 | Secondary | Consultants, educational material |

**Rules**

- Lower-tier sources must **never** silently override higher-tier sources.
- Distinguish **legal authority**, **implementation guidance**, and **secondary interpretation**.
- Never invent citations.
- Derived Enigma rules must set `source_type` / `requirement_type` = `DERIVED_CONTROL` (or equivalent) and cite underlying authority.

---

## 7. Ontology contract

Ontology entities describe concepts Enigma needs to evaluate (actors, data, systems, actions, contexts).

**Minimum entity fields** (HIPAA v3 shape):

`stable_id` · `canonical_name` · `entity_type` · `description` · `aliases` · `parent` · `relationships` · `source_references` · `version` · `status` · `definition_type`

### Regulatory concepts

Examples: PHI, ePHI, Covered Entity, Business Associate, Limited Data Set.

`definition_type`: `REGULATORY_DEFINITION`

### Enigma operational concepts

Examples: health-sensitive, local model, tokenized, gateway-controlled release, AI agent.

`definition_type`: `ENIGMA_OPERATIONAL_DEFINITION`

Do **not** present Enigma mechanisms (TOKENIZE, LOCAL_MODEL_ONLY) as regulatory requirements unless the authoritative source explicitly requires that mechanism.

---

## 8. Definition contract

Every regulatory definition should include:

| Field | Required |
| --- | --- |
| `definition_id` / `id` | Yes |
| `canonical_term` / `name` | Yes |
| `definition` / `canonical_definition` | Yes |
| `definition_type` | Yes — `REGULATORY_DEFINITION` \| `ENIGMA_OPERATIONAL_DEFINITION` |
| `authority` | Yes for regulatory |
| `citation` / `sources` | Yes for regulatory |
| `version` | Yes |
| `related_entities` | Recommended |
| `source_url`, `effective_date` | Optional |
| `note` | Optional — paraphrase / non-claim markers |

LLM-generated text must never become authoritative pack content without an explicit source and human review.

---

## 9. Classification contract

**Mandatory pipeline:**

```text
DETECTION → CLASSIFICATION → REGULATORY APPLICABILITY
```

| Layer | Answers |
| --- | --- |
| Detection | What evidence was found? (entities, lexicon hits, spans) |
| Classification | What does Enigma believe the data represents? (PII, PHI, Credential, …) |
| Regulatory applicability | Which pack frameworks potentially apply? (e.g. `HIPAA`) |

Classification is **not** authorization.

### Semantic distinctions (normative)

| Concept | Kind | Meaning |
| --- | --- | --- |
| **health-sensitive** | Enigma operational | May warrant Enigma controls; **≠** HIPAA applies |
| **PHI** | Regulatory (+ Enigma sensitivity) | Can trigger HIPAA applicability when context warrants |
| **PII** | General classification | **≠** automatically PHI |
| **LOCAL / PRIVATE** | Environment characteristic | **≠** regulatory approval / “HIPAA compliant” |
| **Credential** | Sensitivity | Must not be elevated away into PHI |

---

## 10. Applicability layer

**Do not collapse classification and applicability.**

```text
Fact → Classification (e.g. PHI)
    → Context (purpose, actor, env, …)
    → Regulatory Applicability (e.g. HIPAA = true|false)
    → Obligations → Rules → Decision
```

A pack must be able to express:

> A detected concept exists, but this regulatory framework does **not** apply.

HIPAA reference: health-sensitive without PHI → pack skip (`hipaa_pack_v3_skip_health_sensitive_not_phi`).

---

## 11. Purpose (first-class context)

Purpose is part of the **generic** policy context (`PolicyContext.purpose` / `BaselineFacts.purpose`), not HIPAA-only runtime.

Illustrative values (packs may extend; do not hard-code into core orchestrator):

`treatment` · `payment` · `healthcare_operations` · `utilization_management` · `prior_authorization` · `care_management` · `claims_processing` · `provider_operations` · `customer_support` · `analytics` · `research` · `marketing` · `administrative` · `unknown`

**Normative behavior**

- Missing / omitted purpose may be handled per pack rules (HIPAA v3: omitted ≠ silent UNKNOWN).
- Explicit `purpose = unknown` must **not** silently become ALLOW; typically `REVIEW` or another conservative outcome.

---

## 12. Generic policy context

From `PolicySubject` / `PolicyResource` / `PolicyContext` / `PolicyAIContext` / `PolicyEvidence` and `BaselineFacts`:

| Attribute | Typical role |
| --- | --- |
| subject (user/app/agent, roles, trust) | Authoritative identity |
| resource / classification | Authoritative or derived from interrogation |
| action / operation | Authoritative request |
| purpose | Optional; unknown must be explicit |
| recipient | Optional |
| source / source_system | Optional |
| environment / deployment_mode | Authoritative |
| authorization / authorization_context | Optional |
| processing_location | Optional / derived |
| model / available_models | Authoritative request + catalog |
| application / tenant | Authoritative |
| evidence (entities, reason_codes, tokens) | Derived from interrogation / inspection |

**Unknown must be represented explicitly. Do not fabricate missing context.**

---

## 13. Obligation vs control vs enforcement

```text
Regulatory obligation
        ↓
Applicable condition
        ↓
Enigma control (implementation option)
        ↓
Enforcement action (gateway)
```

| Term | Meaning | Examples |
| --- | --- | --- |
| **Obligation** | What authority requires/prohibits | Protect ePHI; transmission security; audit controls |
| **Control** | Enigma mechanism that may satisfy an obligation | TOKENIZE, LOCAL_MODEL_ONLY, REQUIRE_HUMAN_REVIEW |
| **Enforcement** | Gateway execution of a decision | Block request; vault tokenize; restrict routing; detokenize |

`requirement_type` vocabulary:

- `REGULATORY_REQUIREMENT`
- `DERIVED_CONTROL`
- `IMPLEMENTATION_OPTION`

Avoid implying `HIPAA → TOKENIZE` or `HIPAA → LOCAL_MODEL_ONLY` as mandates unless an authoritative source establishes that outcome.

---

## 14. Rule contract

Rules are the deterministic bridge:

```text
context + classification + applicability + obligations + controls
        → policy decision
```

A rule should carry enough metadata to answer:

- What triggered it?
- Which classification / applicability?
- Which obligation / control?
- Which authority / sources?
- Which policy version / interpreter?
- What decision and evidence?

HIPAA reference fields: `rule_id`, `phase`, `priority`, `conditions`, `decision`, `reason_codes`, `obligation_ids`, `control_ids`, `enigma_obligations`, `sources`, `source_type` / `requirement_type`, `note`.

---

## 15. Input vs output policy

**Input authorization does not imply output release.**

```text
INPUT → policy eval → (optional transform) → model
OUTPUT → inspect → baseline output → pack output/release → enforce → audit
```

Residual plaintext sensitive data remains subject to output/release policy.  
Detokenization requires independent release-condition evaluation.

---

## 16. Tokenization semantics

TOKENIZE is an **Enigma implementation option**.

```text
Regulatory obligations
        ↓
Enigma release / transform policy
        ↓
Release / transform conditions satisfied
        ↓
Gateway tokenize or detokenize
```

Preferred reason-code style:

- `HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED` (controls satisfied — **not** “compliant”)
- `ENIGMA_TOKENIZE_SELECTED`
- `ENIGMA_RELEASE_AUTHORIZED_DETOKENIZATION`

Do **not** describe the regulator as issuing detokenization.

---

## 17. Precedence and conflicts

```text
Enterprise Baseline
        ↓ (may further restrict; never weaken DENY)
Regulatory Pack overlays
        ↓
Tenant / Application policy (future)
```

- Overlays **must not weaken** a prior DENY (HIPAA: `*_reinforces_deny`).
- Conflicts → **fail closed** → audit → REVIEW / DENY as configured.
- Conflict recording model: EPA `policy_conflicts` table (generic).

No framework-specific conflict engine.

---

## 18. Evidence chain

```text
FACT → CLASSIFICATION → REGULATORY APPLICABILITY → POLICY → RULE
  → OBLIGATION → CONTROL → DECISION → ENFORCEMENT → AUDIT / PROOF
```

**Minimum reconstructability**

- pack_id, policy_id, policy_version
- rule_ids / matched conditions
- obligation_ids / control_ids / source refs where available
- decision + reason_codes
- evidence in (classification, entities, purpose, …)
- timestamp / evaluation_id (EPA `policy_evaluations`)

---

## 19. Versioning and lifecycle

| Concept | Behavior |
| --- | --- |
| Pack / policy versions | Immutable once activated (content_hash + rules) |
| Activation | New version becomes `active`; prior may be `suspended` |
| Suspension / retirement | Lifecycle status only — do not rewrite historical content |
| Supersession | Manifest `compatibility` / changelog |
| Rollback | Reactivate prior version id; do not mutate it |
| Audit | `policy_approvals`, evaluations, content_hash |

EPA tables: `policy_packs`, `epa_policies`, `policy_versions`, `policy_scopes`, `policy_obligations`, `classification_labels`, `policy_tests`, `policy_evaluations`, `policy_conflicts`, `policy_approvals`.

---

## 20. Testing contract

Every pack should provide (or map to) tests for:

| Category | Examples |
| --- | --- |
| Classification | positive / negative / contextual / ambiguous |
| Applicability | applicable / not applicable / unknown context |
| Policy | ALLOW / DENY / ALLOW_WITH_CONTROLS / REVIEW / conflict |
| Enforcement | tokenize / deny / local routing / release / detokenize |
| Regression | prior pack versions remain behaviorally testable |

Runtime suites live under `gateway/tests/`; pack-level index under `tests/index.json`.

---

## 21. Extensibility (future packs)

Conceptual packs that must fit **without** core orchestrator forks:

`HIPAA` · `HITRUST` · `SOC 2` · `PCI DSS` · `GDPR` · `NIST` · `FedRAMP`

**Add primarily**

sources · ontology · definitions · classifications · applicability · obligations · controls · rules · mappings · tests · compiler registration · EPA seed versions

**Core runtime changes** only when the generic contract is insufficient (new context field, new decision code, etc.) — exceptional and justified.

---

## 22. Design Q&A (normative answers)

1. **What is a Policy Pack?** — See §2.  
2. **Source vs rule?** — Source is authority material; rule is deterministic executable derived (or required) from sources.  
3. **Definition vs ontology?** — Definition is authoritative term text; ontology is the concept graph Enigma evaluates.  
4. **Classification vs applicability?** — What it is vs whether a framework applies.  
5. **Obligation vs control?** — Required/prohibited by authority vs Enigma mechanism.  
6. **Control vs enforcement?** — Selected mechanism vs gateway action.  
7. **How does policy become executable?** — Docs-as-code → compiler → EPA versions → interpreter → PDP.  
8. **Conflicts?** — Fail closed; regulatory cannot be weakened by lower tiers.  
9. **Versioning?** — Immutable activated versions; suspend/supersede, don’t rewrite.  
10. **Audit?** — Evaluation records + matched chain + content_hash.  
11. **New framework?** — New pack content + compile/seed; avoid framework PDPs.  
12. **Unknown context?** — Explicit unknown; conservative REVIEW/DENY per pack.  
13. **LLM not authority?** — LLM never emits ALLOW/DENY/…; PDP owns decisions.  
14. **Independent output?** — Separate output phase/policies; input ≠ release.  
15. **Authority vs guidance?** — Source ranks; NIST etc. cannot alone invent legal DENY.

---

## 23. Related documents

- [HIPAA v3 Reference Mapping](./HIPAA_V3_REFERENCE_MAPPING.md)
- [Pack authoring README](../../gateway/policy-packs/README.md)
- [HIPAA evaluation traces](../enigma/hipaa-pack-v2.md)
- [EPA evaluation contract](../enigma/policy-evaluation-contract.md)
- [EPA data model](../enigma/policy-data-model.md)
- [Policy lifecycle](../enigma/policy-lifecycle.md)
