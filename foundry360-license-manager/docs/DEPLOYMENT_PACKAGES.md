# Deployment Packages

## Package kinds

| Deployment type | Example filename |
|-----------------|------------------|
| `VPC` | `enigma-0.1.0-vpc.tar.gz` |
| `AIR_GAPPED` | `enigma-0.1.0-airgap.tar.gz` |

Engineering builds these artifacts outside the portal. The portal only stores, hashes, and distributes them.

## VPC package

Typical contents (aligned with `gateway/docker-compose.yml` + `install.sh`):

```text
docker-compose.yml
.env.example
install.sh
docs/
README.md
```

May reference immutable images already used by Enigma:

- `postgres:16-alpine`
- `ollama/ollama:latest`
- Gateway / Admin images built from the Enigma Dockerfiles

## Air-gapped package

Offline-capable. Typical contents:

```text
images/
  (docker save tarballs for postgres, ollama, gateway, admin)
docker-compose.yml
docker-compose.airgap.yml
install.sh
.env.example
docs/
README.md
```

Customer flow:

```text
docker load < images/*.tar
docker compose -f docker-compose.yml -f docker-compose.airgap.yml up -d
```

## SHA-256

On upload the License Manager:

1. Writes the file under `artifacts/releases/<version>/`
2. Computes SHA-256 server-side
3. Stores hash, size, and filename in PostgreSQL

Client-supplied hashes are never authoritative.

## Download

Authenticated routes only, e.g.:

```text
GET /api/releases/:id/artifacts/:artifactId/download
```

VIEWER and ADMINISTRATOR may download approved packages. Draft packages are administrator-only.

## Vendor workflow

1. Engineering builds Enigma release artifacts  
2. Admin creates DRAFT release in License Manager  
3. Upload VPC + Air-Gapped packages  
4. Approve release  
5. Register customer deployment  
6. Download matching package from Deployment detail  
7. Issue/sign `enigma.license` separately  
8. Deploy package, then install license in Enigma Admin  
