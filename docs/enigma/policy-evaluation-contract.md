# Enigma — Policy evaluation contract

**Status:** Stable internal contract (target)  
**Language:** TypeScript types (gateway will implement under `gateway/src/policy/enterprise/`)  
**Invariant:** Same Subject + Resource + Action + Context + AI Context + Evidence + active policy versions → same decision.

## Principles

- Interrogator / inspector → **evidence only**
- PDP → **decision + obligations + explanation**
- PEP (gateway) → **enforce**
- No LLM invents authorization rationale

---

## Request

```typescript
/** Production contract — PolicyEvaluationRequest */
export type EnigmaAction =
  | 'READ'
  | 'RETRIEVE'
  | 'SUMMARIZE'
  | 'ANALYZE'
  | 'CLASSIFY'
  | 'GENERATE'
  | 'EXECUTE'
  | 'WRITE'
  | 'UPDATE'
  | 'DELETE'
  | 'TRANSMIT'
  | 'EXPORT'
  | 'SHARE'
  | (string & {}); // extensible

export type ClassificationLabel =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'RESTRICTED'
  | 'PII'
  | 'PHI'
  | 'FINANCIAL'
  | 'LEGAL'
  | 'CREDENTIAL'
  | (string & {});

export interface PolicySubject {
  user_id?: string;
  application_id: string;
  organization_id: string;
  tenant_id?: string;
  roles: string[];
  groups?: string[];
  agent_id?: string;
  service_id?: string;
  trust_level: 'untrusted' | 'standard' | 'trusted' | string;
  status: 'active' | 'inactive' | string;
}

export interface PolicyResource {
  type: string;
  id?: string;
  classification?: ClassificationLabel;
  attributes?: Record<string, unknown>;
}

export interface PolicyContext {
  environment: string;
  deployment_mode: 'connected' | 'airgap';
  tenant_id?: string;
  jurisdiction?: string;
  location?: string;
  network?: string;
  device?: string;
  time?: string; // ISO-8601
  risk_level?: 'low' | 'medium' | 'high';
  session_id?: string;
  application_environment?: string;
}

export interface PolicyAIContext {
  model_id?: string;
  model_provider?: string;
  model_version?: string;
  model_type?: string;
  execution?: 'local' | 'private' | 'cloud';
  agent_id?: string;
  agent_version?: string;
  tool_id?: string;
  tool_provider?: string;
  mcp_server_id?: string;
  requested_model?: string;
  available_models?: string[];
  eligible_models_hint?: string[];
}

export interface PolicyEvidence {
  classification?: ClassificationLabel;
  confidence?: number;
  intent?: string;
  risk?: 'low' | 'medium' | 'high';
  reason_codes?: string[];
  entities?: Array<{ type: string; value_redacted?: string }>;
  inspector_findings?: Array<{ code: string; detail?: string }>;
  contains_tokens?: boolean;
  input_was_tokenized?: boolean;
}

export type EvaluationPhase = 'input' | 'output' | 'simulate';

export interface PolicyEvaluationRequest {
  evaluation_phase: EvaluationPhase;
  subject: PolicySubject;
  resource: PolicyResource;
  action: EnigmaAction;
  context: PolicyContext;
  ai_context: PolicyAIContext;
  evidence: PolicyEvidence;
  request_id?: string;
  correlation_id?: string;
}
```

---

## Response

```typescript
export type PolicyDecisionCode =
  | 'ALLOW'
  | 'DENY'
  | 'TRANSFORM'
  | 'REDACT'
  | 'TOKENIZE'
  | 'MASK'
  | 'REQUIRE_APPROVAL'
  | 'ROUTE_LOCAL'
  | 'RESTRICT_MODEL'
  | 'RESTRICT_DATA'
  | 'BLOCK_OUTPUT';

export type ObligationCode =
  | 'TOKENIZE_PII'
  | 'LOCAL_MODEL_ONLY'
  | 'NO_EXTERNAL_TRANSMISSION'
  | 'NO_WRITE_BACK'
  | 'LOG_GOVERNANCE_EVENT'
  | 'APPROVED_MODEL_ONLY'
  | 'REDACT_CREDENTIALS'
  | 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION'
  | 'AUTHORIZE_DETOKENIZATION'
  | (string & {});

export interface ApplicablePolicyRef {
  policy_id: string;
  version: number;
  pack_id?: string;
  name?: string;
  scope_tier?: string;
}

export interface Obligation {
  code: ObligationCode;
  parameters?: Record<string, unknown>;
}

export interface PolicyExplanation {
  matched_conditions: Array<{ policy_id: string; version: number; condition_key: string; detail?: string }>;
  rejected_conditions: Array<{ policy_id: string; version: number; condition_key: string; detail?: string }>;
  final_reason: string;
}

export interface PolicyConflictRecord {
  conflict_type: 'decision' | 'obligation';
  policy_a: string; // id@version
  policy_b: string;
  detail: string;
  resolution: 'precedence' | 'deny_unresolved';
}

export interface PolicyDecision {
  decision: PolicyDecisionCode;
  reason: string;
  reason_codes: string[];
  applicable_policies: ApplicablePolicyRef[];
  obligations: Obligation[];
  transformations: Array<{ type: string; targets: string[] }>;
  restrictions: {
    eligible_models?: string[];
    deny_external_transmission?: boolean;
    require_local?: boolean;
  };
  approval_requirements: string[];
  conflicts: PolicyConflictRecord[];
  explanation: PolicyExplanation;
  evidence: PolicyEvidence; // echo + any PDP annotations
  evaluation_id: string;
  /** Fail-closed marker when PDP could not complete normally */
  fail_closed?: boolean;
}
```

