# Operations

## Start

```bash
docker compose up -d --build
```

Health: open http://localhost:3085 and sign in.

## Seed users

On container start, migrations run and users are seeded idempotently:

- `SEED_ADMIN_PASSWORD` (default `changeme-admin`) → user `admin`
- `SEED_VIEWER_PASSWORD` (default `changeme-viewer`) → user `viewer`

Change these before any non-lab use.

## Signing key mount

Place the private JWK at:

```text
./secrets/enigma-license-private-key.jwk
```

Compose mounts `./secrets` read-only to `/run/secrets`.

```bash
cp ~/.enigma-license-signing/enigma-lic-2026-09.private.jwk \
   ./secrets/enigma-license-private-key.jwk
chmod 600 ./secrets/enigma-license-private-key.jwk
```

Without this file, license **Issue & Sign** fails closed.

## Backup

### PostgreSQL

```bash
docker compose exec postgres pg_dump -U foundry360 foundry360_licenses > backup.sql
```

Restore:

```bash
cat backup.sql | docker compose exec -T postgres psql -U foundry360 foundry360_licenses
```

### Signing private key

**The private signing key is NOT in the database backup.** Back it up separately using your vendor key-management procedures (offline media, HSM, encrypted vault). Loss of the private key prevents issuing new licenses with that `key_id`.

### Artifacts

Signed files under `ARTIFACT_DIR` / volume `license_artifacts` can be regenerated only by re-signing (which requires DRAFT→issue or renewal). Prefer retaining issued artifacts and their SHA-256 records.

## Lifecycle checklist

1. Deploy Enigma  
2. Retrieve Deployment ID  
3. Register Deployment here  
4. Create License (DRAFT)  
5. Issue & Sign  
6. Download `enigma.license`  
7. Deliver to customer  
8. Customer installs in Enigma System → License  
9. Enigma verifies signature + Deployment ID  
10. Status ACTIVE  

## Logs

Do not enable debug logging that dumps JWK contents. Application error messages redact private field `d` if present in exception text.
