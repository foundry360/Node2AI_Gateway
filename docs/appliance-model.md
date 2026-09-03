# Appliance Model

**Status:** Architectural contract

## Form factors

1. Physical appliance (MicroPC / Mac Mini–class)
2. VM image
3. Containerized stack (`docker compose up`)
4. Controlled connected deployment
5. True air-gapped deployment

## On-box components (target)

| Component | Role |
|-----------|------|
| Gateway process | API + orchestration |
| PostgreSQL | Identity, policies, audit, registries |
| Local model runtime | Offline inference |
| Admin console | Governance UI only |
| Network agent | Egress allowlist / health |

## Data residency

The appliance stores **governance metadata**, not the enterprise SoR:

- Organizations, users, applications, roles
- Policies, models, providers, datasets metadata
- Token vault
- Audit / security events
- System configuration

Enterprise payloads are retrieved via connectors when needed and retained only as required for the request.

## Resource baseline (guidance)

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores | 8+ |
| RAM | 8 GB | 16–32 GB (local models) |
| Disk | 40 GB | 200 GB+ with models |
| Network | Optional | Allowlisted egress |

## Operations

- Single-command bring-up (Phase 6)
- Health endpoints for gateway, DB, model runtime, policy store
- Backup of PostgreSQL + vault keys + policy versions
- Signed update channel for connected mode; offline update packs for air-gap
