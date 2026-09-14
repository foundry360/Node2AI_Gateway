# Enigma Product 1.0 — Integration Contract

**Status:** Canonical Product 1.0 technical contract  
**Date:** 2026-09-14  
**Authority:** Repository implementation under `gateway/`  
**Architecture reference:** [`ENIGMA_ARCHITECTURE.md`](./ENIGMA_ARCHITECTURE.md)  
**Related:** [`ACTION_GOVERNANCE.md`](./ACTION_GOVERNANCE.md), [`ENIGMA_PRODUCT_1_0.md`](./ENIGMA_PRODUCT_1_0.md)

This document answers:

> How does an enterprise application, agent, or AI system put an AI action through Enigma and correctly honor the resulting governance decision?

It describes **what is implemented today**. It does not invent APIs, fields, engines, or enforcement capabilities.

**UI is out of scope.** Operator surfaces are described only where they expose existing Decision/evidence semantics.

---

## 1. Purpose

Define the Product 1.0 **enterprise integration boundary**:

- what enters Enigma
- what Enigma resolves server-side
- what Enigma decides
- what Enigma controls
- what the client must honor
- how REVIEW / resume works
- how Outcomes are reported
- what Enigma can prove
- what Enigma explicitly does **not** control

---

## 2. Product boundary

Enigma is an **AI Action Governance Gateway**.

| Enigma is | Enigma is not |
|-----------|---------------|
| Bind → Decide → Enforce → Review → Prove | A second PDP / Action PDP / Agent PDP / Tool PDP |
| One EPA Decision in `policy_evaluations` | A workflow, ticket, or case system |
| Gateway enforcement on the path it sits on | A universal execution proxy for all enterprise DML |
| Client-commit authorization + Outcome evidence | Proof that a noncompliant client honored ALLOW |
| Appliance / air-gap capable | An IAM, DLP, SIEM, or data-catalog replacement |

AI calls receive Enigma governance **only if they pass through the governed Enigma boundary**. Direct model or SoR calls that bypass Enigma are outside this contract.

---

## 3. Architecture (frozen)

```text
Enterprise Application
        │
        ▼
AI Agent / AI Application
        │  Governed request (API key)
        ▼
┌─────────────────────────────────────────┐
│                 ENIGMA                  │
│  Authenticate application + user        │
│  Resolve Agent/Tool (registry facts)    │
│  Derive Action governance facts         │
│  PackBackedEnterprisePdp → ONE Decision │
│  Persist policy_evaluations             │
│  Enforce (Gateway path or commit authz) │
│  REVIEW → Approver → Resume if needed   │
│  Seal Audit / Outcome evidence          │
└──────────────────┬──────────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
       DENY            ALLOW / after AUTHORIZE
         │                    │
    Block path      Completions: Gateway model path
                    Actions: commit_allowed
                              │
                              ▼
                     External system (client)
                              │
                              ▼
                     Outcome → Evidence
```

There remains:

- one EPA/PDP (`PackBackedEnterprisePdp`)
- one authoritative Decision store (`policy_evaluations`)
- one Review model (additive `human_resolution`)
- one Outcome model (client-reported projection + audit)
- one evidence chain (Decision ↔ Audit ↔ Outcome)

---

## 4. Trust boundary

### A. Client-provided context (supplied, not automatically trusted)

Clients may send (see §9 for exact routes/fields):

| Context | Examples |
|---------|----------|
| Application identity | `application_id` (must match API key) |
| User identity | `user.id` |
| Actor identifiers | `agent_id`, `tool_id` |
| Operation | `operation` |
| Action declaration | `action.kind`, `action.target_id`, safe attribute **names** |
| Purpose / authz context | `purpose`, `authorization_context` |
| Messages / content | Completions `messages`; action prompts |
| Optional evidence bag | `governance_context` (strict schema; no security overrides) |
| Resume handle | `resume_evaluation_id` |
| Outcome report | `evaluation_id`, `execution_id`, `outcome`, optional binding fields |

