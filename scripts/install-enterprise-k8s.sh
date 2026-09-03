#!/bin/bash
set -e

# Node2AI Enterprise Kubernetes Installation Script
# Installs Node2AI Enterprise Edition on Kubernetes

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Node2AI Enterprise Kubernetes Installation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
echo ""
echo "🔍 Checking prerequisites..."
command -v kubectl >/dev/null 2>&1 || { echo "❌ kubectl is required but not installed."; exit 1; }
command -v helm >/dev/null 2>&1 || { echo "❌ helm is required but not installed."; exit 1; }
echo "✅ Prerequisites met"

# Check if kubectl is configured
echo ""
echo "🔍 Checking kubectl configuration..."
if ! kubectl cluster-info >/dev/null 2>&1; then
    echo "❌ kubectl is not configured or cluster is not accessible"
    echo "   Please configure kubectl and ensure you can access your cluster"
    exit 1
fi
echo "✅ kubectl is configured"

# Get cluster info
echo ""
echo "📊 Cluster information:"
kubectl cluster-info

# Check if namespace exists
echo ""
echo "🔍 Checking if namespace exists..."
if kubectl get namespace node2ai-enterprise >/dev/null 2>&1; then
    echo "⚠️  Namespace 'node2ai-enterprise' already exists"
    echo "   Do you want to continue? This will update existing resources. (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Installation cancelled"
        exit 0
    fi
else
    echo "✅ Namespace does not exist, will create it"
fi

# Create namespace
echo ""
echo "📦 Creating namespace..."
kubectl apply -f deployments/kubernetes/enterprise/namespace.yaml

# Create RBAC
echo ""
echo "🔐 Creating RBAC..."
kubectl apply -f deployments/kubernetes/enterprise/rbac.yaml

# Create secrets
echo ""
echo "🔑 Creating secrets..."
echo "⚠️  Please update the secrets.yaml file with your actual values before proceeding"
echo "   Press Enter when ready to continue..."
read

kubectl apply -f deployments/kubernetes/enterprise/secrets.yaml

# Create configmap
echo ""
echo "⚙️  Creating configmap..."
kubectl apply -f deployments/kubernetes/enterprise/configmap.yaml

# Create database
echo ""
echo "🗄️  Creating database..."
kubectl apply -f deployments/kubernetes/enterprise/database.yaml

# Wait for database to be ready
echo ""
echo "⏳ Waiting for database to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=postgres -n node2ai-enterprise --timeout=300s

# Create Redis
echo ""
echo "🔴 Creating Redis..."
kubectl apply -f deployments/kubernetes/enterprise/database.yaml

# Wait for Redis to be ready
echo ""
echo "⏳ Waiting for Redis to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=redis -n node2ai-enterprise --timeout=300s

# Create API deployment
echo ""
echo "🔧 Creating API deployment..."
kubectl apply -f deployments/kubernetes/enterprise/deployment.yaml

# Wait for API to be ready
echo ""
echo "⏳ Waiting for API to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=api -n node2ai-enterprise --timeout=300s

# Create services
echo ""
echo "🌐 Creating services..."
kubectl apply -f deployments/kubernetes/enterprise/service.yaml

# Create ingress
echo ""
echo "🔗 Creating ingress..."
kubectl apply -f deployments/kubernetes/enterprise/ingress.yaml

# Create monitoring (optional)
echo ""
echo "📊 Creating monitoring..."
kubectl apply -f deployments/kubernetes/enterprise/monitoring.yaml

# Wait for all pods to be ready
echo ""
echo "⏳ Waiting for all pods to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=node2ai -n node2ai-enterprise --timeout=600s

# Check pod status
echo ""
echo "📊 Pod status:"
kubectl get pods -n node2ai-enterprise

# Check services
echo ""
echo "🌐 Service status:"
kubectl get services -n node2ai-enterprise

# Check ingress
echo ""
echo "🔗 Ingress status:"
kubectl get ingress -n node2ai-enterprise

# Get access information
echo ""
echo "🎉 Node2AI Enterprise Edition installed successfully!"
echo ""
echo "Access information:"
echo "  Namespace: node2ai-enterprise"
echo "  API Service: node2ai-api"
echo "  Web Service: node2ai-web"
echo ""
echo "To access the application:"
echo "  1. Port forward to API: kubectl port-forward svc/node2ai-api 3001:3001 -n node2ai-enterprise"
echo "  2. Port forward to Web: kubectl port-forward svc/node2ai-web 3000:3000 -n node2ai-enterprise"
echo "  3. Open browser: http://localhost:3000"
echo ""
echo "Default login credentials:"
echo "  Email: admin@node2ai.ai"
echo "  Password: admin123"
echo ""
echo "⚠️  IMPORTANT: Change the default password immediately!"
echo ""
echo "Next steps:"
echo "  1. Configure your ingress with proper domain names"
echo "  2. Update secrets with your actual values"
echo "  3. Configure SSL certificates"
echo "  4. Set up monitoring and alerting"
echo "  5. Configure backup and recovery"
echo ""
echo "For support: enterprise@foundry360.com"
