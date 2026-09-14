# Enigma Audit Integrity

**Status:** Phase 1 + Phase 2 (anchoring)  
**Terminology:** append-only · tamper-evident · cryptographically verifiable · signed checkpoint · evidence anchor · audit integrity · governance evidence  

> Cryptographic verification is **not** legal/regulatory certification. It proves evidence integrity, not compliance sufficiency by itself.

Do **not** describe this as blockchain.

---

## Canonical architecture (current + Phase 1)

```text
Request
  → Policy Evaluation (policy_evaluations — Decision authority)
  → Decision / Consequence / Enforcement (Gateway orchestrator)
  → Outcome
  → Audit Evidence (audit_events — ops + integrity seals)
  → Cryptographic Integrity (hash chain + HMAC)
  → Signed Checkpoint (Ed25519, Phase 1)
  → Evidence Anchor (customer-controlled store, Phase 2)
  → Independent Verification (export package + verifier)
```

### What already existed (preserved)

| Capability | Location |
|------------|----------|
| SHA-256 `response_hash` | `gateway/src/audit/integrity.ts` |
| Hash chain `prev_event_hash` → `event_hash` | same + `IntegrityAuditService` |
| HMAC-SHA256 `integrity_signature` | `GATEWAY_AUDIT_KEY` |
| Append-only UPDATE/DELETE triggers | `gateway/db/schema.sql` |
| Decision binding `evaluation_id` / `decision_hash` | `decision-binding.ts` |
| Admin list + integrity GET | `/v1/admin/audit`, `/v1/admin/audit/integrity` |
| Audit UI integrity panel | Admin → Audit |

## Checkpoint lifecycle (Phase 3B)

```text
Audit events → (event threshold OR time threshold) → Signed Checkpoint
  → EvidenceAnchor → durable job → External store
```

Defaults:

| Setting | Default |
|---------|---------|
| Event threshold | 500 (`GATEWAY_AUDIT_CHECKPOINT_EVERY_EVENTS`) |
| Time threshold | 900s / 15m (`GATEWAY_AUDIT_CHECKPOINT_INTERVAL_SECONDS`) |
| Catch-up per tick | 5 checkpoints max |

Checkpoints cover **contiguous** uncheckpointed sequences only. Empty checkpoints are refused. Concurrent creates are serialized (in-memory lock / Postgres advisory lock + unique `(deployment_id, sequence_end)`).

Catch-up: worker creates up to `MAX_PER_TICK` checkpoints per cycle, each covering at most the event threshold (remaining events wait for the next tick). Time-triggered checkpoints may cover fewer than the event threshold when new events exist.

External anchoring remains asynchronous and never participates in policy/enforcement.

See [audit-anchoring.md](./audit-anchoring.md).

---

## Hash-chain construction

### Genesis

First event in a sealed chain uses `prev_event_hash = GENESIS`.

### Legacy events (canonical version absent / 0)

Payload fields (fixed key order via `JSON.stringify` of a fixed object):

`audit_id`, `timestamp`, `request_id`, `correlation_id`, org/app/user, `operation`,
policy/response decisions, model/provider, `reason_codes`, `response_hash`,
`prev_event_hash`, optional `evaluation_id` / `decision_hash`.

`event_hash = SHA-256(payload)`  
`integrity_signature = HMAC-SHA256(event_hash, GATEWAY_AUDIT_KEY)`

Legacy rows remain verifiable with this format. **Do not rehash historical rows.**

### Canonical version 1

Adds to the sealed payload (in addition to legacy fields):

- `audit_canonical_version: 1`
- `deployment_id`
- `sequence_number`
- `input_hash` (optional; SHA-256 of request content when provided for hashing — never raw PHI)

HMAC event authentication remains for appliance-local integrity. Checkpoints add **asymmetric** independent verification.

---

## Sequence semantics

- Scoped per `deployment_id`
- Allocated atomically (`audit_ledger_counters`)
- Not derived from timestamps
- Gaps / duplicates → verification failure (`SEQUENCE_GAP` / `DUPLICATE_SEQUENCE`)

---

## Checkpoints

A checkpoint is an **additional** append-only record. It never mutates audit events.

Root hash for Phase 1 = `event_hash` of the last event in `[sequence_start, sequence_end]`.

Signed with Ed25519 (`key_id` in checkpoint). Private key file / env path only — never in Git, DB, Docker image layers, API, or UI.

---

## Verification failure codes

| Code | Meaning |
|------|---------|
| `CHAIN_BROKEN` / `prev_hash_mismatch` | Previous hash link failed |
| `EVENT_HASH_MISMATCH` | Recomputed hash ≠ stored |
| `SEQUENCE_GAP` | Missing sequence |
| `DUPLICATE_SEQUENCE` | Duplicate sequence |
| `CHECKPOINT_MISMATCH` | Root hash does not match chain tip |
| `INVALID_CHECKPOINT_SIGNATURE` | Ed25519 verify failed |
| `UNKNOWN_SIGNING_KEY` | `key_id` not in trusted public set |
| `UNSUPPORTED_CANONICAL_VERSION` | Unknown version |
| `DEPLOYMENT_MISMATCH` | Event/checkpoint deployment ≠ expected |
| `signature_invalid` | HMAC failure (legacy reason string preserved) |

Never report `VERIFIED` if any check fails. Never auto-repair history.

---

## Key custody

| Key | Purpose | Storage |
|-----|---------|---------|
| `GATEWAY_AUDIT_KEY` | HMAC seal of `event_hash` | Env / secret mount (appliance) |
| Audit checkpoint Ed25519 private JWK | Sign checkpoints | File path (`GATEWAY_AUDIT_CHECKPOINT_PRIVATE_JWK`) — not in DB |
| Matching public JWK | Verify checkpoints / exports | File or bundled verify trust store |

Separate from license signing keys, JWT secrets, vault keys, and DB credentials.

VPC: path ready for customer KMS/HSM wrapping (Phase 3).  
Air-gap: local file under `/run/secrets` or equivalent; no network required.

---

## Future (Phase 3+)

- Merkle inclusion proofs
- Customer-managed KMS/HSM
- Production S3 Object Lock / Azure immutable storage adapters
- Stronger offline WORM replication tooling

External evidence anchoring (filesystem + independent verify) is **Phase 2** — see [audit-anchoring.md](./audit-anchoring.md).

---

## Related docs

- [audit-anchoring.md](./audit-anchoring.md) — Phase 2 external evidence anchors
- [audit-evidence.md](./audit-evidence.md) — export package + independent verify
- [../security-model.md](../security-model.md) — security contract
- [../OPERATIONS.md](../OPERATIONS.md) — ops / backup / keys
