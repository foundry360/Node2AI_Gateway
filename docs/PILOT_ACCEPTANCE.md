# Pilot Acceptance — Node2AI Gateway v1

Customer (or internal) checklist proving:

> Applications cannot execute AI, and cannot receive model output, except through Node2AI policy enforcement.

Prerequisites: appliance installed per [INSTALL.md](./INSTALL.md). Have the admin API key from `.env` and a completion API key (seed `n2ai_test_key_approved_app` or one issued in Admin → Applications).

Set:

```bash
export GW=http://127.0.0.1:8080
export APP_KEY=n2ai_test_key_approved_app
export ADMIN_KEY=<from .env GATEWAY_ADMIN_API_KEY>
```

---

## Test 1 — Approved app → governed completion → local model → released response

```bash
curl -sS -X POST "$GW/v1/ai/completions" \
  -H "Authorization: Bearer $APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "application_id": "app_clinical",
    "user": {"id": "user_clinician"},
    "operation": "summarize",
    "model": "local-general-v1",
    "messages": [{"role":"user","content":"Summarize: quarterly readiness looks good."}]
  }'
```

**Pass:** HTTP 200, `status: approved`, response released, `model` / provider reflects local runtime (stub in CI, Ollama on appliance). Response also includes `integrity.response_hash` and `integrity.event_hash`.

---

## Test 1b — Audit integrity chain is valid

```bash
curl -sS -H "Authorization: Bearer $ADMIN_KEY" \
  "$GW/v1/admin/audit/integrity"
```

**Pass:** `"integrity": { "ok": true, ... }`. Admin → Audit shows response hashes and chain status.

---

## Test 2 — Unauthorized model → BLOCK

```bash
curl -sS -X POST "$GW/v1/ai/completions" \
  -H "Authorization: Bearer $APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "application_id": "app_clinical",
    "user": {"id": "user_clinician"},
    "operation": "summarize",
    "model": "not-allowed-model",
    "messages": [{"role":"user","content":"Hello"}]
  }'
```

**Pass:** Blocked (non-200 / `status: blocked`), reason indicates model eligibility / allowlist.

---

## Test 3 — PII → tokenize → model never sees raw PII

```bash
curl -sS -X POST "$GW/v1/ai/completions" \
  -H "Authorization: Bearer $APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "application_id": "app_clinical",
    "user": {"id": "user_clinician"},
    "operation": "summarize",
    "model": "local-general-v1",
    "messages": [{"role":"user","content":"Contact Jane Doe at jane.doe@example.com about follow-up."}]
  }'
```

**Pass:** Request succeeds or is governed; audit / transform shows tokenization; raw email must not appear in model-bound payload evidence (check audit `input_transformation`).

---

## Test 4 — Transform failure → BLOCK

Use admin/test hook or force vault failure in lab. In shipped appliance, simulate by stopping mid-path only in automated suite (`FailingTransformService`).

**Pass:** Completions return blocked; no model output released. (Covered by automated phase tests.)

---

## Test 5 — PHI / credential in response → BLOCK

Covered by response inspector + policy (automated phase 5). Manual: scripted provider returning SSN/`sk-` patterns must BLOCK.

**Pass:** `response_decision: BLOCK` (or equivalent), no raw secret released.

---

## Test 6 — Tokens not auto-detokenized

Response containing `{{TOK_...}}` must not restore plaintext unless response policy authorizes detokenization.

**Pass:** Client sees tokens or redaction — not original PII — by default.

---

## Test 7 — No direct provider route on appliance

```bash
curl -sS -o /dev/null -w "%{http_code}" "$GW/v1/openai/chat/completions"
curl -sS -o /dev/null -w "%{http_code}" "$GW/chat"
```

**Pass:** 404 (or not found). Only `POST /v1/ai/completions` executes AI.

---

## Test 8 — Security override flags rejected

```bash
curl -sS -X POST "$GW/v1/ai/completions" \
  -H "Authorization: Bearer $APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "application_id": "app_clinical",
    "user": {"id": "user_clinician"},
    "operation": "summarize",
    "model": "local-general-v1",
    "messages": [{"role":"user","content":"hi"}],
    "bypass_policy": true,
    "skip_inspection": true
  }'
```
**Pass:** Overrides ignored or request blocked; policy still enforced.

---

## Test 9 — Policy failure → BLOCK

Automated (`FailingPolicyEngine`). Manual: disable critical posture only in lab and confirm fail-closed defaults remain for evaluation errors.

**Pass:** Evaluation errors never become ALLOW.

---

## Test 10 — Air-gap compose: success with zero external AI calls

```bash
cd gateway
./install.sh airgap
# or: docker compose -f docker-compose.yml -f docker-compose.airgap.yml up --build -d
```

Repeat Test 1 with local model only. Attempt cloud model id → BLOCK.

**Pass:** Completions use Ollama/local only; `/v1/admin/system` shows `deployment_mode: airgap`, `require_ollama: true`. Stop Ollama → `/health` 503. Before the model is pulled, completions should return `LOCAL_MODEL_NOT_READY` (not a generic internal error).

---

## Test 11 — Enigma EPA policy packs (simulate / validate / lifecycle)

```bash
curl -sS -H "Authorization: Bearer $ADMIN_KEY" \
  "$GW/v1/admin/policy-packs"

curl -sS -X POST -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  "$GW/v1/admin/policy/simulate" \
  -d '{
    "classification": "PHI",
    "requested_model": "cloud-public-gpt",
    "application_type": "clinical",
    "roles": ["clinician"]
  }'

curl -sS -X POST -H "Authorization: Bearer $ADMIN_KEY" \
  "$GW/v1/admin/policies/pol_phase2_core/validate"
```

**Pass:** Packs include Enterprise Baseline + HIPAA (+ draft Financial/Legal). Simulate PHI→cloud returns `DENY` / `PHI_PUBLIC_CLOUD_BLOCKED` without model execution (`model_executed: false`). Validate returns `ok: true`.

Lifecycle (optional): Admin → Policies → Approve → Activate (separate keys if `GATEWAY_POLICY_APPROVER_KEY` / `GATEWAY_POLICY_ACTIVATOR_KEY` set). Suspended policies cannot activate until approved.

---

## Operator onboarding (no code changes)

1. Open http://localhost:3080 → Applications  
2. Create an application with allowed models/operations  
3. Issue API key (copy secret once)  
4. Run Test 1 with the new key  

**Pass:** New app can complete governed requests without redeploying gateway code.

---

## Sign-off

| # | Result | Tester | Date |
|---|--------|--------|------|
| 1 | ☐ | | |
| 1b | ☐ | | |
| 2 | ☐ | | |
| 3 | ☐ | | |
| 4 | ☐ (auto OK) | | |
| 5 | ☐ (auto OK) | | |
| 6 | ☐ | | |
| 7 | ☐ | | |
| 8 | ☐ | | |
| 9 | ☐ (auto OK) | | |
| 10 | ☐ | | |
| 11 | ☐ | | |
| Onboard | ☐ | | |

Release tag: **`v0.1.1-rc.1`** / post-EPA soak toward **`v0.1.1`**