**Presence does not equal authority.** Client `governance_context.agent_authorized` / `tool_authorized` are **not** trusted in registry `shadow`/`enforce` modes.

### B. Server-authoritative governance facts

| Fact | How Enigma establishes it |
|------|---------------------------|
| Application | API key authentication; body `application_id` must match |
| User | Identity store resolution |
| Agent identity / lifecycle / app binding | Agent registry (`RuntimeActorFacts`) |
| Tool identity / lifecycle | Tool registry |
| Agent→Tool grants | Grant registry |
| Deployment isolation | Deployment identity + registry scope |
| Agent/Tool authorized flags | **Server-derived** substrate (client attestations retained only as forensics) |
| Action category | Server (`buildRuntimeActionFacts`) |
| Write governance class | Server |
| Enforcement boundary | Server (`gateway_enforced` \| `client_commit_required`) |
| Client commit stamp (actions path) | Server stamps `client_commit: true` before evaluate |
| Policy applicability + Decision | `PackBackedEnterprisePdp` only |
| Commit authorization | Gateway after ALLOW / AUTHORIZE resume (`CLIENT_COMMIT_ALLOWED`) |

Claims that **cannot elevate authority**:

- Client-asserted agent/tool authorization
- Client-asserted action category / write class / enforcement boundary
- Security override fields (`skip_policy`, `bypass_governance`, …) — **rejected** (HTTP 400)
- End-user credentials used as REVIEW approver

### C. Policy-derived

Machine Decision codes and obligations from EPA packs (e.g. `ALLOW`, `DENY`, `REVIEW`, `TOKENIZE`, transforms, model restrictions). Mapped to Gateway enforcement behavior by the orchestrator.

### D. Historical snapshot (Decision reconstruction)

Persisted on the evaluation (and held-request snapshot where applicable), including:

- Subject / resource / action / context used for evaluation
- `ai_context.runtime_actor` (Agent/Tool facts at Decision time)
- `ai_context.action_governance` (`RuntimeActionFacts`)
- Sanitized declared `action` (no payload values)
- Machine `decision`, reason codes, explanation / pack contributions
- Additive `human_resolution` after Review
- Audit events bound to the evaluation / request
- Outcome projection when reported (`evidence_class: client_reported`)

Live registry changes after Decision **do not rewrite** historical evaluations.

---

## 5. Request context and authentication

### Authentication

```http
Authorization: Bearer <application_api_key>
```

- API key maps to an application (and organization).
- Body `application_id` must match the authenticated application → else `APPLICATION_MISMATCH` (403).
- License must be operational for AI routes (`assertAiLicense`).

Forbidden request keys (strict reject):  
`sanitize_input`, `sanitize_output`, `skip_policy`, `skip_inspection`, `bypass_governance`, `disable_audit`.

### Actor registry modes

Config: `GATEWAY_ACTOR_REGISTRY_MODE` = `off` | `shadow` | `enforce`  
Product 1.0 production expectation: **`enforce`**.

| Mode | Behavior |
|------|----------|
| `off` | No registry resolve; legacy client attestation left as-is |
| `shadow` / `enforce` | Registry facts authoritative when `agent_id` and/or `tool_id` present; client authz flags overwritten |

Registry unavailable while resolving actors in `shadow`/`enforce`: substrate `authorized: false`, reason `REGISTRY_UNAVAILABLE` → fail closed through PDP.

---

## 6. Actor binding (Agent / Tool)

```text
Agent → Tool request → Enigma
  → Authenticate app/user
  → Resolve Agent (registry)
  → Resolve Tool (registry)
  → Resolve grants + lifecycle
  → RuntimeActorFacts into governance context
  → Action facts
  → ONE Pack PDP Decision
  → Enforce
```

- Registry identity is server-authoritative.
- Grants and lifecycle are enforced as **facts**, not as a separate Tool/Agent PDP.
- There is still **only one** policy Decision.

