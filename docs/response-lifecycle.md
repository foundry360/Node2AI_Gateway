# Response Lifecycle

**Status:** Architectural contract

## Sequence

```text
MODEL OUTPUT
  → Response Inspector (evidence: PII/PHI/secrets/policy markers/tool calls)
  → PolicyEngine.evaluateResponse
  → TRANSFORM / REDACT if required
  → Authorized detokenization ONLY if policy permits
  → RELEASE or BLOCK
  → Audit
  → Application
```

## Critical rules

1. Do **not** desanitize before policy evaluation.
2. Model-returned tokens are not automatically restored.
3. Inspection or policy failure → `BLOCK`.
4. Tool/action proposals in model output are subject to the same policy gate (future phases).

## Phase coverage

| Phase | Capability |
|-------|------------|
| 1 | Pass-through release after request policy; response inspector stub that fail-closes on forced failure |
| 5 | Full Response Inspector + response policy + authorized detokenization |

## Client response shapes

Approved:

```json
{
  "request_id": "...",
  "status": "approved",
  "model": "...",
  "response": {}
}
```

Blocked:

```json
{
  "request_id": "...",
  "status": "blocked",
  "reason_code": "...",
  "message": "Request blocked by policy."
}
```
