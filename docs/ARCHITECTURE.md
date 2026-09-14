# Enigma Gateway — Architecture

**Status:** Architectural contract  
**Invariant:** Agent reasons. Policy decides. Gateway enforces.  
**Canonical architecture (current):** [`ENIGMA_ARCHITECTURE.md`](./ENIGMA_ARCHITECTURE.md)

## 1. Product role

Enigma is an **AI Action Governance** product deployed as an **AI Governance Gateway / Policy Enforcement Layer**. It is not an end-user AI application.

> **All AI inputs and AI responses that are to be governed must pass through Enigma before they are allowed to reach their destination on the Enigma path.**

Applications call Enigma. Enigma decides eligibility, transforms data when required, executes against approved models on Gateway-controlled paths, inspects responses, and releases or blocks results. For **client-commit** actions, Enigma authorizes (`commit_allowed`); the client performs the external side effect and reports Outcome.

## 2. System context

```text
Enterprise Applications (CRM/ERP, custom apps, agents)
        │
        ▼
┌───────────────────────┐
│  ENIGMA GATEWAY       │  ← sole public AI execution boundary (on path)
│  API / Auth Boundary  │
└───────────┬───────────┘
            ▼
    Identity Context
            ▼
    Data Interrogation
            ▼
    Policy Engine (authoritative)
       │
  ALLOW / TRANSFORM / BLOCK / REVIEW
            ▼
    Model Gateway (execution only)  — or commit_allowed for client-commit actions
            ▼
    Response Inspector
            ▼
    Policy Engine (response decision)
       │
  RELEASE / TRANSFORM / BLOCK
            ▼
    Application / User
```

## 3. Modular monolith

Phase 1–5 ship as a **modular monolith** with hard module boundaries. Components may later become separate processes without changing contracts.

| Module | Responsibility | May use AI? | Authorizes? |
|--------|----------------|-------------|-------------|
| Gateway API | Auth, validation, orchestration, enforcement | No | Enforces only |
| Identity | Org / app / user resolution | No | Authenticates |
| Data Interrogator | Classification, intent, risk evidence | Optional local | **Never** |
| Policy Engine | ALLOW / TRANSFORM / BLOCK / eligible models | No | **Yes** |
| Transform | Tokenize / redact / mask | No | No |
| Model Gateway | Provider adapters, local runtime | N/A | **Never** |
| Response Inspector | Output classification & evidence | Optional local | **Never** |
| Audit | Immutable decision trail | No | No |
| Connectors | Metadata + governed retrieval (later) | No | **Never** |

## 4. Canonical request path

There is **one** production AI execution path:

```text
APPLICATION → GATEWAY → IDENTITY → INTERROGATION → POLICY → TRANSFORM
  → MODEL → RESPONSE INSPECTION → POLICY → TRANSFORM → APPLICATION
```

No parallel mock/simple/bypass endpoints may execute AI without governance. Test harnesses must be isolated from production routes.

## 5. Deployment targets

| Mode | Description |
|------|-------------|
| Physical appliance | MicroPC / Mac Mini–class on-prem hardware |
| VM / container | Docker Compose / K8s |
| Connected private | Approved enterprise + approved AI egress only |
| True air-gap | Zero external network; local inference only |

## 6. Technology baseline

- **Language:** TypeScript (Node.js 20+)
- **API:** REST (`POST /v1/ai/completions`)
- **Runtime shape:** Modular monolith under `gateway/`
- **Database:** PostgreSQL (appliance-local)
- **Admin UI:** Next.js (Phase 6; governance console only)
- **Local inference:** Runtime-abstracted (`LocalModelRuntime`; Ollama for MVP)
- **Packaging:** Docker Compose single-command appliance

## 7. Non-goals (MVP)

- Deep Salesforce / Epic / SharePoint connectors
- MCP as governance boundary
- Autonomous agent gateway
- End-user chat product
- Enterprise system-of-record replacement
- Client-controllable security toggles

## 8. Separation of concerns

| Concern | Owner |
|---------|-------|
| “What is this data / intent?” | Interrogator / analyzers (evidence) |
| “Is this allowed?” | PolicyEngine (deterministic) |
| “Execute / block / transform” | Gateway |

An LLM must never return `ALLOW` and have that treated as authorization.

## 9. Repository layout (new product)

Legacy Node2AI code under `apps/`, `packages/`, and `docs/legacy/` is **reference only**. The current product (**Enigma**) lives in:

```text
gateway/                 # self-contained product
  src/
    api/                 # public boundary
    identity/
    interrogation/       # Phase 2+
    policy/
    transform/           # Phase 3+
    models/              # Phase 4+
    response/            # Phase 5+
    audit/
    shared/
  db/
  tests/
  docker/                # Phase 6+
docs/                    # architectural contracts (this tree)
```

## 10. Related contracts

- [security-model.md](./security-model.md)
- [policy-model.md](./policy-model.md)
- [request-lifecycle.md](./request-lifecycle.md)
- [response-lifecycle.md](./response-lifecycle.md)
- [api-contract.md](./api-contract.md)
- [appliance-model.md](./appliance-model.md)
- [deployment-model.md](./deployment-model.md)
- [airgap-model.md](./airgap-model.md)
- [threat-model.md](./threat-model.md)
- [testing-strategy.md](./testing-strategy.md)
- [connector-model.md](./connector-model.md)
- [implementation-plan.md](./implementation-plan.md)
- [architectural-decisions.md](./architectural-decisions.md)