Detail: [`PHASE_A_AGENT_TOOL_GOVERNANCE.md`](./PHASE_A_AGENT_TOOL_GOVERNANCE.md), [`PHASE_B_AGENT_TOOL_GOVERNANCE.md`](./PHASE_B_AGENT_TOOL_GOVERNANCE.md).

---

## 7. Action governance

Action is **governed context**, not a Decision authority.

| Concept | Meaning | Authority |
|---------|---------|-----------|
| Operation | Capability verb (`write`, `summarize`, …) | Client-supplied; validated |
| Kind | Declared subtype (`field_update`, …) | Client-supplied identifier |
| Category | `READ`/`CREATE`/`UPDATE`/… | **Server-derived** |
| Target | Resource/object id | Client-supplied identifier |
| Attributes | Safe keys only (`field`, `entity_type`, `record_type`, `object_type`, `resource_type`); values stripped | Server sanitization |
| Write governance class | e.g. clinical vs administrative field class | **Server-derived** |
| Enforcement boundary | `gateway_enforced` \| `client_commit_required` | **Server-derived** |

Persisted at:

```text
policy_evaluations.ai_context.action_governance
```

Actions path always stamps client-commit for policy evaluation; ALLOW responses use `enforcement_boundary: client_commit_required`.

Detail: [`ACTION_GOVERNANCE.md`](./ACTION_GOVERNANCE.md).

---

## 8. Decision contract

**Authoritative Decision** = record in `policy_evaluations` produced by `PackBackedEnterprisePdp`.

| Outcome | Meaning | Integrator obligation |
|---------|---------|------------------------|
| **DENY** | Governed operation must not proceed through Enigma | Do not execute the governed side effect; no `commit_allowed` |
| **REVIEW** | Held pending an authorized **approver** (not the requesting end user) | Honor hold; wait for resolve + resume |
| **ALLOW** | Enigma authorizes subject to enforcement boundary and obligations | Honor boundary (Gateway path or `commit_allowed`) |
| **TOKENIZE / REDACT / MASK / TRANSFORM** | Controls required on Gateway-controlled content path | Do not treat as unconstrained ALLOW |
| Other EPA codes | e.g. model/data restrictions | Follow returned eligibility / block semantics |

Machine Decision is **immutable**. Human resolution is **additive** (`human_resolution` / `final_decision`).

---

## 9. Integration API surface (implemented)

### 9.1 Governed completions

`POST /v1/ai/completions`

**Required (schema):** `application_id`, `user.id`, `operation`, `messages` (≥1)  
**Common optional:** `model` (hint), `purpose`, `authorization_context`, `agent_id`, `tool_id`, `governance_context`, `regulatory_applicability`, `metadata`

**Path (conceptual):**

```text
Application → Identity → Interrogation → Actor facts → Action facts
  → PDP → Decision → Gateway enforce (transform/block/hold/model)
  → Response policy → Audit/evidence
```

Completions that ALLOW/TOKENIZE and invoke a model run under **Gateway-enforced** control for that path.

### 9.2 Governed actions

`POST /v1/ai/actions`

Same identity/governance base as completions, plus:

- `operation` — schema-optional; runtime **defaults to `write`** when omitted
- `action` — optional `{ kind, target_id?, attributes? }`
- `resume_evaluation_id` — optional canonical post-AUTHORIZE continuation

**ALLOW success fields (actual):**

| Field | Example / notes |
|-------|-----------------|
| `status` | `approved` |
| `action` | `commit_allowed` |
| `enforcement_boundary` | `client_commit_required` |
| `evaluation_id` | Decision id |
| `machine_decision` | EPA code |
| `request_id` / `correlation_id` | Correlation |

Audit stamps reason `CLIENT_COMMIT_ALLOWED`.

**DENY / hold (actual):** HTTP deny path; `enforcement_boundary` may be `denied` or `review_required`; REVIEW includes hold / `evaluation_id` for later resume. **No** `commit_allowed` on DENY.

### 9.3 Outcome

`POST /v1/ai/actions/outcome`

