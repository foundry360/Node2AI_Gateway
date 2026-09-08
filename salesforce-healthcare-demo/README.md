# Salesforce Healthcare Demo → Enigma

Small Patient app in Salesforce that sends clinical notes to Enigma Gateway for a governed summary.

## Architecture

```text
Patient record (Clinical Notes)
  → LWC "Summarize"
  → Apex EnigmaGatewayService
  → HTTPS POST /v1/ai/completions
  → Enigma Gateway (policy → model → proof)
  → Summary written to Patient.Enigma_Summary__c
```

## Prerequisites

1. Enigma Gateway listening on `:8080`
2. Public HTTPS tunnel to `:8080` (Salesforce cannot call `localhost`)
   - Demo tunnel used at deploy time: `https://9a163dd5e5a892.lhr.life` (localhost.run SSH; dies when that session ends)
3. Org authenticated (`cred-poc` or your Dev Hub/DE)

## Deployed to `cred-poc`

- App: **Enigma Healthcare Demo**
- Object: **Patient** (`Patient__c`) + sample **Charles Greene**
- LWC: **Patient Enigma Summary** (on `Patient_Record_Page`)
- Config: Custom Setting **Enigma Config** (org defaults seeded)
- Remote Site: **Enigma_Gateway_Tunnel**

If the Lightning record page does not show the LWC yet: Edit Page → add **Patient Enigma Summary** → Save → Activate as org default.

## Deploy

```bash
cd salesforce-healthcare-demo
sf project deploy start -o cred-poc
sf org assign permset -n Enigma_Healthcare_Demo -o cred-poc
```

Update Remote Site + Custom Setting if the tunnel URL changes:

1. Setup → Remote Site Settings → `Enigma_Gateway_Tunnel`
2. Setup → Custom Settings → Enigma Config → Manage → Default Organization Level Value

Or edit `scripts/apex/seed.apex` and run:

```bash
sf apex run -f scripts/apex/seed.apex -o cred-poc
```

## Enigma Config fields

| Field | Example |
|-------|---------|
| Endpoint URL | `https://your-tunnel.example` |
| Application Id | `app_clinical` (or your Enigma app id) |
| API Key | Enigma app API key (not the model key) |
| Default Model | `local-general-v1` or `cloud-public-gpt` |

Model/provider keys stay in Enigma Admin — not in Salesforce.

## Patient chart model

- **Patient__c** — demographics, MRN, insurance, allergies, PCP, vitals, clinical notes
- **Condition__c** — related problems with ICD-10 + status
- **Prescription__c** — medications with dose/frequency/route/status

Sample patient: **Charles Greene** (`MRN-10042`) with diabetes, hypertension, allergies, and active meds.

Enigma summarize sends the full chart (demographics + conditions + prescriptions + notes).

## Agentforce (next)

Wrap `EnigmaSummarizeController.summarizePatient` as a custom agent action once the LWC path works.
