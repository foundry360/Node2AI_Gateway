# Node2AI Kubernetes Deployment Guide

Complete guide for deploying Node2AI Enterprise on Kubernetes.

## Prerequisites

- Kubernetes cluster (1.24+)
- `kubectl` configured and connected to your cluster
- Persistent volume storage class configured
- Ingress controller (optional, for external access)
- Image pull secrets configured (if using private registry)

## Quick Start

### 1. Create Namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. Configure Secrets

```bash
# Copy the template
cp secrets-template.yaml secrets.yaml

# Edit with your values
nano secrets.yaml

# Create the secret
kubectl create secret generic node2ai-secrets \
  --from-file=secrets.yaml \
  -n node2ai
```

**⚠️ Important**: Never commit `secrets.yaml` to version control!

### 3. Configure ConfigMap

Edit `configmap.yaml` with your specific configuration, then apply:

```bash
kubectl apply -f configmap.yaml
```

### 4. Create Persistent Volumes

```bash
kubectl apply -f persistent-volume.yaml
```

### 5. Deploy Application

```bash
# Deploy all components
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# Optional: Configure ingress
kubectl apply -f ingress.yaml

# Optional: Enable auto-scaling
kubectl apply -f hpa.yaml
```

### 6. Verify Deployment

```bash
# Check pods
kubectl get pods -n node2ai

# Check services
kubectl get svc -n node2ai

# Check ingress
kubectl get ingress -n node2ai

# View logs
kubectl logs -f deployment/node2ai-api -n node2ai
```

## Configuration

### Environment Variables

Most configuration is done via the ConfigMap (`configmap.yaml`) and Secrets (`secrets.yaml`).

**ConfigMap** contains non-sensitive configuration:

- Application settings
- Feature flags
- Database/Redis hostnames
- Logging levels

**Secrets** contain sensitive data:

- Passwords
- API keys
- JWT secrets
- Encryption keys

### Image Pull Secrets

If using GitHub Container Registry or another private registry, create an image pull secret:

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_TOKEN \
  -n node2ai
```

### Resource Limits

Default resource limits are configured in `deployment.yaml`. Adjust based on your cluster capacity:

**API Server:**

- Requests: 512Mi memory, 500m CPU
- Limits: 1Gi memory, 1 CPU

**Web Dashboard:**

- Requests: 256Mi memory, 250m CPU
- Limits: 512Mi memory, 500m CPU

**PostgreSQL:**

- Requests: 512Mi memory, 250m CPU
- Limits: 1Gi memory, 500m CPU

**Redis:**

- Requests: 256Mi memory, 100m CPU
- Limits: 512Mi memory, 250m CPU

### Scaling

Horizontal Pod Autoscalers (HPA) are configured in `hpa.yaml`:

- **API**: 2-10 replicas based on CPU (70%) and memory (80%)
- **Web**: 2-5 replicas based on CPU (70%) and memory (80%)

To disable auto-scaling, remove the HPA:

```bash
kubectl delete hpa node2ai-api-hpa -n node2ai
kubectl delete hpa node2ai-web-hpa -n node2ai
```

## Ingress Configuration

### With Nginx Ingress Controller

1. Install Nginx Ingress Controller (if not already installed)
2. Update `ingress.yaml` with your domain name
3. Apply the ingress:

```bash
kubectl apply -f ingress.yaml
```

### SSL/TLS with Cert-Manager

If using cert-manager for automatic SSL certificates:

1. Install cert-manager
2. Create a ClusterIssuer:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

3. Update `ingress.yaml` with your domain
4. Apply ingress - cert-manager will automatically provision certificates

## Monitoring

### Health Checks

All deployments include liveness and readiness probes:

- **Liveness**: Restarts container if unhealthy
- **Readiness**: Routes traffic only when ready

### Viewing Logs

```bash
# API logs
kubectl logs -f deployment/node2ai-api -n node2ai

# Web logs
kubectl logs -f deployment/node2ai-web -n node2ai

# All pods
kubectl logs -f -l app=node2ai -n node2ai
```

### Metrics

Expose metrics for Prometheus:

```bash
# Port forward to API metrics endpoint
kubectl port-forward svc/node2ai-api 3001:3001 -n node2ai
curl http://localhost:3001/metrics
```

## Backup and Restore

### Database Backup

```bash
# Create backup
kubectl exec -it deployment/node2ai-postgres -n node2ai -- \
  pg_dump -U node2ai node2ai > backup.sql

# Restore from backup
kubectl exec -i deployment/node2ai-postgres -n node2ai -- \
  psql -U node2ai node2ai < backup.sql
```

### Persistent Volume Backup

Use your cluster's backup solution (Velero, etc.) to backup PVCs:

```bash
# List PVCs
kubectl get pvc -n node2ai
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n node2ai

# Check events
kubectl get events -n node2ai --sort-by='.lastTimestamp'

# Check logs
kubectl logs <pod-name> -n node2ai
```

### Database Connection Issues

```bash
# Test database connection
kubectl exec -it deployment/node2ai-postgres -n node2ai -- \
  psql -U node2ai -d node2ai

# Check database service
kubectl get svc node2ai-postgres -n node2ai
```

### High Resource Usage

```bash
# Check resource usage
kubectl top pods -n node2ai

# Check HPA status
kubectl get hpa -n node2ai

# Adjust resource limits in deployment.yaml
```

### Image Pull Errors

```bash
# Check image pull secrets
kubectl get secrets -n node2ai

# Verify image exists
docker pull ghcr.io/foundry360/node2-api:latest

# Update image pull secret if needed
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_TOKEN \
  -n node2ai \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Updating

### Update Application

```bash
# Update image version
kubectl set image deployment/node2ai-api \
  api=ghcr.io/foundry360/node2-api:v1.0.1 \
  -n node2ai

kubectl set image deployment/node2ai-web \
  web=ghcr.io/foundry360/node2-web:v1.0.1 \
  -n node2ai

# Watch rollout
kubectl rollout status deployment/node2ai-api -n node2ai
```

### Rollback

```bash
# View rollout history
kubectl rollout history deployment/node2ai-api -n node2ai

# Rollback to previous version
kubectl rollout undo deployment/node2ai-api -n node2ai
```

## Kustomization (Advanced)

For environment-specific deployments, use the kustomization structure:

```bash
# Development
kubectl apply -k kustomization/overlays/development

# Staging
kubectl apply -k kustomization/overlays/staging

# Production
kubectl apply -k kustomization/overlays/production
```

## Support

For additional help:

- [Main Installation Guide](../INSTALL.md)
- [Configuration Reference](../CONFIGURATION.md)
- [Troubleshooting](../docs/troubleshooting.md)
