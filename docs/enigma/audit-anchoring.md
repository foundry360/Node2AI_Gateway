# Enigma Audit Evidence Anchoring

**Status:** Phase 2 + Phase 3A + Phase 3B  
**Builds on:** [audit-integrity.md](./audit-integrity.md), [audit-evidence.md](./audit-evidence.md)  
**Customer storage:** [../customer-controlled-evidence-storage.md](../customer-controlled-evidence-storage.md)

> Cryptographically verifiable evidence anchored to customer-controlled immutable storage.  
> This is **not** absolute immutability in every deployment, and **not** legal/regulatory certification.

Do **not** describe this as blockchain.

---

## Lifecycle

```text
Audit Events are continuously recorded.
Checkpoints periodically seal a contiguous audit-chain boundary.
Evidence anchors preserve signed checkpoints outside Enigma.
External anchoring is asynchronous and does not participate in policy authorization or enforcement.
Customer-controlled external storage determines long-term retention and WORM characteristics.
```

```text
Audit Event → Hash Chain → Checkpoint Trigger → Signed Checkpoint
  → Evidence Anchor → Durable Anchor Job → External Evidence Store
```

Governance remains separate: Request → Policy → Decision → Enforcement → Audit.

---

## Phase 1 checkpoint (preserved)

| Item | Detail |
|------|--------|
| Representation | `AuditCheckpoint` |
| Signing | Ed25519 JWS (`typ: enigma-audit-checkpoint`) |
| Public key | `GATEWAY_AUDIT_CHECKPOINT_PUBLIC_JWKS` |
| Private key | `GATEWAY_AUDIT_CHECKPOINT_PRIVATE_JWK` |
| DB immutability | Append-only |

HMAC seals **events**. Ed25519 seals **checkpoints**. Independent verify uses **only** the checkpoint public key + anchor artifact.

---

## Evidence Anchor

### Payload (`anchor_version: 1`)

Same as Phase 2 — no secrets, PHI, prompts, or responses.

### Object path

```text
enigma/deployments/<deployment_id>/audit/checkpoints/<sequence_end>-<checkpoint_id>.json
```

Optional S3 prefix: `<prefix>/enigma/deployments/...`

### Status model

Evidence history rows remain append-only:

`PENDING` → `ANCHORED` | `FAILED` → optional `VERIFIED`

Operational UI may also show `RETRYING` from the durable job queue.

---

## Storage abstraction

```text
EvidenceAnchorStore
  putAnchor(path, payload) → { uri, hash } | ANCHOR_CONFLICT | STORE_UNAVAILABLE
  getAnchor(uri) → payload + hash
  exists(path) → boolean
```

| Provider | Module |
|----------|--------|
| `filesystem` | `anchor-store.ts` (dev + air-gap) |
| `s3` | `providers/s3/` (customer Object Lock bucket) |

AWS SDK is confined to the S3 adapter. Core audit/PDP code does not import it.

---

## Phase 3A — durable queue

```text
Checkpoint → enqueue audit_anchor_jobs → background worker → external store
```

- Jobs survive process restart (PostgreSQL)
- Bounded exponential backoff → `FAILED`
- Operator retry: `POST /v1/admin/audit/anchors/retry`
- Never on the AI / PDP path

---

## Configuration

```bash
GATEWAY_AUDIT_ANCHORING_ENABLED=true
GATEWAY_AUDIT_ANCHOR_PROVIDER=filesystem   # or s3
GATEWAY_AUDIT_ANCHOR_LOCATION=/var/lib/enigma/audit-anchors

# S3 (customer bucket — credentials via AWS default chain / IAM role)
GATEWAY_AUDIT_ANCHOR_S3_BUCKET=
GATEWAY_AUDIT_ANCHOR_S3_PREFIX=
GATEWAY_AUDIT_ANCHOR_S3_REGION=
# GATEWAY_AUDIT_ANCHOR_S3_ENDPOINT=   # LocalStack only

GATEWAY_AUDIT_ANCHOR_ASYNC=true
GATEWAY_AUDIT_ANCHOR_MAX_ATTEMPTS=8
```

---

## Independent verification

```text
anchor.json + public-key JWKS
```

Does **not** require PostgreSQL, Enigma runtime, `GATEWAY_AUDIT_KEY`, private keys, or cloud credentials (once the artifact is obtained).

---

## Failure isolation

Store outages:

- do **not** DENY / REVIEW / fail AI requests
- do **not** alter `policy_evaluations`
- leave checkpoint intact; job → `RETRY` / `FAILED`
- never overwrite (`ANCHOR_CONFLICT`)

---

## Air-gap

Filesystem provider remains fully supported. No cloud required.

---

## Future

- Azure immutable blob adapter
- Customer KMS/HSM for checkpoint keys
- Merkle proofs
