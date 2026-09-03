#!/bin/bash
# Node2AI Enterprise VPC Installation Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Node2AI Enterprise VPC Installation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Detect cloud platform
detect_cloud() {
  if [ -f /sys/hypervisor/uuid ] && grep -q ec2 /sys/hypervisor/uuid 2>/dev/null; then
    echo "aws"
  elif curl -s -H Metadata:true "http://169.254.169.254/metadata/instance?api-version=2017-08-01" &>/dev/null; then
    echo "azure"
  elif curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/id" &>/dev/null; then
    echo "gcp"
  else
    echo "unknown"
  fi
}

CLOUD=$(detect_cloud)
echo "Detected cloud platform: $CLOUD"

# Get instance IP
INSTANCE_IP=$(hostname -I | awk '{print $1}' || echo "localhost")

# Choose installation method
if [ -d "docker" ]; then
  echo ""
  echo "Installing via Docker..."
  cd docker
  
  # Create .env if it doesn't exist
  if [ ! -f ".env" ]; then
    if [ -f "../config/.env.example" ]; then
      cp ../config/.env.example .env
    elif [ -f ".env.example" ]; then
      cp .env.example .env
    fi
    
    # Generate secrets if script exists
    if [ -f "../scripts/utils/generate-secrets.sh" ]; then
      chmod +x ../scripts/utils/generate-secrets.sh
      ../scripts/utils/generate-secrets.sh >> .env
    fi
  fi
  
  # Load Docker images if they exist
  if [ -d "../docker/images" ]; then
    echo "Loading Docker images..."
    for img in ../docker/images/*.tar.gz; do
      if [ -f "$img" ]; then
        echo "Loading $(basename $img)..."
        docker load < "$img" || true
      fi
    done
  fi
  
  # Start services
  echo "Starting services..."
  docker-compose up -d
  
  echo ""
  echo "✅ Installation complete!"
  echo "Dashboard: http://${INSTANCE_IP}:3000"
  echo "API: http://${INSTANCE_IP}:3001"
  
elif [ -d "kubernetes" ]; then
  echo ""
  echo "Installing via Kubernetes..."
  
  # Check if kubectl is available
  if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
  fi
  
  kubectl apply -f kubernetes/
  
  echo ""
  echo "✅ Installation complete!"
  echo "Check status with: kubectl get pods -n node2ai"
  
else
  echo ""
  echo "Installing standalone..."
  cd standalone
  
  if [ -f "install.sh" ]; then
    chmod +x install.sh
    sudo ./install.sh
  else
    echo "❌ Standalone installer not found"
    exit 1
  fi
  
  echo ""
  echo "✅ Installation complete!"
  echo "Dashboard: http://${INSTANCE_IP}:3000"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
