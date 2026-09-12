# Foundry360 license signing (vendor-only)

**Audience:** Foundry360 operators. Not for customer administrators.  
**Do not** copy these scripts or private keys into the customer VPC or runtime image.

The Gateway Docker image copies only `dist/`, `db/`, and runtime `node_modules` — vendor signing scripts are **not** included in the customer appliance image.

## Responsibilities

| Role | Responsibility |
| --- | --- |
| Foundry360 | Install Enigma, retrieve Deployment ID, assign License ID + terms, sign offline, install license file, renew |
| Customer | Operate Enigma Admin (view license status); do not issue licenses |

## Retrieve Deployment ID (customer VPC, after Gateway healthy)

```bash
curl -s \
  -H "Authorization: Bearer $GATEWAY_ADMIN_API_KEY" \
  http://127.0.0.1:8080/v1/admin/system \
  | jq -r .deployment.deployment_id
```

## Provision a signed license (Foundry360 vendor machine)

```bash
cd gateway
export ENIGMA_LICENSE_SIGNING_JWK_PATH=$HOME/.enigma-license-signing/enigma-lic-2026-09.private.jwk

node scripts/provision-license.mjs \
  --customer "Acme Health" \
  --license-id "ENIGMA-ACME-001" \
  --deployment-id "<deployment-uuid>" \
  --deployment-type "vpc" \
  --valid-from "2026-10-01" \
  --valid-until "2027-09-30" \
  --grace-days 30 \
  --output "./enigma.license"
```

This wrapper builds Phase 2 claims and invokes `sign-enigma-license.mjs`. It never prints or copies the private key.

Then deliver `enigma.license` to the customer administrator for upload in
**Enigma Admin → System → License → Install License**, or call
`POST /v1/admin/license/install`. Invalid uploads never replace an existing license.

## Low-level signer

```bash
node scripts/sign-enigma-license.mjs --claims ./claims.json --out ./enigma.license
```

## Generate a signing keypair (vendor custody)

```bash
node scripts/generate-license-signing-keypair.mjs \
  --kid enigma-lic-2026-09 \
  --out-dir "$HOME/.enigma-license-signing"
```

Embed **only** the public JWK in `src/admin/license-keys.ts`. Never commit `*.private.jwk`.

Current production verification `key_id`: `enigma-lic-2026-09`.

## Security rules

- Private key stays in Foundry360 secrets / HSM — never customer Compose, `.env`, or images.
- Do not reuse `GATEWAY_AUDIT_KEY`, `GATEWAY_VAULT_KEY`, or admin session secrets.
- Customer Admin is license status only — not issuance.
