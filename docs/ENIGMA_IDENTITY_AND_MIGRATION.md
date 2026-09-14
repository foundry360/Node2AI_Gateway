# Enigma Identity and Node2AI Lineage

**Status:** Durable identity note (Product 1.0)  
**Date:** 2026-09-14

## Current product

**Enigma** — AI Action Governance gateway (AI Governance Gateway deployment role).

Canonical definition, packaging, and claims: [`ENIGMA_COMMERCIAL_PRODUCT_1_0.md`](./ENIGMA_COMMERCIAL_PRODUCT_1_0.md).

## Node2AI

**Node2AI** is the predecessor / monorepo heritage. It is **not** a competing current commercial product identity.

| Class | Examples | Treatment |
|-------|----------|-----------|
| Product-facing | READMEs, install/ops/pilot titles, installer banners | **Enigma** |
| Technical namespace | `@node2ai/*`, default `POSTGRES_USER=node2ai`, health `service: node2ai-gateway` | **Preserved** for compatibility |
| Historical / legacy | `docs/legacy/*`, `apps/`, `packages/`, older platform scripts | **Reference only** |
| Vendor | Foundry360 License Manager | Vendor **issues** licenses; **Enigma** verifies |

## Future

A versioned rename of package scopes and default DB identifiers may occur later. It is **out of scope** for Product 1.0 identity cleanup and must not be done as a blind global replace.
