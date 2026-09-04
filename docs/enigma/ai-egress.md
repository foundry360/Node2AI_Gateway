# AI Egress Controls (architecture placeholder)

**Status:** Future / placeholder — not implemented in the Enigma appliance process  
**Product:** Enigma AI Governance Gateway

## Boundary

Enigma governs traffic that **reaches the gateway**.

Enterprise network controls determine whether applications can bypass Enigma and call providers directly:

```text
api.openai.com
api.anthropic.com
Google AI / Gemini
Azure OpenAI
AWS Bedrock
…
```

Do **not** claim the application gateway alone prevents network bypass. See [threat-model.md](../threat-model.md) T1 and [security-model.md](../security-model.md).

## Planned components (not built yet)

```text
AI Egress Discovery
  → inventory outbound AI endpoints from app subnets / DNS / proxy logs

AI Egress Monitoring
  → alert on unexpected provider destinations / volumes

AI Egress Enforcement
  → deny-by-default egress; allowlist only Enigma (and approved private endpoints)
```

## Recommended customer controls (today)

1. Default-deny egress from application workloads  
2. Allow HTTPS only to the Enigma gateway VIP  
3. Optionally allowlisted private model endpoints if Enigma routes to them  
4. DNS/firewall logging for bypass detection  
5. Pilot Test 7 / air-gap profile as proof for local-only paths  

## Relationship to policy packs

Policy packs (HIPAA, Financial, Legal) decide **what is allowed through Enigma**.  
Egress controls decide **whether apps can skip Enigma**. Both are required for the full governance claim.