**Required:** `application_id`, `evaluation_id`, `execution_id` (≤128), `outcome`  
**`outcome` enum:** `EXECUTED` | `EXECUTION_FAILED` | `EXECUTION_TIMEOUT` | `EXECUTION_UNKNOWN`

Requires a prior `CLIENT_COMMIT_ALLOWED` enforcement audit for that evaluation. Does **not** re-run PDP. Does **not** overwrite machine Decision.

Success includes `evidence_class: 'client_reported'` and `enforcement: 'CLIENT_COMMIT_ALLOWED'`.

### 9.4 Review resolve (admin)

`POST /v1/admin/evaluations/:evaluationId/resolve`

- Capability: `governance_resolve` → **ADMINISTRATOR** or **GOVERNANCE_REVIEWER** only
- Body: `{ disposition: 'AUTHORIZE' | 'DENY', reason: string, actor?: string }`
- End user / application API key is **not** the approver

### 9.5 Resume

Two implemented paths:

1. **Client:** `POST /v1/ai/actions` with `resume_evaluation_id` (preferred Product 1.0 continuation)
2. **Admin:** `POST /v1/admin/evaluations/:evaluationId/resume` (also requires `governance_resolve`)

Invalid explicit `resume_evaluation_id` does **not** fall through to content matching. Content-exact fallback remains only when the id is omitted (transitional).

---

## 10. Enforcement boundary

### `gateway_enforced`

Enigma controls the model/transform/block path it executes (typical completions path).  
Admin integrity label: `GATEWAY_ENFORCED`.  
`gateway_executed_side_effect` is meaningful only on this boundary.

### `client_commit_required`

Enigma **authorizes** the governed action and issues commit authorization (`commit_allowed` / `CLIENT_COMMIT_ALLOWED`).  
The **client/system** performs the external side effect.  
Enigma does **not** claim to have executed external DML.

Admin integrity label: `CLIENT_COMMIT_REQUIRED`.

### `commit_allowed`

> `commit_allowed` is Enigma’s authorization for the governed action to proceed at the applicable enforcement boundary. It does **not** by itself mean Enigma executed the external system side effect.

Issued after machine ALLOW on the actions path, or after AUTHORIZE + successful resume binding.

DENY never yields `commit_allowed` at the Enigma boundary.

---

## 11. Review / approver contract

```text
Request
  → Decision = REVIEW
  → Held (snapshot + evaluation_id)
  → Authorized Approver (ADMINISTRATOR | GOVERNANCE_REVIEWER)
  → resolve AUTHORIZE | DENY
  → Resume (AUTHORIZE only)
  → Revalidate binding/context
  → commit_allowed (actions) or Gateway continue
```

**The requesting end user is not the approver.**

Resume eligibility requires (implementation): machine `REVIEW`, human `AUTHORIZE` with `final_decision=ALLOW`, held request present, not already resumed.

---

## 12. Resume binding (fail-closed)

When the held Decision recorded a binding field, the resume request **must** present the same value. Omitting a held field is **`CONTEXT_MISMATCH`** (409).

Compared when held:

| Binding | Fields |
|---------|--------|
| Operation | `operation` (required match) |
| Actor | `tool_id`, `agent_id` |
| Purpose / authz | `purpose`, `authorization_context` |
| Action | `action.kind`, `action.attributes.field`, `action.target_id` |

Clients cannot use Evaluation A’s authorization to continue Action B by dropping identifiers.

---

## 13. Outcome and evidence

| Layer | Meaning |
|-------|---------|
| **Decision** | What policy decided (`policy_evaluations`) |
| **Enforcement** | What Gateway blocked, transformed, held, or authorized (`CLIENT_COMMIT_ALLOWED`, etc.) |
| **Outcome** | What the client reported after external execution |
| **Evidence** | Audit chain + optional outcome projection |

Outcome is **client-reported** (`evidence_class: client_reported`). It is not independent verification of the external system unless a separate verification mechanism exists (none claimed in Product 1.0 for arbitrary SoR DML).

