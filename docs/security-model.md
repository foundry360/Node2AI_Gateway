# Security Model

**Status:** Architectural contract  
**Mode:** Fail closed

## Principles

1. **Fail closed** — Any security-component failure yields `BLOCK`.
2. **No client overrides** — Parameters such as `sanitize_input=false` are ignored or rejected.
3. **No direct provider access** — Production assumes apps cannot reach OpenAI/Anthropic/etc. directly; network controls enforce this.
4. **No unauthorized detokenization** — Tokens are not restored unless response policy explicitly authorizes it.
5. **Application identity required** — Every production AI request must resolve a registered application.
6. **Model authorization** — Clients cannot select arbitrary models; PolicyEngine produces eligible set.
7. **Dataset authorization** — Clients cannot access arbitrary datasets.
8. **Complete audit trail** — Every decision is correlatable via `request_id` / `correlation_id`.

## Authentication (MVP → expansion)

| Phase | Mechanism |
|-------|-----------|
| MVP | API keys bound to application + organization (hashed at rest) |
| Next | JWT (service/user claims) |
| Later | OAuth/OIDC, mTLS, workload identities |

Authorization must not rely solely on client-supplied identity headers. The gateway authenticates credentials, then loads authoritative identity records from the appliance database.

## Authorization inputs

Before AI execution the gateway must establish:

```text
WHO (user) + WHAT APPLICATION + WHAT OPERATION
```

Plus classification, environment, requested model (hint only), and risk evidence.

## Fail-closed matrix

| Failure | Outcome |
|---------|---------|
| Auth failure | 401 / BLOCK |
| Unknown application | 403 / BLOCK |
| Classification failure | BLOCK |
| Policy evaluation failure | BLOCK |
| Tokenization / transform failure | BLOCK |
| Model authorization unresolved | BLOCK |
| Response inspection failure | BLOCK |
| Audit write failure (configurable; default) | BLOCK |

## Secrets & token vault

- Provider credentials and vault keys live only on the appliance.
- Token vault mappings are privileged; detokenization is a separate authorized operation.
- Audit does **not** store raw sensitive content by default.

## Network enforcement

Applications → Node2AI → approved providers (or local only).

Appliance capabilities:

- Configurable outbound allowlist
- Deny-by-default egress where practical
- Provider-specific endpoints only
- Bypass-configuration detection / health warnings

See [deployment-model.md](./deployment-model.md) and [airgap-model.md](./airgap-model.md).

## Client-facing error posture

Blocked responses expose reason codes suitable for operators, not internal policy AST, vault keys, or classifier prompts.
