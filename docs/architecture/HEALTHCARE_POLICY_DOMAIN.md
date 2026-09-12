# Healthcare Policy Domain — Architecture Contract

**Status:** Active  
**Invariant:** Agent reasons · Policy decides · Gateway enforces  
**Reference packs:** HIPAA Policy Pack **v3.1.0** (`pack_hipaa`); 42 CFR Part 2 **v1.0.0** (`pack_42_cfr_part_2`); ONC HTI-1 Thin Pack **v1.0.0** (`pack_onc_hti1`); CMS Interoperability Thin Pack **v1.0.0** (`pack_cms`)

Enigma is a **runtime governance and policy enforcement platform**. It is not a HIPAA, Part 2, ONC, or CMS assessment app, compliance checklist, regulatory document repository, or healthcare use-case library.

```text
Regulation → Policy → Decision → Enforcement → Evidence
```

---

## 1. What is a domain?

A **domain** is a business/regulatory governance area.

| Field | Example |
| --- | --- |
| `domain_id` | `healthcare` |
| `name` | Healthcare |
| `status` | `active` |
| `pack_ids` | `["pack_hipaa", "pack_42_cfr_part_2", "pack_onc_hti1", "pack_cms", …]` |

The Healthcare Domain is **not** a policy pack. It holds membership, shared governance concepts, and cross-pack resolution contracts. It does not contain CFR text or executable HIPAA rules.

Runtime type: `PolicyDomain` in `gateway/src/policy/enterprise/domain.ts`.

---

## 2. What is a policy pack?

A **policy pack** is a versioned regulatory authority/framework authored as docs-as-code and compiled into EPA policies.

| Layer | Owner |
| --- | --- |
| Sources, definitions, obligations, rules, controls, tests | **Pack** |
| Domain identity, pack membership, cross-pack resolution concepts | **Domain** |
| Provenance graph, overlay registry, PDP, gateway | **Platform (generic)** |

HIPAA v3.1 is Pack #1 under Healthcare. 42 CFR Part 2 v1.0 is Pack #2. ONC HTI-1 Thin Pack v1.0 is Pack #3. CMS Interoperability Thin Pack v1.0 is Pack #4. Future packs (HITECH, …) are **not** implemented here. See [HEALTHCARE_POLICY_PACKS.md](./HEALTHCARE_POLICY_PACKS.md).

Enigma provides executable governance controls aligned to applicable CMS and ONC/HTI-1 concepts. It does not represent itself as a legal compliance determination or substitute for CMS/ONC certification or legal/regulatory analysis.

---

## 3. Layer vocabulary

| Concept | Meaning |
| --- | --- |
| **Domain** | Governance area (`healthcare`) |
| **Policy Pack** | Regulatory authority (`pack_hipaa`) |
| **Policy** | Versioned EPA policy (`pol_hipaa_phi_local` v3) |
| **Rule** | Executable condition → decision |
| **Obligation** | Regulatory requirement represented by the pack |
| **Control** | Enigma implementation option (TOKENIZE, LOCAL_MODEL_ONLY, …) |
| **Enforcement** | Gateway action from the decision |

```text
REGULATORY OBLIGATION → ENIGMA CONTROL → GATEWAY ENFORCEMENT
```

Controls are never presented as if HIPAA (or any authority) literally mandated TOKENIZE/LOCAL.

---

## 4. Domain vs pack responsibilities

### Healthcare Domain owns

- Domain identity and membership (`pack_ids`)
- Cross-pack applicability / precedence / conflict **concepts**
- Shared platform provenance expectations
- Domain-level configuration hooks (future)

### Individual packs own

- Regulatory sources and citations
- Authority-specific definitions and classifications
- Applicability conditions
- Obligations, rules, control mappings, tests
- Pack-level provenance content

Do **not** move HIPAA-specific content into the domain “to share it.”

### Explicitly out of scope for the domain

Do **not** build a giant healthcare ontology (clinical entities, payer/provider models, SNOMED/ICD catalogs, workflow libraries). The domain answers:

> Which healthcare policies apply to this request?

