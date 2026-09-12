# Enigma signed offline licensing (Phase 2)

Licensing is a **platform entitlement** concern. It sits above the AI service gate and is **not** part of the Enterprise Policy Architecture, PDP, policy packs, evaluations, obligations, or Agent WRITE.

```text
Signed License → Verification → Platform Entitlement → AI Available?
                                      │
                         No ──────────┴────────── Yes
                         │                        │
                   Platform 403              AI Request → EPA/PDP → …
```

---

## Commercial model (Foundry360-led)

Foundry360 installs and provisions Enigma. Customers do **not** self-install or self-license.

```text
Install → Deployment ID → Vendor claims → Sign (vendor) → Admin upload → Validate → ACTIVE → Customer handoff
```

### Foundry360

* Installs Enigma in the customer VPC or air-gapped environment
* Retrieves Deployment ID via `GET /v1/admin/system`
* Creates License ID and commercial terms
* Signs the license **outside** the customer VPC
* Delivers `enigma.license` to the customer administrator (or installs via Admin)

### Customer administrator

* Opens Enigma Admin → System → License
* Uploads the Foundry360-issued `enigma.license`
* Confirms status **ACTIVE**
* Performs normal day-2 administration

The customer does **not** create, sign, edit, extend, or modify licenses.

### Customer Admin boundary

May **view**: Deployment ID, License ID, status, source, binding, dates, grace, key ID, reason.

May **install**: a vendor-issued signed file only (`POST /v1/admin/license/install`).

Must **not**: generate/sign licenses, edit claims, change Deployment ID / License ID / expiration, or access private signing keys.

---

## Status model

| Status | Meaning | AI |
| --- | --- | --- |
| **ACTIVE** | Valid signed license, bound, within term | Available |
| **GRACE** | Valid + bound, past end date, within signed grace | Available |
| **DISABLED** | Valid + bound, grace exhausted | Blocked |
| **INVALID** | Missing / corrupt / wrong deployment / unknown key / not yet valid | Blocked |

Grace applies **only** after valid signature **and** matching `deployment_id`. Invalid uploads never replace an existing license.

---

## VPC provisioning runbook

### 1–2. Deploy and wait for healthy Gateway

### 3. Retrieve Deployment ID

```bash
curl -s \
  -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  http://127.0.0.1:8080/v1/admin/system \
  | jq -r .deployment.deployment_id
```

### 4–5. Assign terms and sign (Foundry360 vendor machine)

```bash
cd gateway
export ENIGMA_LICENSE_SIGNING_JWK_PATH=$HOME/.enigma-license-signing/enigma-lic-2026-09.private.jwk

node scripts/provision-license.mjs \
  --customer "Acme Health" \
  --license-id "ENIGMA-ACME-001" \
  --deployment-id "<uuid-from-step-3>" \
  --deployment-type "vpc" \
  --valid-from "2026-10-01" \
  --valid-until "2027-09-30" \
  --grace-days 30 \
  --output "./enigma.license"
```

Private key never enters the customer environment.

### 6. Install via Enigma Admin (preferred)

1. Open **Administration → System → License**
2. **Install License** → select `enigma.license`
3. Enigma validates signature, claims, and Deployment ID binding
4. On success, license is written to `ENIGMA_LICENSE_PATH` and status becomes **ACTIVE**
5. On failure, any existing license is left unchanged

API equivalent (Administrator only):

```bash
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"license_document\":\"$(cat enigma.license | tr -d '\n')\"}" \
  http://127.0.0.1:8080/v1/admin/license/install
```

Multipart upload of the file field `license` / `enigma.license` is also supported.

### 7. Verify ACTIVE

```bash
curl -s -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  http://127.0.0.1:8080/v1/admin/system \
  | jq '{deployment_id: .deployment.deployment_id, status: .license.status, license_id: .license.license_id}'
```

### 8. Customer handoff

Provide Admin URL and credentials for day-2 ops.

---

## Air-Gapped provisioning

Same API and Admin UI. Foundry360 signs outside the air gap; transfer `enigma.license` via approved offline media; administrator uploads in Admin. No Internet, DNS, vendor callback, or license server is required.

---

## Renewal

```text
Deployment ID = D (unchanged)
License ID    = L2 (new)
valid_until   = Date B
```

Sign replacement → Admin upload (or API install) → ACTIVE. Invalid renewal does not replace the current license.

---

## Storage

Installed licenses reside at `ENIGMA_LICENSE_PATH` (default `/etc/enigma/license/enigma.license`).
Compose mounts `./licenses` writable so Admin install can persist the file.

Production verification `key_id`: `enigma-lic-2026-09` (public in Gateway; private Foundry360-only).
