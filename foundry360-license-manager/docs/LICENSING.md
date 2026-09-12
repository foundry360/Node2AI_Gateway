# Licensing

> Foundry360 is the license issuer and provisioning authority. Enigma is the license verifier and enforcement point.

> Deployment ID identifies the Enigma installation. License ID identifies the Foundry360 commercial entitlement. They are distinct identifiers.

## Claims (Enigma-compatible)

| Claim | Source |
|-------|--------|
| `license_version` | Always `1` |
| `license_id` | Commercial ID (e.g. `ENIGMA-ACME-2026-001`) |
| `customer_name` | Customer record name |
| `deployment_id` | Enigma UUID from registered deployment |
| `deployment_type` | `vpc` or `air_gapped` |
| `valid_from` / `valid_until` | `YYYY-MM-DD` |
| `issued_at` | ISO timestamp at signing |
| `key_id` | Default `enigma-lic-2026-09` |
| `grace_days` | Integer (default 30) |

Claims are always constructed on the server from database records. Client-supplied claim overrides are ignored at issue time.

## Statuses (License Manager)

| Status | Meaning |
|--------|---------|
| `DRAFT` | Created, not signed |
| `ISSUED` | Signed; artifact available |
| `SUPERSEDED` | Replaced by a newer issued license on the same deployment |
| `REVOKED` | Commercial revocation record |

## Statuses (Enigma runtime)

After install, Enigma evaluates: `ACTIVE` | `GRACE` | `DISABLED` | `INVALID`.

## Renewal

Renewal creates a **new** License ID and a new signed artifact for the **same** Deployment ID. Prior licenses remain in history (`SUPERSEDED` / events). Never mutate an already-issued cryptographic identity.

## Revocation

Revocation in this app is a Foundry360 commercial/audit record. It does **not** push a remote disable to Enigma. Runtime disable requires Enigma’s existing validity/grace rules or delivery of a new signed artifact per Enigma’s contract.

## Download

Filename is always `enigma.license`. Contents are not displayed in the UI. Each download records a `DOWNLOADED` event.
