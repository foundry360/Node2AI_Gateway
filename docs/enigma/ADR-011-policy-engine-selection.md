# ADR-011: Policy engine selection for Enigma

**Status:** Accepted  
**Product:** Enigma (AI Governance Gateway)  
**Date:** 2026-09-03  
**Supersedes:** Implicit “hard-coded DeterministicPolicyEngine + metadata JSON” as permanent architecture  

## Context

Enigma must decide, deterministically:

> What AI is allowed to know, what AI is allowed to do, which AI is allowed to do it, and what AI is allowed to return.

Requirements that drive engine choice:

- First-class **Subject / Resource / Action / Context / AI Context / Evidence**
- Rich decisions beyond allow/deny (**TOKENIZE**, **ROUTE_LOCAL**, **REQUIRE_APPROVAL**, …)
- First-class **obligations** enforced by the gateway (PEP), not the model
- Policy **lifecycle**, packs, inheritance/scope, precedence, conflict detection
- Input **and** output governance
- Air-gap appliance (no mandatory cloud control plane)
- Fail closed; explainable; testable; simulatable
- Preserve existing gateway modules; no rewrite of identity, vault, audit, Ollama, etc.
- Administrators change policy **without** modifying gateway application code
- Regulatory packs (HIPAA, Financial, …) must not hard-code into services

Candidates evaluated: **Open Policy Agent (OPA) / Rego**, **Cedar**, and a **domain-native Enigma PDP**.

---

## Option A — OPA / Rego

| Criterion | Assessment |
|-----------|------------|
| Maturity / enterprise adoption | Very high (Kubernetes, service mesh, platform teams) |
| Expressiveness | Excellent for Boolean authorization and data-driven rules |
| Authorization use cases | Strong for allow/deny; obligations usually encoded as arbitrary JSON side-docs |
| Deployment | Sidecar, library, or Wasm; works air-gapped if binary/policies bundled |
| Performance | High when policies are compiled / Wasm-cached |
| TypeScript/Node | HTTP client to OPA, or `@open-policy-agent/opa-wasm`; not idiomatic TS domain objects |
| Policy testing | Excellent (`opa test`) |
| Explainability | Partial (`explain`); mapping to Enigma “matched conditions / obligations” needs custom wrapping |
| Operational complexity | Extra binary/process or Wasm build pipeline; Rego skill tax for operators |

**Fit gaps for Enigma:** Obligations, transforms, approval workflows, immutable versioned packs, and admin UX are **outside** Rego’s natural model. OPA would still require a full Enigma domain layer + PEP. Dual input/output evaluation with gateway-owned transforms becomes a second translation layer.

---

## Option B — Cedar

| Criterion | Assessment |
|-----------|------------|
| Authorization model | Excellent principal / action / resource / context |
| Expressiveness | Strong ABAC; intentionally constrained language |
| Enterprise suitability | Growing (AWS Verified Permissions); less ubiquitous than OPA |
| TypeScript/Node | `cedar-wasm` / AVP; embeddable |
| Policy testing | Good Cedar unit tests / analysis tools |
| Explainability | Diagnostics available; still need Enigma explanation contract |
| Air-gap | Wasm embed feasible |
| Performance | Strong for authorization |
| Ecosystem | Narrower than OPA; fewer operators know Cedar |
| Operational complexity | Lower than OPA sidecar if embedded; still a second language |

**Fit gaps for Enigma:** Cedar is optimized for **permit/forbid**, not for **TOKENIZE / REDACT / ROUTE_LOCAL / REQUIRE_APPROVAL** as first-class decisions with enforceable obligations. Those would be bolted on via attributes or annotations and reimplemented in the gateway PEP anyway. Lifecycle, packs, and relational administration remain Enigma’s job.

---

## Option C — Domain-native Enigma Policy Decision Point (recommended)

Build the **Enterprise Policy Architecture** as Enigma’s product:

1. Relational **Policy Repository** (queryable subjects, resources, actions, conditions, obligations, versions, packs).
2. Typed **Policy Evaluation Contract** (TypeScript).
3. Deterministic **Policy Decision Point (PDP)** that evaluates active policy versions against Subject/Resource/Action/Context/AI Context/Evidence.
4. Gateway **Policy Enforcement Point (PEP)** that already exists (orchestrator + transform + model gateway + response path).
5. **Policy packs** as versioned, loadable sets (Enterprise Baseline, HIPAA, …) without gateway code forks.
6. Optional later: embed Cedar **or** Rego as a **condition expression backend** behind the same contract—not as the architecture.

| Criterion | Assessment |
|-----------|------------|
| Obligations / rich decisions | Native |
| Admin lifecycle / simulation / tests | Native |
| Air-gap | Native (in-process PDP) |
| TypeScript integration | Native |
| Explainability | Native evaluation trace |
| Fail closed | Native |
| Rewrite risk | Low — adapter from existing `PolicyEngine` interface |
| Risk | Must not invent an ad-hoc “JSON if/then DSL” that becomes the architecture |

JSON remains **storage/transport for flexible condition metadata only**, never the governing architecture.

---

## Decision

**Adopt Option C: Domain-native Enigma Enterprise Policy Engine (PDP + repository + packs).**

Do **not** make OPA or Cedar the policy architecture for Enigma vNext.

### Why

1. Enigma’s differentiator is **governance with obligations**, not generic allow/deny microservices authz.
2. OPA and Cedar would still require the same domain model, lifecycle, PEP, and evidence layer.
3. In-process deterministic TypeScript PDP preserves appliance simplicity and air-gap.
4. Existing `DeterministicPolicyEngine` logic migrates into an initial **Enterprise AI Baseline** pack evaluated by the new PDP—then retires as hard-coded service logic.
5. Cedar/OPA remain **open future backends** for condition predicates if expressiveness or customer demand requires them—behind ADR revision.

### Non-goals of this ADR

- Building a customer-facing Rego/Cedar IDE in v1 of EPA
- Replacing cryptographic governance evidence with any ledger
- Claiming the gateway alone blocks network bypass to `api.openai.com`

---

## Consequences

- New schemas: `policy_versions`, scopes, obligations, packs, evaluations, conflicts, tests, approvals (see [policy-data-model.md](./policy-data-model.md)).
- New internal contract (see [policy-evaluation-contract.md](./policy-evaluation-contract.md)).
- Adapter: legacy `PolicyEngine` → Enterprise PDP during migration (see [policy-migration-plan.md](./policy-migration-plan.md)).
- Admin UI evolves from JSON blob editor to enterprise policy management.
- Precedence model is configurable and documented in [enterprise-policy-architecture.md](./enterprise-policy-architecture.md).

## Precedence configuration note

Default precedence (configurable, ADR-controlled defaults):

```text
Explicit DENY
  > Security / Regulatory constraint (pack tier)
  > Enterprise
  > Business unit / Tenant
  > Application
  > Agent
  > Default allow-with-baseline-obligations (never silent allow without evaluation)
```

Most restrictive applicable **obligation** wins unless an explicit higher-precedence policy voids it. Unresolvable conflicts → **DENY** (fail closed) + conflict evidence.
