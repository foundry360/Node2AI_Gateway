# Customer-Controlled Evidence Storage

**Status:** Phase 3A  
**Related:** [audit-anchoring.md](./enigma/audit-anchoring.md), [audit-integrity.md](./enigma/audit-integrity.md)

> Cryptographically verifiable evidence anchored to customer-controlled immutable storage.  
> S3 Object Lock is an **adapter**, not an Enigma dependency.

## Trust boundaries

| Party | Owns |
|-------|------|
| **Enigma** | Evidence generation, event hashing, chain integrity, checkpoint signing, anchor creation, verification logic |
| **Customer** | External storage account, bucket/container, retention / Object Lock, IAM, long-term custody |

```text
Enigma governs → Enigma creates cryptographic evidence
  → EvidenceAnchorStore abstracts durability
  → Customer-controlled storage preserves evidence
```

## Providers

| Provider | Use |
|----------|-----|
| `filesystem` | Dev + air-gapped (no cloud) |
| `s3` | VPC + customer AWS S3 with Object Lock |
| `none` | Anchoring disabled (`NOT CONFIGURED`) |

Core audit / PDP / enforcement code never imports AWS APIs. The S3 adapter lives under `gateway/src/audit/providers/s3/`.

## Recommended AWS IAM (minimum)

Allow:

- `s3:PutObject`
- `s3:GetObject`
- `s3:HeadObject`

Do **not** grant:

- `s3:DeleteObject`
- `s3:PutBucketPolicy`
- `s3:DeleteBucket`
- broad admin

Prefer IAM role / workload identity over static access keys. Credentials must not enter the database, Admin UI, license files, audit events, or evidence exports.

## Object Lock

Production S3 evidence storage should use:

- Object Lock enabled on the customer bucket
- Retention configured by the customer
- Write-once semantics enforced by the platform

Enigma also refuses overwrite/delete in the adapter, but **platform retention** is the durability guarantee.

## Checkpoint vs anchor vs evidence package

| Artifact | Role |
|----------|------|
| **Checkpoint** | Cryptographic seal of a contiguous sequence range |
| **Anchor** | External preservation of that signed checkpoint |
| **Evidence package** | On-demand export for investigation (not auto-archived per checkpoint) |

Phase 3B automates checkpoint creation (event + time thresholds) and keeps anchoring asynchronous.

With PostgreSQL, anchoring is asynchronous:

```text
Checkpoint → enqueue job → return
Background worker → put → ANCHORED | RETRY | FAILED
```

Store outages never change policy decisions or block AI execution.

## Air-gap

```text
Signed checkpoint → filesystem anchor → offline package → independent verify
```

No AWS, Azure, or internet required.