Not:

> How do we model healthcare?

---

## 5. Architecture placement

```text
                         ENIGMA
                            │
                 ┌──────────┴──────────┐
                 │                     │
          Policy Intelligence      Enforcement
          (EPA / Pack PDP)         (Gateway)
                 │                     │
                 └──────────┬──────────┘
                            │
                    Healthcare Domain
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       HIPAA v3.1      (future pack)     (future pack)
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
              Overlay registry + policy resolution
                            │
                         Decision
                            │
                     Gateway Action
                            │
                    Audit (provenance)
```

Generic layers:

| Layer | Location |
| --- | --- |
| Domain registry | `enterprise/domain.ts` |
| Overlay interpreter registry | `enterprise/overlay-registry.ts` |
| Provenance | `enterprise/provenance.ts` |
| Pack PDP | `enterprise/pack-pdp.ts` |
| Pack contributions | `mergePackContributions(...)` |
| HIPAA content | `policy-packs/hipaa/` + `packs/hipaa/` |

---

## 6. Policy context (generic)

Existing fields are sufficient for multi-pack healthcare. Do not add speculative fields.

### Present today (`PolicyContext` / `BaselineFacts` / live completions)

`subject` (user, application, optional `agent_id`), `resource`, `action`/`operation`, `purpose`, `recipient`, `source`/`source_system`, `environment`, `authorization` / `authorization_context`, `classification`, `processing_location`, model/application/trust, `tenant`, `evidence`, `regulatory_applicability`, entity/health context markers, optional `tool_id`, optional `permitted_entity_types` (minimum-necessary scope), `governance.agent_authorized` / `governance.tool_authorized`.

Live completions forward purpose, authorization, agent/tool identity, and governance context through **input and output** PDP evaluations and into `policy_evaluations` (including REVIEW hold snapshots).

### Phase 1–2 HIPAA runtime (implemented)

| Capability | Runtime behavior |
| --- | --- |
| Authorization context | HIPAA distinguishes `authorized` / `delegated` / `unauthorized` / `unknown` / `absent`; unauthorized → DENY; absent/unknown → REVIEW |
| Purpose | Missing/unknown → REVIEW; marketing/research → DENY; authorized TPO/care purposes evaluate normally |
| Agent / tool identity | Optional `agent_id` / `tool_id` on request → EPA subject + `ai_context`; unauthorized agent/tool → DENY |
| Minimum necessary | `permitted_entity_types` scopes detected entities; excess → REDACT via gateway transform targets |
| Output context | Purpose/authz/agent/tool survive to response policy evaluation |
| Evidence | `policy_evaluations` retains context; enforcement join via `request_id` |

### Not yet implemented (Healthcare Domain)

- CMS complete regulatory universe / full Prior Authorization product (CRD/DTR/PAS)
- Complete FHIR specification enforcement
- Full safe-harbor 18-identifier field ACL / FHIR resource ontology
- Broader healthcare regulatory packs (HITECH, Information Blocking as packs)
- Complete ONC HTI-1 / certification program (thin predictive-DSI pack only)

Do **not** claim ONC or CMS compliance. Thin packs operationalize selected aligned governance concepts at runtime; they are not certification determinations.

### Must remain generic

Do not rename fields to HIPAA-only terms. Do not add `covered_entity`, `baa`, `part2_program`, etc. to the platform context unless a pack’s applicability model truly requires a **generic** fact.

### Do not add yet

Workflow IDs, clinical specialty catalogs, payer product codes, assessment checklist scores.

---

## 7. Pack applicability

```text
Request → Classification → Pack applicability (declared by pack)
        → Applicable packs → Overlay evaluation → Decision
```

Each pack declares when it applies (e.g. HIPAA via PHI / `regulatory_applicability: HIPAA`). The PDP must **not** hard-code:

```text
if (HIPAA) …
if (HITECH) …
if (Part2) …
```

Packs register an **interpreter** on the overlay registry. Applicability logic lives inside the pack apply function / rule conditions.

---

## 8. Cross-pack precedence & conflicts

