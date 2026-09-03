# Threat Model

**Status:** Architectural contract

For each threat: Attack, Impact, Control, Detection, Residual Risk.

---

### T1 — Application bypass

| Field | Detail |
|-------|--------|
| **Threat** | Apps call providers directly, skipping Node2AI |
| **Attack** | Direct HTTPS to OpenAI/Anthropic/etc. |
| **Impact** | Ungoverned AI; data exfiltration; audit gap |
| **Control** | Network deny-by-default egress; DNS/firewall allowlist only to gateway/providers via gateway; document Test 7 |
| **Detection** | Egress logs; appliance bypass-config checks |
| **Residual Risk** | Misconfigured enterprise networks |

### T2 — Malicious application

| Field | Detail |
|-------|--------|
| **Threat** | Registered app abuses allowed operations |
| **Attack** | Prompt injection; bulk extraction; tool abuse |
| **Impact** | Sensitive data exposure; policy pressure |
| **Control** | Per-app allowlists; interrogation; response inspection; rate limits |
| **Detection** | Audit anomalies; block spikes |
| **Residual Risk** | Subtle misuse within policy |

### T3 — Compromised credentials

| Field | Detail |
|-------|--------|
| **Threat** | Stolen API key / JWT |
| **Attack** | Replay as legitimate application |
| **Impact** | Unauthorized AI use under victim identity |
| **Control** | Hashed keys; rotation; scoped keys; future mTLS/OIDC |
| **Detection** | Impossible travel / unusual volume alerts |
| **Residual Risk** | Valid key used until revoked |

### T4 — Prompt injection

| Field | Detail |
|-------|--------|
| **Threat** | Content causes model to ignore instructions |
| **Attack** | Embedded “ignore policy / reveal system” text |
| **Impact** | Leakage; unauthorized tool calls |
| **Control** | Policy is not model-enforced; response inspector; tool gate |
| **Detection** | Inspector reason codes; tool-call denials |
| **Residual Risk** | Novel injection patterns |

### T5 — Data exfiltration

| Field | Detail |
|-------|--------|
| **Threat** | Sensitive data leaves via prompts or outputs |
| **Attack** | PHI in prompt to public model; encoded output |
| **Impact** | Regulatory breach |
| **Control** | Classification → policy → tokenize/block; response scan |
| **Detection** | Block events; classification hits |
| **Residual Risk** | Steganographic / novel encodings |

### T6 — Model hallucination of sensitive data

| Field | Detail |
|-------|--------|
| **Threat** | Model invents or reconstitutes sensitive-looking data |
| **Attack** | Fabricated MRNs, credentials in output |
| **Impact** | False confidence; policy violations |
| **Control** | Response inspector patterns; BLOCK/REDACT |
| **Detection** | Output classification hits |
| **Residual Risk** | Soft PII that looks plausible |

### T7 — Unauthorized model selection

| Field | Detail |
|-------|--------|
| **Threat** | Client forces restricted model |
| **Attack** | `model` field set to public/cloud ID |
| **Impact** | Sensitive data to wrong provider |
| **Control** | Policy eligible set; router constrained |
| **Detection** | Audit requested vs selected model |
| **Residual Risk** | Policy misconfiguration |

### T8 — Unauthorized dataset access

| Field | Detail |
|-------|--------|
| **Threat** | App/user reads datasets outside allowlist |
| **Attack** | Connector ID spoofing |
| **Impact** | Data exposure |
| **Control** | Dataset ACL + policy; connector never bypasses policy |
| **Detection** | Denied connector audits |
| **Residual Risk** | Over-broad ACLs |

### T9 — Sensitive output release

| Field | Detail |
|-------|--------|
| **Threat** | Model returns PHI/secrets to client |
| **Attack** | Completion contains prohibited content |
| **Impact** | Breach via response path |
| **Control** | Mandatory response inspector + response policy |
| **Detection** | Response BLOCK events |
| **Residual Risk** | Detector false negatives |

### T10 — Token vault compromise

| Field | Detail |
|-------|--------|
| **Threat** | Attacker reads reversible mappings |
| **Attack** | DB dump; key theft |
| **Impact** | Mass re-identification |
| **Control** | Encrypt vault; privileged detokenize API; least privilege |
| **Detection** | Vault access audit |
| **Residual Risk** | Root compromise of appliance |

### T11 — Policy tampering

| Field | Detail |
|-------|--------|
| **Threat** | Weakened policies |
| **Attack** | Admin account abuse; DB edit |
| **Impact** | Systemic under-enforcement |
| **Control** | Versioned policies; privileged admin auth; audit diffs |
| **Detection** | Policy change events |
| **Residual Risk** | Colluding privileged insider |

### T12 — Gateway compromise

| Field | Detail |
|-------|--------|
| **Threat** | Host/process takeover |
| **Attack** | RCE; supply chain |
| **Impact** | Full bypass of governance |
| **Control** | Hardened appliance; signed updates; minimal attack surface |
| **Detection** | Host IDS; integrity checks |
| **Residual Risk** | Zero-days |

### T13 — Connector compromise

| Field | Detail |
|-------|--------|
| **Threat** | Malicious/buggy connector returns excess data |
| **Attack** | Over-fetch; inject classification metadata |
| **Impact** | Wrong policy inputs or data leak |
| **Control** | Classification not trusted solely from connector; policy re-check |
| **Detection** | Connector anomaly logs |
| **Residual Risk** | Trusted connector bug |

### T14 — Provider compromise

| Field | Detail |
|-------|--------|
| **Threat** | Upstream model provider malicious/breached |
| **Attack** | Training leak; MITM |
| **Impact** | Data exposure outside enterprise |
| **Control** | Prefer local/private; allowlist endpoints; TLS; air-gap mode |
| **Detection** | Unexpected egress; provider incidents |
| **Residual Risk** | Approved cloud providers |

### T15 — Insider misuse

| Field | Detail |
|-------|--------|
| **Threat** | Privileged user abuses access |
| **Attack** | Broaden policies; export audit; detokenize |
| **Impact** | Covert exfiltration |
| **Control** | Separation of duties; dual control for vault; full admin audit |
| **Detection** | Privileged action reviews |
| **Residual Risk** | Authorized insider within policy |