---

## PDP interface

```typescript
export interface EnterprisePolicyDecisionPoint {
  evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision>;
}
```

Simulation uses the same interface with `evaluation_phase: 'simulate'` and **must not** invoke the model gateway.

Internal service (not a public unrestricted route):

```text
POST /internal/policy/evaluate
```

Admin simulation:

```text
POST /v1/admin/policies/:id/simulate
POST /v1/admin/policy/simulate   # free-form request body
```

---

## Adapter to legacy gateway types

During migration, `EnterprisePolicyAdapter` maps:

| Legacy | EPA |
|--------|-----|
| `operation` | `action` (uppercase taxonomy) |
| `user` + `application` | `subject` |
| `classification.sensitivity` | `resource.classification` + `evidence` |
| `deploymentMode` | `context.deployment_mode` |
| `requestedModel` / `availableModels` | `ai_context` |
| `PolicyEvaluationResult.decision` | map TOKENIZE/ALLOW/BLOCK ↔ decision + obligations |
| `eligible_models` | `restrictions.eligible_models` |
| `transforms` | `transformations` + obligations |
| `authorize_detokenization` | obligation `AUTHORIZE_DETOKENIZATION` |

Legacy interface `PolicyEngine` remains until cutover so existing orchestrator tests stay green.

---

## Model authorization evidence (durable)

Model facts are distinct and must not be collapsed:

```text
Registered (Models registry)
    ↓
Available (active registry IDs offered to EPA as availableModels)
    ↓
Policy Eligible (EPA restrictions.eligible_models — per-request authorization)
    ↓
Selected (selectEligibleModel within eligible set)
    ↓
Executed (Model Gateway + audit model_selected / provider)
```

**Persistence:** Input-phase `policy_evaluations` stores `restrictions.eligible_models` as an immutable snapshot of what EPA authorized (including explicit `[]`). Historical hydration must restore that snapshot — never recalculate from the current registry, allowlists, or policy versions.

**Correlation:** Gateway audit records `model_selected` and `provider` for the same `request_id`. Input evaluation is the authority for eligibility; audit may bind integrity to the output evaluation id while retaining `metadata.evaluation_id` for the input decision.

---

## Governed action continuation (`resume_evaluation_id`)

For client-commit writes (`POST /v1/ai/actions`), human approval authorizes **continuation of a specific governed Decision**. It does **not** create standing write permission for the user, application, agent, or tool.

```text
evaluation_id              → identifies the original governance Decision
resume_evaluation_id       → continue that Decision after human AUTHORIZE
```

Canonical flow:

```text
write request → REVIEW Decision → human AUTHORIZE → resume_evaluation_id → commit_allowed
```

Semantics:

- A valid resume references the original `evaluation_id`; it does **not** create a second independent policy Decision.
- Machine `decision` remains `REVIEW`; human resolution remains additive (`AUTHORIZE` → final ALLOW); execution becomes `RESUMED`.
- Resume is bound to material action context (subject, application, agent, tool, operation, action kind/attributes, purpose, authorization context) — not to exact message payload text.
- An authorized Decision is **single-use** for client commit: after successful resume, replay returns `ALREADY_RESUMED` (not a permanent authorization token).

Precedence:

1. **Explicit `resume_evaluation_id`** — validate that Decision; on failure, return a safe error. Do **not** fall through to content matching.
2. **Exact-content AUTHORIZE match** — transitional fallback only when `resume_evaluation_id` is omitted.

---

## Fail-closed contract

If `evaluate` throws or returns indeterminate authorization:

- PEP treats as **DENY** / block
- Record evaluation with `fail_closed: true` when possible
- Never default to ALLOW
