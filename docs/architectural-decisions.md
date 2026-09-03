# Architectural Decisions

**Status:** ADR log for Node2AI Gateway

## ADR-001: New codebase under `gateway/`, legacy as reference

**Decision:** Do not modify or import the legacy Node2AI application (`apps/`, `packages/`) for the gateway product.

**Why:** Clean governance boundary, no accidental bypass paths from old chat/routing code.

## ADR-002: Modular monolith first

**Decision:** Single Node.js process with module boundaries; split services later if needed.

**Why:** Appliance simplicity, fewer failure modes, faster Phase 1–5 delivery.

## ADR-003: Fastify for Gateway API (not Next.js)

**Decision:** Use Fastify for the public AI execution API. Next.js reserved for admin console (Phase 6).

**Why:** Gateway is an enforcement appliance, not a web app; clearer production surface.

## ADR-004: PostgreSQL canonical schema; SQLite allowed in tests

**Decision:** Ship `db/schema.sql` for PostgreSQL. Phase 1 tests may use an in-memory repository implementing the same interfaces.

**Why:** CI without Docker; appliance still standardizes on PostgreSQL.

## ADR-005: API keys for MVP auth

**Decision:** Bearer API keys hashed at rest, bound to organization + application. Interfaces allow JWT/OIDC/mTLS later.

**Why:** Appropriate for internal service clients; expandable Identity service.

## ADR-006: Policy before routing

**Decision:** PolicyEngine returns eligible models; router never selects outside that set.

**Why:** Core product invariant.

## ADR-007: Ollama as first LocalModelRuntime (Phase 4+)

**Decision:** Abstract `LocalModelRuntime`; implement Ollama first.

**Why:** Simplest reliable local runtime for appliance MVP; swappable for llama.cpp/vLLM.

## ADR-008: Fail closed on audit write (execution path)

**Decision:** If audit persistence fails during an AI execution, BLOCK the request (configurable later for degraded read-only admin modes only).

**Why:** Unaudited AI execution violates regulated-enterprise bar.

## ADR-009: Reject security override parameters

**Decision:** Explicit 400 on known override flags rather than silent ignore (Phase 1).

**Why:** Makes Test 8 unambiguous; prevents clients from believing they disabled controls.

## ADR-010: Stub model executor in Phase 1

**Decision:** Phase 1 uses a local stub that echoes a fixed governed response after policy approval.

**Why:** Proves boundary without cloud dependencies or local GPU requirements.
