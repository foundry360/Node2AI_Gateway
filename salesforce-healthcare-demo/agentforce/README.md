# Enigma Clinical Copilot (Agentforce + Patient record)

## Primary demo (preferred)

Use the **Clinical Copilot** panel on a **Patient** record in **Enigma Healthcare Demo**.

1. Gateway on `:8080` + working HTTPS tunnel (Remote Site + Enigma Config in sync)
2. Open **Patients → Charles Greene**
3. In **Clinical Copilot**, try:
   - “Summarize this chart”
   - “Add a note that diet compliance improved”
   - “Update phone to (415) 555-0199”
4. First write should return **HELD** → Authorize in Enigma Decisions → ask again → note/field saves

You do **not** enable write capability as a user step.

## Agentforce Service Agent (optional)

| Field | Value |
|-------|-------|
| Label | **Enigma Service Agent** |
| API name | `Enigma_Service_Agent_v2` |
| Status | Activated (v1) |

```bash
sf org open agent --api-name Enigma_Service_Agent_v2 -o cred-poc
sf agent preview --api-name Enigma_Service_Agent_v2 --use-live-actions -o cred-poc
```

Topics should map to summarize / clinical note update / patient field update.
Write-capability evaluation is no longer a user-facing topic — governance runs inside write actions.

## Legacy

**Enigma Agent Console** is deprecated diagnostics only (baseline / evaluate responses).
