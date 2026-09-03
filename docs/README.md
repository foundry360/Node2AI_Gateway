# Enigma Documentation

Architectural contracts for **Enigma** — the AI Governance Gateway  
(appliance implementation: `gateway/`; formerly referred to as Node2AI Gateway).

Legacy Node2AI documentation lives in [`legacy/`](./legacy/) and is **reference only**.

| Document | Purpose |
|----------|---------|
| **[enigma/](./enigma/)** | **Enterprise Policy Architecture** (ADR, domain model, contract, migration) |
| [INSTALL.md](./INSTALL.md) | Customer appliance install |
| [OPERATIONS.md](./OPERATIONS.md) | Backup, restore, rotate secrets |
| [PILOT_ACCEPTANCE.md](./PILOT_ACCEPTANCE.md) | Pilot acceptance checklist (Tests 1–10) |
| [architecture.md](./architecture.md) | System architecture & invariants |
| [security-model.md](./security-model.md) | Fail-closed security rules |
| [policy-model.md](./policy-model.md) | Legacy PolicyEngine contract (migrating → enigma/) |
| [request-lifecycle.md](./request-lifecycle.md) | Inbound path |
| [response-lifecycle.md](./response-lifecycle.md) | Outbound path |
| [api-contract.md](./api-contract.md) | Public API |
| [appliance-model.md](./appliance-model.md) | Hardware/VM appliance |
| [deployment-model.md](./deployment-model.md) | Network & packaging |
| [airgap-model.md](./airgap-model.md) | Air-gap mode |
| [connector-model.md](./connector-model.md) | Future data connectors |
| [threat-model.md](./threat-model.md) | Threats & controls |
| [implementation-plan.md](./implementation-plan.md) | Phased delivery |
| [architectural-decisions.md](./architectural-decisions.md) | ADRs |

**Invariant:** Agent reasons. Policy decides. Gateway enforces.
