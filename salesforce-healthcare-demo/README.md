# Salesforce Healthcare Demo → Enigma

Small Patient app in Salesforce that sends clinical notes to Enigma Gateway for a governed summary, plus an **Enigma Agent Console** for Agentforce write-capability change governance.

## Architecture

```text
Patient record (Clinical Notes)
  → LWC "Summarize"
    → Apex EnigmaGatewayService
    → HTTPS POST /v1/ai/completions
  → Enigma Gateway (policy → TOKENIZE if authorized → model → output governance → proof)

Agent Console / Agentforce
  → Enable write capability
    → HTTPS POST /v1/admin/governance/changes/evaluate
    → Enigma change governance (WRITE_CAPABILITY → CRITICAL → MANDATORY_REVIEW)
  → Invocable summarize / update clinical notes
```

Salesforce supplies **generic** purpose / governance context. It does **not** encode HIPAA policy.

## Prerequisites

1. Enigma Gateway listening on `:8080`
2. Public HTTPS tunnel to `:8080` (Salesforce cannot call `localhost`)
3. Org authenticated (`cred-poc` or your Dev Hub/DE)
4. Enigma Config **Admin API Key** set to `GATEWAY_ADMIN_API_KEY` (change-governance routes)

## Deployed to `cred-poc`

- App: **Enigma Healthcare Demo** (patients + Scenario Console)
- App: **Enigma Agent Console** (write-capability change lab)
- Object: **Patient** (`Patient__c`) + sample **Charles Greene**
- Config: Custom Setting **Enigma Config**
- Remote Site: **Enigma_Gateway_Tunnel**

## Deploy

```bash
cd salesforce-healthcare-demo
sf project deploy start -o cred-poc
sf org assign permset -n Enigma_Healthcare_Demo -o cred-poc
```

Update Remote Site + Custom Setting when the tunnel URL changes (see `scripts/apex/update-tunnel-endpoint.apex`).

## Enigma Config fields

| Field | Example |
|-------|---------|
| Endpoint URL | `https://your-tunnel.example` |
| Application Id | `app_clinical` |
| API Key | App completions key (`n2ai_test_key_approved_app`) |
| Admin API Key | Gateway admin key (`GATEWAY_ADMIN_API_KEY`) |
| Default Model | `local-general-v1` or `cloud-public-gpt` |

## Scenario Console

**Enigma Healthcare Demo → Scenario Console** — completions policy presets only (clean allow, PII tokenize, PHI paths, unauthorized model). Unchanged by the agent work.

## Enigma Agent Console

Dedicated Lightning app for Pack #15 **write-capability** demo:

1. Open **Enigma Agent Console** (App Launcher).
2. Confirm baseline `agent_enigma_clinical` shows `write_capability=false`.
3. Click **Enable write capability** → expect `CRITICAL` / `MANDATORY_REVIEW` / policy `REVIEW`.
4. Optionally **Summarize via Enigma** (read path) or **Update clinical notes** after the change evaluation (SF demo gate).

Invocable Apex for Agentforce:

- `Enigma Summarize Patient`
- `Enigma Update Clinical Notes`
- `Enigma Evaluate Write Capability Change`

### Agentforce Service Agent

**Enigma Service Agent** (`Enigma_Service_Agent_v2`) is created and activated in `cred-poc` with the three GenAiFunctions bound to topics.

```bash
sf org open agent --api-name Enigma_Service_Agent_v2 -o cred-poc
sf agent preview --api-name Enigma_Service_Agent_v2 --use-live-actions -o cred-poc
```

See [`agentforce/README.md`](agentforce/README.md) and [`agentforce/enigmaServiceAgent.spec.yaml`](agentforce/enigmaServiceAgent.spec.yaml).

The write-capability CRITICAL path also works via **Enigma Agent Console** without chat.
