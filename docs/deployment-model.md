# Deployment Model

**Status:** Architectural contract

## Topologies

### A. Connected private appliance

```text
Enterprise Apps ──(private net)──► Node2AI Gateway ──(allowlist)──► Approved providers
                                      │
                                      ├── PostgreSQL (local)
                                      └── Local models (optional)
```

### B. True air-gap

```text
Enterprise Apps ──► Node2AI Gateway ──► Local model runtime only
                         │
                         └── PostgreSQL (local)
```

No external AI dependencies.

### C. VM / Kubernetes

Same logical components; network policies implement allowlisted egress.

## Network enforcement (required for production)

> If applications can directly reach OpenAI/Anthropic/etc., they can bypass Node2AI.

Enterprise controls:

1. Default-deny egress from application subnets
2. Permit application → Node2AI only for AI traffic
3. Permit Node2AI → approved provider endpoints only (connected mode)
4. DNS restrictions / TLS inspection where required by customer policy
5. Appliance health check warns if gateway host has overly broad egress

## Configuration surfaces

- Provider endpoint allowlist
- Deployment mode: `connected` | `airgap`
- TLS certificates for gateway listener
- Admin console bind address (management network)

## Packaging roadmap

| Phase | Deliverable |
|-------|-------------|
| 1 | Local `gateway` process + in-memory/SQLite-or-PG for tests |
| 6 | `docker compose up` full appliance |
| 7 | Air-gap compose profile + offline egress proof |
