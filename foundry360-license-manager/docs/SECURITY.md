# Security

## Private signing key

The Foundry360 Ed25519 private signing key must **never** be:

- committed to Git
- embedded in the Docker image
- stored in PostgreSQL
- returned by an API
- exposed in the browser / client JS
- included in Compose environment variable values
- logged
- returned in error messages

Host-mount only:

```text
ENIGMA_LICENSE_PRIVATE_KEY_PATH=/run/secrets/enigma-license-private-key.jwk
```

## Roles

Mutating APIs call `requireAdmin()`. Viewers receive HTTP 403 for create/issue/renew/revoke/download.

## Artifacts

Prefer filesystem storage under `ARTIFACT_DIR` with SHA-256 retained in PostgreSQL. Do not store private keys alongside artifacts.

## Session

HTTP-only session cookie (`f360_lm_session`), HS256 JWT, 12h expiry. Set a strong `SESSION_SECRET` in production.
