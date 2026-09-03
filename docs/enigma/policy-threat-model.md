# Enigma — Policy layer threat model

**Status:** Policy-specific threats (extends [../threat-model.md](../threat-model.md))  
**Scope:** Policy administration, PDP, PEP integration, evaluations, packs.

For each: Attack · Impact · Control · Detection · Residual risk.

---

### P1 — Policy bypass

| Field | Detail |
|-------|--------|
| **Attack** | Route that executes models without PDP; or client override flags |
| **Impact** | Ungoverned AI |
| **Control** | Single orchestrator path; reject security overrides; invariant tests; no shadow execute APIs |
| **Detection** | Audit events missing `evaluation_id`; CI acceptance tests |
| **Residual** | Compromised gateway process |

### P2 — Unauthorized policy modification

| Field | Detail |
|-------|--------|
| **Attack** | Stolen admin key edits/activates weak policy |
| **Impact** | Systemic under-enforcement |
| **Control** | Admin authn; future admin RBAC; approval workflow; immutable versions; activation audit |
| **Detection** | policy_approvals + audit anomalies |
| **Residual** | Valid admin acting maliciously |

### P3 — Privilege escalation via policy

| Field | Detail |
|-------|--------|
| **Attack** | Tenant admin crafts policy granting cross-app/model rights |
| **Impact** | Unauthorized data/model use |
| **Control** | Scope checks; cannot widen beyond tenant; platform packs only by platform admin |
| **Detection** | Policy diff review; simulate before activate |
| **Residual** | Over-broad platform packs |

### P4 — Tenant policy leakage

| Field | Detail |
|-------|--------|
| **Attack** | IDOR on `/policies/:id` or evaluations across tenants |
| **Impact** | Confidential policy / evidence disclosure |
| **Control** | organization_id filter on all admin queries; tests for cross-tenant deny |
| **Detection** | Authz failure metrics |
| **Residual** | Mis-seeded null org policies |

### P5 — Stale policy versions

| Field | Detail |
|-------|--------|
| **Attack** | PDP caches retired version; or clock skew on effective window |
| **Impact** | Wrong allow/deny |
| **Control** | Load only `active` + effective window; version pin in evaluation evidence; restart-safe reload |
| **Detection** | evaluation records show unexpected versions |
| **Residual** | Multi-instance eventual consistency (mitigate with DB as source of truth) |

### P6 — Policy conflicts

| Field | Detail |
|-------|--------|
| **Attack** | Overlapping packs produce ALLOW vs DENY or ROUTE_LOCAL vs CLOUD_ONLY |
| **Impact** | Ambiguous authz / exploitable gaps if fail-open |
| **Control** | Conflict detection; precedence; unresolved → DENY; record `policy_conflicts` |
| **Detection** | Conflict rate dashboards |
| **Residual** | Misconfigured precedence |

### P7 — Policy downgrade

| Field | Detail |
|-------|--------|
| **Attack** | Reactivate old weak version; suspend regulatory pack |
| **Impact** | Regression of controls |
| **Control** | Activation requires tests; approvals; audit; optional “minimum pack” constraints (**Future**) |
| **Detection** | Activation evidence diffs |
| **Residual** | Authorized downgrade by admin |

### P8 — Audit / decision tampering

| Field | Detail |
|-------|--------|
| **Attack** | Alter `policy_evaluations` or completion audit |
| **Impact** | False compliance story |
| **Control** | Existing hash chain + HMAC + append-only audit; evaluation_id in audit payload |
| **Detection** | `/v1/admin/audit/integrity` |
| **Residual** | Full compromise of DB + signing keys |

### P9 — Fail-open behavior

| Field | Detail |
|-------|--------|
| **Attack** | Crash PDP or empty repository hoping default allow |
| **Impact** | Ungoverned AI |
| **Control** | Explicit DENY on errors; no allow-on-empty for production packs; health checks |
| **Detection** | `fail_closed` evaluations; 403/503 spikes |
| **Residual** | Bug in adapter mapping |

### P10 — Malicious policy input

| Field | Detail |
|-------|--------|
| **Attack** | Pathological conditions / huge JSONB / injection in matchers |
| **Impact** | DoS; unexpected matches |
| **Control** | Schema validation; bounded operators; parameterized SQL; size limits |
| **Detection** | Validate failures; PDP latency |
| **Residual** | Complex matcher bugs |

### P11 — Unauthorized simulation

| Field | Detail |
|-------|--------|
| **Attack** | Non-admin probes policies via simulate |
| **Impact** | Policy oracle / recon |
| **Control** | Admin auth only; rate limit; no model execution |
| **Detection** | Auth failures on simulate |
| **Residual** | Insider recon |

### P12 — Unauthorized activation

| Field | Detail |
|-------|--------|
| **Attack** | Activate without approval/tests |
| **Impact** | Live weak policy |
| **Control** | Server-side state machine; required tests; approve ≠ activate privileges (**Future** split) |
| **Detection** | Rejected transitions logged |
| **Residual** | Single shared admin key in v1 appliance |

---

## Network bypass (reminder)

Direct `Application → api.openai.com` is **T1** in the platform threat model — mitigated by enterprise egress controls, not by PDP alone. Placeholder: AI Egress Discovery / Monitoring / Enforcement.