### Concepts

| Concept | Meaning |
| --- | --- |
| Authority / authority tier | Source ranking (CFR vs guidance vs implementation) |
| Obligation | Requirement from a pack |
| Precedence | Declared ordering or composition rule |
| Conflict | Incompatible obligations/decisions |
| Restrictive outcome | May compose when packs independently restrict |
| Exception | Explicit carve-out (must be policy-declared) |
| Resolution | `pack_declared_precedence` \| `deny_unresolved` \| `compose_restrictive` \| `manual_review` |

**Do not assume** “newer always wins” or “most restrictive always wins” unless metadata says so.

### `policy_conflicts`

Schema + `PolicyConflictRecord` already exist. Runtime currently returns `conflicts: []` (stub). That is sufficient to **represent** cross-pack conflicts generically; detection/resolution engines are future work.

Overlays today: never weaken a prior DENY; may further restrict. That is a safe default composition, not a full legal precedence engine.

---

## 9. Provenance across packs

Provenance is a **platform** capability (`DecisionProvenance.matched_rules[]`).

Multiple packs may append matched rules with distinct `source_ids` / citations / pack `policy_id`s:

```text
Decision
 ├── Pack: HIPAA → Obligation → CFR citation
 └── Pack: (future) → Obligation → citation
```

HIPAA v3.1 proves the chain for one pack. Architecture already supports multi-pack arrays.

---

## 10. Pack registration

Desired model:

```text
Healthcare Domain
  ├── pack_hipaa (v3.1)
  └── (future packs)
```

**Today:**

1. Pack contribution (`hipaaPackContribution()`, …) merged via `mergePackContributions`
2. Interpreter registered with `registerOverlayInterpreter(id, applyFn)`
3. Domain membership via `addPackToDomain('healthcare', packId)`
4. Snapshot / seed activates policies

**Avoid** proliferating `loadHipaaPack()` / `loadHitechPack()` in the PDP. HIPAA’s docs-as-code loader may remain pack-local until a generic pack loader is justified.

---

## 11. How to add a future healthcare pack

1. Author `gateway/policy-packs/<pack>/` per Policy Pack Authoring Spec  
2. Implement pack apply function(s) — **no** new PDP class  
3. `registerOverlayInterpreter(...)`  
4. Export `*PackContribution()` and merge into `regulatoryPackExtras` (or config)  
5. `addPackToDomain('healthcare', 'pack_…')`  
6. Seed EPA policy versions  
7. Pack tests + provenance tests  

Do **not** create `HitechPdp` / `Part2Gateway`.

---

## 12. Source governance (platform)

Generic source metadata (already used by HIPAA):

`source_id`, `authority`, `authority_tier`, `authority_type`, `legal_authority`, `title`, `publisher`, `citation`, `canonical_url`, `effective_date`, `retrieved_date`, `version`

Future lifecycle statuses (`current` | `superseded` | `withdrawn` | `draft`) may be added when multi-pack source churn requires it. **Not implemented yet.**

---

## 13. Remaining HIPAA v3.1 gaps — classification

| Gap | Classification | Backlog |
| --- | --- | --- |
| Baseline-reinforced cloud DENY may skip HIPAA rule provenance | **Generic platform** (baseline+overlay composition) | Platform: optional reinforce provenance |
| Request-supplied PHI → `REQUEST_SUPPLIED` unless profile ran | **Generic platform** (evidence pipeline) | Interrogation → attach profile provenance |
| Source effective/retrieved dates null | **Source-governance** | Fill when confidently known |
| Informational obligations (de-id, availability) | **Intentionally acceptable** (HIPAA pack) | Pack content when enforceable |

None require a Healthcare Domain ontology or a new HIPAA feature sprint before the next pack.

---

## 14. Acceptance

- HIPAA v3.1 behavior unchanged  
- No HIPAA-specific runtime classes  
- Domain ≠ pack  
- Provenance generic  
- Second pack registrable via contribution + interpreter registry  
- Cross-pack resolution defined (not fully automated)  
- No giant healthcare ontology  
