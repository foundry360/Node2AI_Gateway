# Enigma Service Agent (Agentforce)

## Created in `cred-poc`

| Field | Value |
|-------|-------|
| Label | **Enigma Service Agent** |
| API name | `Enigma_Service_Agent_v2` |
| Type | Service Agent (`agentType: customer`) |
| Status | Activated (v1) |
| Agent user | `enigma_service_agent_v2@00dgl00000att0i801715973.ext` (has `Enigma_Healthcare_Demo`) |

Open in Agent Builder:

```bash
sf org open agent --api-name Enigma_Service_Agent_v2 -o cred-poc
```

## Topics → actions

| Topic | GenAiFunction |
|-------|---------------|
| Patient Chart Summarization | `Enigma_Summarize_Patient` |
| Write Capability Evaluation | `Enigma_Evaluate_Write_Capability_Change` |
| Clinical Note Update | `Enigma_Update_Clinical_Notes` |

Spec: [`enigmaServiceAgent.spec.yaml`](enigmaServiceAgent.spec.yaml)

## Live preview (CLI)

```bash
sf agent preview --api-name Enigma_Service_Agent_v2 --use-live-actions -o cred-poc
```

Test utterances:

- “Enable write capability for this agent”
- “Summarize patient Charles Greene”
- “Append a note that diet compliance improved”

Expect write-capability evaluation → `CRITICAL` / `MANDATORY_REVIEW` / `REVIEW`.

## Prerequisites for live actions

1. Gateway on `:8080`
2. Working HTTPS tunnel; Remote Site + Enigma Config endpoint in sync (`scripts/apex/update-tunnel-endpoint.apex`)
3. Enigma Config **Admin API Key** = `GATEWAY_ADMIN_API_KEY`

## Fallback without chat

Use Lightning app **Enigma Agent Console** for the same write-capability CRITICAL path via Invocable Apex.
