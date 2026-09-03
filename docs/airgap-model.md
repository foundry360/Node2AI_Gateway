# Air-Gap Model

**Status:** Architectural contract (Phase 7 implemented)

## Modes

| Mode | External network | AI execution |
|------|------------------|--------------|
| `connected` | Allowlisted only | Local + approved private/cloud |
| `airgap` | None for AI providers | Local only |

Mode is a **system configuration** (`GATEWAY_DEPLOYMENT_MODE=airgap`), not a client parameter.

## Air-gap invariants

1. Policy, identity, audit, interrogation, transform, and response inspection run locally.
2. External provider adapters are **not registered** in air-gap mode.
3. Model Gateway refuses non-local providers/models (defense in depth).
4. PolicyEngine filters eligible models to `local-*` in air-gap.
5. No telemetry egress; outbound AI HTTP is denied by configuration.
6. Updates via offline signed bundles (operational process).

## Proof requirement (Test 10) ✅

Automated tests in `gateway/tests/acceptance/phase7.test.ts`:

1. Force `deploymentMode: airgap`
2. Execute governed completion via local runtime
3. Assert success with **zero** external provider calls
4. Assert audit `provider = local-runtime`
5. Assert cloud model requests are blocked with zero outbound HTTP

## Appliance bring-up

```bash
cd gateway
docker compose -f docker-compose.yml -f docker-compose.airgap.yml up --build
```

## Network enforcement (enterprise)

Applications must not reach AI providers directly. See [deployment-model.md](./deployment-model.md) and [threat-model.md](./threat-model.md) (T1 Application bypass).
