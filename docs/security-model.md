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
9. **Tamper-evident response audit** — Released responses are cryptographically hashed; audit events are hash-chained, HMAC-signed, and append-only.

## Audit immutability (v1)

**Requirement met:** cryptographic / tamper-evident immutability for governed AI responses and their audit records.

### What “immutable” means for this release

| Guarantee | How |
|-----------|-----|
| Response content is hashed | SHA-256 `response_hash` of the exact released assistant text |
| History cannot be silently rewritten | Each event includes `prev_event_hash` → `event_hash` (hash chain) |
| Events are authenticated | HMAC-SHA256 `integrity_signature` with appliance audit key |
| Store is append-only | Postgres rejects `UPDATE` / `DELETE` on `audit_events` |
| Raw response text is not retained in audit | Only hashes + decision metadata |

Approved completions also return an `integrity` object (`response_hash`, `event_hash`, `prev_event_hash`) so clients can retain a receipt.

Verify anytime:

```bash
curl -s -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  http://127.0.0.1:8080/v1/admin/audit/integrity
```

Admin → **Audit** shows the chain status and per-event response hashes.

### What it is not (explicit non-claim)

- **Not a public or multi-party blockchain.** There is no distributed consensus ledger in v1.
- **Not immune to a fully compromised appliance** where an attacker controls both the database and `GATEWAY_AUDIT_KEY` / signing material.
- Legacy Hyperledger Fabric paths under `blockchain/` and `apps/api` are **reference only** and are not part of the gateway appliance.

For buyers/compliance, preferred wording:

> Governed AI responses are cryptographically hashed; audit events are append-only, hash-chained, and HMAC-signed for tamper-evident immutability.

Do **not** describe the v1 appliance as “blockchain-backed” unless ledger anchoring is added later.

See [OPERATIONS.md](./OPERATIONS.md) for backup of audit keys and migration of integrity columns.

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
