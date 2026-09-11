# Salesforce Healthcare Demo → Enigma

Patient app where a **Clinical Copilot** on the record talks naturally (summarize, add notes, update fields). Enigma governs writes behind the scenes — users do not “enable write capability.”

## Architecture

```text
Patient record
  → Clinical Copilot (conversational)
      → summarize → POST /v1/ai/completions
      → add note / update field
          → check Enigma write baseline
          → if needed: POST /v1/admin/governance/changes/evaluate (Prompt = user ask)
          → HELD → Authorize in Enigma → retry → DML
  → Chart refreshes after successful write
```

Salesforce supplies request context only. It does **not** encode HIPAA policy.

## Prerequisites

1. Enigma Gateway on `:8080`
2. Public HTTPS tunnel; Remote Site + Enigma Config in sync
3. Org `cred-poc` (or your DE)
4. Enigma Config **Admin API Key** = `GATEWAY_ADMIN_API_KEY`

## Try it

1. App Launcher → **Enigma Healthcare Demo** → **Patients** → **Charles Greene**
2. Use **Clinical Copilot** in the sidebar:
   - “Summarize this chart”
   - “Add a note that diet compliance improved” → expect hold → Authorize in Enigma → ask again
   - “Update phone to (415) 555-0199”
3. Chart notes/fields update after Authorize + retry

## Deploy

```bash
cd salesforce-healthcare-demo
sf project deploy start -o cred-poc
sf org assign permset -n Enigma_Healthcare_Demo -o cred-poc
```

## Enigma Config

| Field | Example |
|-------|---------|
| Endpoint URL | tunnel URL |
| Application Id | `app_clinical` |
| API Key | completions key |
| Admin API Key | `GATEWAY_ADMIN_API_KEY` |
| Default Model | `local-general-v1` or `cloud-public-gpt` |

## Other surfaces

- **Scenario Console** — completions policy presets (unchanged)
- **Enigma Agent Console** — **legacy** baseline diagnostics only
- **Agentforce Service Agent** — optional; see `agentforce/README.md`
