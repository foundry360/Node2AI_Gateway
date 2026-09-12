# Architecture

## Roles

```text
Foundry360 License Manager  →  creates + signs  →  enigma.license
                                                        │
                                                        ▼
                                              Enigma Deployment
                                                        │
                                                        ▼
                                              verifies (ACTIVE / GRACE / DISABLED / INVALID)
```

Foundry360 License Manager is the **issuer**. Enigma is the **verifier and enforcement point**.

This application is vendor-side only. It is not part of the Enigma customer application and must not be deployed into customer VPC or air-gapped environments.

## Hierarchy

```text
Customer
  └── Deployment  (deployment_id from Enigma — never generated here)
        └── License  (license_id commercial entitlement)
              └── LicenseEvent (immutable audit history)

EnigmaRelease  (immutable software version)
  └── EnigmaReleaseArtifact  (VPC / AIR_GAPPED deployment packages)
```

Approved releases are resolved onto deployments by `deployment_type` — software packages remain generic and never include customer licenses.

A license belongs to exactly one deployment. A deployment may have many historical licenses; normally one `ISSUED` license is current.

## Cryptography

Signing reuses the Enigma contract:

- Algorithm: Ed25519 / JWS compact (`alg: EdDSA`)
- Header `typ`: `enigma-license+jwt`
- Claims: `license_version`, `license_id`, `customer_name`, `deployment_id`, `deployment_type` (`vpc`|`air_gapped`), `valid_from`, `valid_until`, `issued_at`, `key_id`, `grace_days`
- Production key id: `enigma-lic-2026-09`

Private keys are loaded from a host-mounted path (`ENIGMA_LICENSE_PRIVATE_KEY_PATH`). They are never stored in PostgreSQL, Docker images, or returned by APIs.

## Stack

- Next.js (App Router) + TypeScript
- PostgreSQL + Prisma
- Tailwind CSS
- Docker Compose (`license-manager` + `postgres`) on port **3085**

## Authorization

| Role            | Capabilities                                      |
|-----------------|---------------------------------------------------|
| VIEWER          | Read customers, deployments, licenses, history    |
| ADMINISTRATOR   | Create / register / issue / renew / revoke / download |

Permissions are enforced in API routes, not only in the UI.
