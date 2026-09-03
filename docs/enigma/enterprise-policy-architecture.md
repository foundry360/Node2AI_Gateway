# Enigma — Enterprise Policy Architecture

**Status:** Target architecture (implementation follows these contracts)  
**Product name:** Enigma  
**Appliance path:** `gateway/` (preserved; not rebuilt)  
**Principle:** *Agent reasons. Policy decides. Gateway enforces.*

## 1. Product role

Enigma is an **AI Governance Gateway**. It determines:

> What AI is allowed to know, what AI is allowed to do, which AI is allowed to do it, and what AI is allowed to return.

AI/agent components may classify and produce **evidence**. They never hold final authorization authority.

## 2. Component architecture

```text
Enterprise Application
        │
        ▼
┌───────────────────────────────┐
│        ENIGMA GATEWAY         │
│  Identity                     │
│      ↓                        │
│  Data / Intent Interrogation  │  → Evidence (not decisions)
│      ↓                        │
│  Context Construction         │  → Subject, Resource, Action,
│      ↓                        │    Context, AI Context, Evidence
│  Enterprise Policy Engine     │  → PDP (input governance)
│      ↓                        │
│  Decision + Obligations       │
│      ↓                        │
│  Transformation (PEP)         │
│      ↓                        │
│  Approved Model Gateway       │
│      ↓                        │
│  Response Inspection          │  → Output evidence
│      ↓                        │
│  Enterprise Policy Engine     │  → PDP (output governance)
│      ↓                        │
│  Release / Transform / Block  │
│      ↓                        │
│  Governance Evidence          │  → hash chain + HMAC + append-only
└───────────────────────────────┘
```

### Separation of concerns

| Layer | Responsibility |
|-------|----------------|
| **Policy Administration** | Create, version, approve, activate, suspend, retire; packs; tests; simulation |
| **Policy Repository** | PostgreSQL relational store; immutable activated versions |
| **Policy Decision Point (PDP)** | Deterministic evaluation → decision + obligations + explanation |
| **Policy Enforcement Point (PEP)** | Gateway orchestrator enforces decisions/obligations (existing modules) |

Network bypass prevention (`api.openai.com` direct) is **not** Enigma’s PDP. See §11.

## 3. Domain model

### 3.1 Subject

Who requests or executes the AI action.

```text
Subject
  user_id?
  application_id
  organization_id / tenant_id
  roles[]
  groups[]
  agent_id?
  service_id?
  trust_level
  status
```

### 3.2 Resource

What is accessed or processed (extensible types).

```text
Resource
  type: dataset | record | document | field | model | tool | api | agent | mcp_server | external_service | ...
  id?
  classification: PUBLIC | INTERNAL | CONFIDENTIAL | RESTRICTED | PII | PHI | FINANCIAL | LEGAL | CREDENTIAL | <extensible>
  attributes{}
```

Classification labels are **extensible strings** registered in the repository. HIPAA-specific meaning lives in the **HIPAA policy pack**, not in gateway service `if (phi)` branches.

### 3.3 Action

Enterprise action taxonomy (extensible):

```text
READ | RETRIEVE | SUMMARIZE | ANALYZE | CLASSIFY | GENERATE
EXECUTE | WRITE | UPDATE | DELETE | TRANSMIT | EXPORT | SHARE
```

Gateway operations today (`summarize`, `classify`, `generate`, …) map into this taxonomy via adapter.

### 3.4 Context

```text
Context
  environment: connected | airgap | prod | staging | ...
  tenant_id
  jurisdiction?
  location?
  network?
  device?
  time?
  risk_level
  session_id?
  deployment_mode
```

### 3.5 AI Context

```text
AIContext
  model_id?
  model_provider?
  model_version?
  model_type?
  execution: local | private | cloud
  agent_id?
  agent_version?
  tool_id?
  tool_provider?
  mcp_server_id?
  eligible_models[]?
  requested_model?
```

### 3.6 Evidence

Produced by interrogators / inspectors — **never** binding authorization:

```text
Evidence
  classification
  confidence
  intent?
  risk
  entities[]
  reason_codes[]
  inspector_findings[]   # response path
```

## 4. Decision model

Decisions are richer than ALLOW/DENY:

```text
ALLOW
DENY
TRANSFORM
REDACT
TOKENIZE
MASK
REQUIRE_APPROVAL
ROUTE_LOCAL
RESTRICT_MODEL
RESTRICT_DATA
BLOCK_OUTPUT
```

Primary outcome for PEP:

