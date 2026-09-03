# Enigma — Policy lifecycle

**Status:** Target process  
**Goal:** Administrators change AI governance without modifying gateway application code.

## States

```text
Draft
  → Validate
  → Simulate
  → Review
  → Approve
  → Activate
  → (Suspend ⇄ Active)
  → Retire
  → Archived
```

| Status | Meaning |
|--------|---------|
| `draft` | Editable; not evaluated in production PDP |
| `review` | Submitted; locked for approval |
| `approved` | Approved; not yet live |
| `active` | Immutable version body; loaded by PDP |
| `suspended` | Temporarily excluded from PDP |
| `retired` | Permanently out of PDP; retained for history |
| `archived` | Cold storage / compliance retention |

**Immutability:** Activating a version freezes its relational content (`content_hash`). Edits create a **new version**.

---

## Change control flow

```text
Draft
 ↓  author edits subjects/resources/actions/conditions/obligations
Validate
 ↓  schema + referential checks + required policy_tests
Simulate
 ↓  admin “what if” without model execution
Review
 ↓  second party / security review
Approve
 ↓  recorded in policy_approvals + governance evidence
Activate
 ↓  PDP loads version; activation event audited
```

Activation **blocked** if:

- required `policy_tests` failing or never run
- validate errors
- effective window invalid
- tenant isolation rules violated

Every activation, suspension, and retirement generates **governance evidence** (audit event) attributable to an administrator.

---

## Admin API (target)

```text
GET    /v1/admin/policies
POST   /v1/admin/policies
GET    /v1/admin/policies/:id
PUT    /v1/admin/policies/:id
POST   /v1/admin/policies/:id/versions
POST   /v1/admin/policies/:id/validate
POST   /v1/admin/policies/:id/simulate
POST   /v1/admin/policies/:id/approve
POST   /v1/admin/policies/:id/activate
POST   /v1/admin/policies/:id/suspend
POST   /v1/admin/policies/:id/retire
GET    /v1/admin/policies/:id/evaluations
```

All require admin authorization (existing `GATEWAY_ADMIN_API_KEY` / future RBAC).

Internal (appliance-local, not public):

```text
POST /internal/policy/evaluate
```

---

## Policy testing (required before activate)

Example suite (Baseline / HIPAA packs):

| ID | Fixture | Expect |
|----|---------|--------|
| TEST 001 | PHI + external model + SUMMARIZE | DENY |
| TEST 002 | PHI + approved local model | ALLOW + LOCAL_MODEL_ONLY |
| TEST 003 | PII + approved cloud | TOKENIZE + ALLOW |
| TEST 004 | Credential + any model | DENY |
| TEST 005 | Agent write-back | REQUIRE_APPROVAL |

Tests are stored in `policy_tests` and executed by the PDP in simulate mode.

---

## Admin console (target UX)

### List

Name · Domain · Status · Version · Priority · Scope · Owner · Effective · Updated  

Actions: View · Edit · Clone · Submit · Activate · Suspend · Retire · Simulate

### Detail

Overview · Scope · Subjects · Resources · Actions · AI Context · Conditions · Decisions · Obligations · Versions · Evidence

Replace the v1 “edit opaque rules JSON” primary UX. JSON may remain an advanced export/import only.
