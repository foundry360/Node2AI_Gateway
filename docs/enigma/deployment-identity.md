# Deployment identity

Enigma assigns each **installation** a stable `deployment_id` (UUID).

## What it is

- An installation-scoped identifier for this Enigma deployment (VPC or Air-Gapped).
- Separate from `license_id` (commercial entitlement), `organization_id`, and governance Decision IDs.
- Generated once on first Gateway boot when missing (Postgres appliance), then reused forever for that installation.

## Commercial provisioning

Foundry360 installs Enigma. After Gateway is healthy, Foundry360 retrieves the Deployment ID via admin-authenticated:

```bash
curl -s \
  -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  http://127.0.0.1:8080/v1/admin/system \
  | jq -r .deployment.deployment_id
```

That ID is bound into the vendor-signed license. Customers do not generate or choose the Deployment ID.

See [signed-offline-licensing.md](./signed-offline-licensing.md) for the full Foundry360 runbook.

## Where it is stored

```text
system_config.key   = 'deployment_id'
system_config.value = "<uuid>"   (JSONB string)
```

Memory mode (tests) uses an in-process store only.

## Lifecycle

| Event | Behavior |
| --- | --- |
| New install / first Gateway boot | UUID generated and persisted |
| Gateway / container restart | Same ID (DB volume intact) |
| License renew / change | ID unchanged |
| Restore / clone of DB volume | **Same** deployment ID (by design) |

Environment variables cannot override the persisted Deployment ID.

## Admin visibility

- `GET /v1/admin/system` → `deployment.deployment_id` (preferred for Foundry360 automation)
- System Administration → System → **Deployment** (customer status view)

## Backup / restore and clone limitation

Restoring a database backup that includes `deployment_id` preserves installation identity. A matching license file remains valid.

Phase 2 binds a signed license to the persistent Enigma deployment identity. This prevents license reuse against a **different** deployment identity. Full application/database/license cloning remains possible by design and is deferred to a future stronger installation-binding mechanism if required.
