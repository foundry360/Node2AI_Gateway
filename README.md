# Enigma

**Enigma** is an **AI Action Governance** gateway.

> Enigma governs AI actions from policy to proof.

**Operating model:** Bind → Decide → Enforce → Review → Prove  
**Architecture:** Policy → Decision → Enforcement → Evidence  
**Deployment role:** AI Governance Gateway (appliance / enterprise software)

Enigma binds applications, users, and optional Agents/Tools; decides whether an AI-mediated action may proceed; enforces that Decision at the Gateway boundary it controls; routes REVIEW to authorized approvers; and produces evidence of Decision, Enforcement, and client-reported Outcome — without claiming to execute every enterprise side effect.

## Current product (ship in this repository)

| Path | Role |
|------|------|
| [`gateway/`](./gateway/) | **Enigma** appliance — API, policy engine, admin console |
| [`docs/`](./docs/) | Product, architecture, integration, and ops documentation |
| [`foundry360-license-manager/`](./foundry360-license-manager/) | Vendor license issuer (Foundry360); Enigma verifies licenses |

**Start here**

- Install: [`docs/INSTALL.md`](./docs/INSTALL.md)  
- Gateway overview: [`gateway/README.md`](./gateway/README.md)  
- Product definition: [`docs/ENIGMA_PRODUCT_1_0.md`](./docs/ENIGMA_PRODUCT_1_0.md)  
- Commercial definition: [`docs/ENIGMA_COMMERCIAL_PRODUCT_1_0.md`](./docs/ENIGMA_COMMERCIAL_PRODUCT_1_0.md)  
- Integration contract: [`docs/ENIGMA_INTEGRATION_CONTRACT.md`](./docs/ENIGMA_INTEGRATION_CONTRACT.md)  
- Identity / Node2AI lineage: [`docs/ENIGMA_IDENTITY_AND_MIGRATION.md`](./docs/ENIGMA_IDENTITY_AND_MIGRATION.md)

```bash
cd gateway
chmod +x install.sh
./install.sh
```

- Gateway API: http://localhost:8080  
- Admin console: http://localhost:3080  

## What Enigma is not

Enigma is not IAM, GRC, DLP, SIEM, MLOps, a workflow/BPM engine, a data catalog, a universal execution proxy, or a public multi-tenant SaaS product in Product 1.0.

Where enforcement is **client-commit-required**, Enigma authorizes (`commit_allowed`); the customer system performs the external side effect and reports Outcome.

## Node2AI lineage

**Enigma** is the current product. **Node2AI** is the predecessor / monorepo heritage.

Selected technical namespaces (for example `@node2ai/*` package names, default database user/db names, and some service identifiers) remain for compatibility. They are **not** a competing product brand.

Legacy materials under `apps/`, `packages/`, `docs/legacy/`, and older root scripts describe the historical Node2AI platform and are **reference only** — not the Product 1.0 commercial definition.

## Deployment note

Enigma is designed for **enterprise on-premises / VPC / air-gapped** deployment (Docker Compose appliance). It should not be treated as a Vercel-style public SaaS app.
