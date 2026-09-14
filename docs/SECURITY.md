# Security (Enigma Gateway)

Operational security notes for the appliance. Architectural contract: [security-model.md](./security-model.md).

## Audit integrity keys

| Secret | Purpose | Must not |
|--------|---------|----------|
| `GATEWAY_AUDIT_KEY` | HMAC of audit `event_hash` | Appear in Git, images, Admin API, logs |
| `GATEWAY_AUDIT_CHECKPOINT_PRIVATE_JWK` | Ed25519 private JWK for checkpoints | Be stored in Postgres or returned by API |
| `GATEWAY_AUDIT_CHECKPOINT_PUBLIC_JWKS` | Public verify set | Contain private `d` |

License signing keys, JWT/session secrets, vault keys, and DB credentials are separate trust domains.

## Fail closed

Integrity verification never silently repairs history. Failures surface as `FAILED` with explicit codes — see [enigma/audit-integrity.md](./enigma/audit-integrity.md).

## Checkpoint lifecycle (Phase 3B)

Automatic checkpoints use event and/or time thresholds. External anchors remain async. See [enigma/audit-integrity.md](./enigma/audit-integrity.md).

## Evidence anchoring (Phase 2 + 3A)

External anchors use the checkpoint **public** key for independent verification. Storage credentials (filesystem path / AWS IAM for S3) are separate from cryptographic keys. S3 is an optional adapter — see [customer-controlled-evidence-storage.md](./customer-controlled-evidence-storage.md).

See [enigma/audit-anchoring.md](./enigma/audit-anchoring.md).

## Client Outcome evidence (Phase 4)

`POST /v1/ai/actions/outcome` accepts client-reported execution results only when bound to a prior `CLIENT_COMMIT_ALLOWED` enforcement for the same application/evaluation. Outcome is **not** independent verification of Salesforce (or any external system). Receipts seal into the existing audit HMAC chain. See [PHASE_4_ENFORCEMENT_OUTCOME.md](./PHASE_4_ENFORCEMENT_OUTCOME.md) and the Product 1.0 [`ENIGMA_INTEGRATION_CONTRACT.md`](./ENIGMA_INTEGRATION_CONTRACT.md).
