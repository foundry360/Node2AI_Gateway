# API Contract

**Status:** Architectural contract  
**Base path:** `/v1`

## Authentication

```http
Authorization: Bearer <api_key>
```

MVP API keys map to `(organization_id, application_id)`. Optional user binding may appear in the body and must be validated against the identity store.

## Canonical AI execution

### `POST /v1/ai/completions`

**Request**

```json
{
  "application_id": "app_123",
  "user": { "id": "user_123" },
  "operation": "summarize",
  "model": "optional-hint",
  "messages": [
    { "role": "user", "content": "..." }
  ],
  "metadata": {
    "correlation_id": "optional-client-correlation"
  }
}
```

**Rules**

- `application_id` in body must match authenticated application (mismatch → `BLOCK` / 403).
- `model` is a preference hint only.
- Unknown fields that attempt to disable security (`sanitize_input`, `sanitize_output`, `skip_policy`, etc.) → rejected (`400`) or ignored with audit flag; Phase 1 **rejects**.

**Approved response — `200`**

```json
{
  "request_id": "req_...",
  "correlation_id": "corr_...",
  "status": "approved",
  "model": "local-general-v1",
  "response": {
    "message": {
      "role": "assistant",
      "content": "..."
    }
  },
  "usage": { "input_tokens": 0, "output_tokens": 0 }
}
```

**Blocked response — `403`** (or `200` with `status: blocked`; Phase 1 uses **403** for policy blocks, **401** for auth)

```json
{
  "request_id": "req_...",
  "correlation_id": "corr_...",
  "status": "blocked",
  "reason_code": "MODEL_NOT_ELIGIBLE",
  "message": "Request blocked by policy."
}
```

## Health (non-execution)

### `GET /health`

Liveness only. Does not execute AI.

### `GET /v1/system/status`

Authenticated operator status (Phase 6 expands). Phase 1 may return gateway + policy + audit readiness.

## Explicitly out of scope for production

- Any route that calls a model provider without PolicyEngine
- “Test chat” endpoints on the production listener
- Client-directed provider URLs

## Error reason codes (stable subset)

| Code | Meaning |
|------|---------|
| `UNAUTHENTICATED` | Missing/invalid credentials |
| `APPLICATION_MISMATCH` | Body app ≠ credential app |
| `APPLICATION_INACTIVE` | App disabled |
| `USER_NOT_FOUND` | User unknown/inactive |
| `VALIDATION_FAILED` | Schema / forbidden flags |
| `POLICY_BLOCKED` | Deterministic deny |
| `POLICY_ENGINE_FAILURE` | Fail closed |
| `MODEL_NOT_ELIGIBLE` | Requested/selected model not allowed |
| `TRANSFORM_FAILURE` | Fail closed |
| `INSPECTION_FAILURE` | Fail closed |
| `INTERNAL_ERROR` | Unexpected; fail closed for execution path |