Outcome integrity labels used operationally: `NOT_REPORTED`, `COMPLETED`, `FAILED`, `REPORTED`, `NOT_APPLICABLE`.

---

## 14. Fail-closed behavior (actual)

| Condition | Behavior |
|-----------|----------|
| Actor registry unavailable (`enforce`/`shadow` + agent/tool) | Unauthorized substrate → block |
| Missing/invalid request; forbidden overrides | 400 `VALIDATION_FAILED` |
| Application mismatch | 403 `APPLICATION_MISMATCH` |
| Interrogation / policy engine failure | Fail closed (403 classification/policy failure) |
| No eligible models / BLOCK / REVIEW hold | 403; REVIEW retains hold artifacts |
| Local model not ready (incl. air-gap health) | Operational failure (e.g. 503 air-gap local runtime) |
| Resume context mismatch | 409 `CONTEXT_MISMATCH` |
| Resume without AUTHORIZE | Rejected (`NOT_AUTHORIZED`, etc.) |
| DENY resume | Rejected (`DENY_CANNOT_RESUME`) |
| Outcome without commit authorization | 403 `OUTCOME_NOT_AUTHORIZED` |
| Legacy engine modes | Not Product 1.0 default; forced enterprise unless explicitly allowed |

Distinguish:

- **Security fail-closed** — deny/block when authority cannot be established
- **Operational dependency failure** — runtime/DB/model unavailable
- **Client noncompliance** — client ignores Enigma outside Gateway-controlled boundary (see §15)

---

## 15. Client noncompliance and proof boundary

### Residual limitation (accepted Product 1.0)

> Enigma cannot guarantee that an external client or system will honor an ALLOW / `commit_allowed` decision when the external side effect occurs outside an Enigma-controlled enforcement boundary.

### What Enigma **can** prove

- Decision and policy context
- Actor / action snapshots at Decision time
- Enforcement instruction and audit (including `CLIENT_COMMIT_ALLOWED`)
- Review resolution (additive)
- Resume validation success/failure
- Client-reported Outcome (when submitted) and evidence linkage

### What Enigma **cannot** prove (client-commit / bypass)

- That the external system physically honored `commit_allowed`
- That Enigma executed the external DML
- That a noncompliant client did not mutate the system of record independently
- That AI calls bypassing Enigma were governed

---

## 16. Reference integration patterns

### Pattern 1 — ALLOW completion

```text
Client → POST /v1/ai/completions → ALLOW/TOKENIZE
  → Gateway model/transform path → response → Audit
```

### Pattern 2 — DENY action

```text
Client → POST /v1/ai/actions → DENY
  → No commit_allowed → no governed external execution via Enigma
```

### Pattern 3 — REVIEW action

```text
Client → POST /v1/ai/actions → REVIEW (held)
Approver → POST /v1/admin/evaluations/:id/resolve AUTHORIZE|DENY
Client → POST /v1/ai/actions { resume_evaluation_id } → revalidate
  → ALLOW → commit_allowed  |  DENY path rejects
```

### Pattern 4 — ALLOW + client commit

```text
Client → POST /v1/ai/actions → ALLOW → commit_allowed
Client → External system side effect
Client → POST /v1/ai/actions/outcome → Evidence (client_reported)
```

### Pattern 5 — Agent + Tool

```text
Agent → Tool request → POST /v1/ai/actions|completions
  → Resolve Agent/Tool/grants → Action facts → ONE Decision → Enforce
```

---

## 17. Responsibility matrix