```text
PolicyDecision
  decision                 # primary outcome (DENY wins over ALLOW)
  reason                   # human-readable, deterministic
  reason_codes[]
  applicable_policies[]    # id + version + pack
  obligations[]
  transformations[]
  restrictions[]           # e.g. eligible_models, no_external_tx
  approval_requirements[]
  conflicts[]              # detected + resolution
  evidence_refs
  evaluation_id
  explain                  # matched / rejected conditions
```

### Obligations (enforced by PEP, never by the model)

Examples:

```text
TOKENIZE_PII
LOCAL_MODEL_ONLY
NO_EXTERNAL_TRANSMISSION
NO_WRITE_BACK
LOG_GOVERNANCE_EVENT
APPROVED_MODEL_ONLY
REDACT_CREDENTIALS
REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION
AUTHORIZE_DETOKENIZATION   # privileged; default absent
```

Gateway maps obligations to existing transform / model / response / audit modules.

## 5. Policy structure & scope

Policies carry lifecycle metadata (see [policy-lifecycle.md](./policy-lifecycle.md)):

```text
policy_id, name, description, owner, version, status,
effective_at, expires_at, priority, scope, domain,
created_by, approved_by, created_at, updated_at
```

### Scope / inheritance

```text
Enterprise Baseline
        ↓
Regulatory Pack (e.g. HIPAA)
        ↓
Business Unit / Tenant
        ↓
Application
        ↓
Agent
```

Scopes: Enterprise | Business Unit | Department | Application | User Group | Role | Agent | Data Source | Model | Environment | Tenant | Platform.

## 6. Precedence & conflicts

Default precedence (configurable; see [ADR-011](./ADR-011-policy-engine-selection.md)):

```text
Explicit DENY
  > Security / Regulatory constraint
  > Enterprise
  > Business unit / Tenant
  > Application
  > Agent
  > Default
```

**Conflict handling (mandatory):**

1. Detect incompatible decisions or obligations (e.g. `ROUTE_LOCAL` vs `CLOUD_ONLY`).
2. Apply deterministic precedence.
3. Record conflict in evaluation evidence.
4. If unresolved → **DENY** (fail closed). Never silent pick.

## 7. Policy packs

Reusable, versioned packs **without** modifying core enforcement code:

| Pack | Intent |
|------|--------|
| Enterprise AI Baseline | General enterprise AI governance |
| HIPAA | Healthcare / PHI controls |
| Financial Services | Financial / customer data |
| Legal | Privilege / confidentiality |

Packs contribute policies to the repository; the PDP loads **active** versions only.

## 8. Evaluation points

| Point | When | Must run |
|-------|------|----------|
| Input governance | Before model execution | Always for governed AI |
| Output governance | Before release to application | Always for governed AI |

Invariant: no governed request executes without PDP; no governed response releases without PDP.

## 9. Simulation & explainability

Simulation (`POST .../simulate`) evaluates the contract **without** calling the model.

Explanations are produced by the PDP evaluation trace — **not** by an LLM.

## 10. Fail closed

DENY when any of: PDP unavailable, repository unavailable, evaluation error, unresolvable conflict, unknown policy version, missing required evidence, model authorization indeterminate, obligation unenforceable.

## 11. Network enforcement boundary (placeholder)

Enigma governs traffic that **reaches the gateway**.

Enterprise network controls determine whether apps can bypass Enigma to:

```text
api.openai.com | api.anthropic.com | Google AI | Azure OpenAI | Bedrock | ...
```

**Future / placeholder (not this phase):**

```text
AI Egress Discovery
AI Egress Monitoring
AI Egress Enforcement
```

Do not claim the application gateway alone prevents network bypass.

## 12. MCP stance

MCP is **not** a dependency of the policy architecture. Resources may later include `mcp_server` / tools. Governance boundary works without MCP.

## 13. Mapping to existing gateway

| Existing module | Role under EPA |
|-----------------|----------------|
| Identity | Builds Subject |
| HybridDataInterrogator | Evidence |
| DeterministicPolicyEngine | **Legacy** → migrate into Baseline pack + adapter |
| InputTransformService / vault | Obligation enforcement |
| Model gateway / Ollama | Restricted model execution |
| ResponseInspector | Output evidence |
| IntegrityAuditService | Governance evidence |
| Admin console | Evolves to policy administration |
| Postgres | Policy repository + evidence |

## 14. Implementation status labels

Use consistently in code/docs:

| Label | Meaning |
|-------|---------|
| **Production** | Enforced on appliance path |
| **Prototype** | Validated shape; not yet sole authority |
| **Stub** | Test double |
| **Future** | Placeholder only |
