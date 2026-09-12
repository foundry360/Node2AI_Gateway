# Enigma Releases

> Foundry360 distributes approved Enigma software releases and issues customer licenses. Enigma independently verifies and enforces the signed license within the customer deployment.

## Lifecycle

```text
DRAFT → APPROVED → DEPRECATED
```

| Status | Meaning |
|--------|---------|
| `DRAFT` | Release record created; packages may be uploaded |
| `APPROVED` | Immutable; packages available for customer deployments |
| `DEPRECATED` | Retained for history; prefer newer approved releases |

Once **APPROVED**:

- Version cannot change
- Artifacts cannot be replaced
- Create a **new** release for fixes

## What Foundry360 does

- Register immutable Enigma software versions
- Store VPC and Air-Gapped deployment packages
- Calculate and record SHA-256 server-side
- Resolve the correct package for a deployment type

## What Enigma does

- Runs the customer installation
- Verifies the separately installed `enigma.license`
- Enforces Deployment ID binding

## Software vs license

```text
Enigma Software Release   +   Customer Deployment ID   +   Signed License
```

Never embed customer name, Deployment ID, License ID, or signing keys in a release package.