| Responsibility | Enigma | Client / enterprise |
|----------------|--------|---------------------|
| Authenticate request | ✓ API key | Provide valid credentials |
| Match application_id | ✓ | Send matching `application_id` |
| Resolve user | ✓ | Provide `user.id` |
| Resolve Agent/Tool/grants | ✓ (enforce/shadow) | Use registered ids; do not self-authorize |
| Derive Action category / boundary | ✓ | Provide operation/kind/target/safe attrs |
| Evaluate policy / Decision | ✓ EPA only | Do not invent parallel decisions |
| Hold REVIEW | ✓ | Honor hold; do not treat as ALLOW |
| Approve REVIEW | Approver roles only | Provide enterprise approvers |
| Issue `commit_allowed` | ✓ | Do not forge; require Enigma response |
| Execute Gateway model path | ✓ when gateway-enforced | Route completions through Enigma |
| Execute external DML | **Not** on client-commit path | Perform only after `commit_allowed` |
| Report Outcome | Record/seal | Report actual result promptly |
| Preserve evidence | ✓ Decision/Audit/Outcome | Preserve required external records |
| Prevent bypass | Within Enigma boundary | Route governed AI actions through Enigma |

---

## 18. Security model (integration view)

- Authentication via application API keys; admin RBAC separate for resolve/resume/admin APIs  
- Actor binding server-authoritative in production `enforce`  
- Action facts server-derived; payload values stripped from governance attributes  
- Deployment isolation for Agent/Tool registries  
- Fail-closed on registry/PDP/authority failures  
- Historical snapshots for Decision reconstruction  
- Review only by `governance_resolve` roles  
- Resume binding fail-closed (`CONTEXT_MISMATCH`)  
- Audit integrity / anchoring / outcome claim semantics as implemented in evidence stack  

See also [`SECURITY.md`](./SECURITY.md), [`security-model.md`](./security-model.md).

---

## 19. Air-gapped deployment

Product 1.0 supports air-gapped appliance operation using existing components:

| Component | Behavior |
|-----------|----------|
| `GATEWAY_DEPLOYMENT_MODE=airgap` | Local-models posture |
| Local runtime (`stub` / `ollama` / `auto`) | Model execution without cloud providers |
| Postgres | Persistence when configured |
| Gateway + admin console | Same governance APIs and Decision authority |
| Policy packs | Local EPA packs; no cloud policy dependency |
| Audit / evidence | Local (plus customer-controlled stores when configured) |
| Health | Air-gap + unavailable local runtime → fail closed (503) |

No new infrastructure is introduced by this contract. Detail: [`airgap-model.md`](./airgap-model.md), [`deployment-model.md`](./deployment-model.md).

---

## 20. Client limitations (summary)

1. Governance applies only on the Enigma path.  
2. `commit_allowed` ≠ Enigma-executed DML.  
3. Outcome is client-reported evidence, not physical SoR verification.  
4. Noncompliant clients remain a residual risk outside Gateway-enforced boundaries.  
5. End users cannot self-approve REVIEW.  
6. Resume must re-present held binding context.

---

## 21. Non-goals (Product 1.0)

Not part of this contract / workstream:

- Universal execution proxy or connector platform  
- Action / Agent / Tool PDPs  
- Workflow / BPM / ticketing  
- IAM replacement, DLP, SIEM, data catalog  
- Invented APIs or UI changes  
- Commercial packaging / branding workstreams  

---

## 22. Related implementation pointers

| Concern | Primary code |
|---------|----------------|
| Routes | `gateway/src/api/server.ts` |
| Orchestration | `gateway/src/api/orchestrator.ts` |
| Schemas | `gateway/src/api/validation.ts` |
| Admin resolve/resume | `gateway/src/api/admin-routes.ts` |
| Actor facts | `gateway/src/actors/` |
| Action facts | `gateway/src/policy/enterprise/action-governance.ts` |
| PDP | `gateway/src/policy/enterprise/pack-pdp.ts` |
| Enforcement integrity | `gateway/src/policy/enterprise/enforcement-integrity.ts` |
| Outcome | `gateway/src/audit/outcome.ts`, `outcome-store.ts` |

Contract verification tests (non-exhaustive):  
`agent-tool-governance-phase-a|b`, `action-governance-phase-d`, `ai-actions-resume`, `enforcement-integrity-phase1`, `audit-outcome-phase4|4.1`, `write-governance-tiers`.

---

*Canonical Product 1.0 integration contract. Implementation wins over narrative diagrams if they diverge.*
