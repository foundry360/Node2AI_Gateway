# Enigma Audit Evidence Export

**Status:** Phase 1 + Phase 2  
**Related:** [audit-integrity.md](./audit-integrity.md), [audit-anchoring.md](./audit-anchoring.md)

## Goal

```text
Enigma → Evidence Export → Auditor → Independent Verification
```

Cryptographic verification proves the export was not altered relative to the sealed ledger. It is **not** legal/regulatory certification by itself.

## Package layout

```text
enigma-audit-evidence/
  manifest.json
  audit-events.jsonl
  policy-evaluations.jsonl   # optional / refs only
  checkpoints.json
  anchors.json               # Phase 2: external evidence anchor refs
  signatures/
    latest-checkpoint.jws
  verification/              # reserved for verifier output
```

### manifest.json

| Field | Meaning |
|-------|---------|
| `deployment_id` | Installation UUID |
| `enigma_software_version` | Software release |
| `canonical_version` | Evidence schema (1) |
| `first_sequence` / `last_sequence` | Deployment-scoped sequences |
| `event_count` | Exported events |
| `first_event_id` / `last_event_id` | Boundary audit IDs |
| `root_hash` | Tip `event_hash` |
| `checkpoint_id` / `checkpoint_signature` / `key_id` | Latest signed checkpoint |
| `generated_at` | Export time (ISO) |

Events include hashes and governance metadata — **not** raw PHI or response bodies.

## API

```http
GET /v1/admin/audit/evidence/export
Authorization: Bearer <admin>
```

Returns a JSON package suitable for writing to disk with `writeEvidencePackage()`.

## Independent verification

Use the gateway verifier module (same code path as appliance verify):

```ts
import {
  verifyEvidencePackage,
  createJoseCheckpointVerifier,
  loadCheckpointPublicJwks,
} from './audit/index.js';

const result = await verifyEvidencePackage({
  pkg,
  hmacSigningKey: process.env.GATEWAY_AUDIT_KEY!,
  checkpointVerifier: createJoseCheckpointVerifier(
    await loadCheckpointPublicJwks(process.env.GATEWAY_AUDIT_CHECKPOINT_PUBLIC_JWKS),
  ),
});
// result.status === 'VERIFIED' | 'FAILED' | ...
```

Checks:

1. Sequence continuity / duplicates  
2. Hash-chain links  
3. Event hash recomputation  
4. HMAC event signatures (requires audit HMAC key held by verifier trust domain)  
5. Checkpoint root + Ed25519 signature (public key only)

## VPC vs air-gap

| Mode | Notes |
|------|-------|
| VPC | Export via Admin API; store package in customer evidence store; optional future Object Lock |
| Air-gap | Same API locally; copy package via approved media; verify offline with public JWKS + HMAC key custody |

## Limitations

- HMAC verification of individual events requires `GATEWAY_AUDIT_KEY` (appliance trust domain).
- Checkpoint Ed25519 enables asymmetric verification of **checkpoints** without the private key.
- Independent **anchor** verification needs only the anchor artifact + public JWKS (Phase 2).
- Content reconstruction requires separately retained plaintext bound by `response_hash` / `input_hash`.
- Merkle proofs and production cloud storage adapters remain future work.
