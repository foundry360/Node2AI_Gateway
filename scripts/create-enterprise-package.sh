#!/bin/bash
# Script to create enterprise package structure

set -euo pipefail

VERSION=${1:-"1.0.0"}
PACKAGE_DIR="node2ai-enterprise-v${VERSION}"

echo "Creating enterprise package: ${PACKAGE_DIR}"

# Create directory structure
mkdir -p "${PACKAGE_DIR}"/{docker/{images},kubernetes/{kustomization/{base,overlays/{development,staging,production}}},standalone/{node2ai-server,systemd},desktop-admin/{installers,portable,source/{src/{renderer,native}}},config/nginx,database/migrations,scripts/utils,docs/{installation,configuration,administration,desktop-admin},monitoring/{prometheus,grafana/dashboards},tests/{integration-tests,sample-data},support}

# Copy Docker images
if [ -d "docker/images" ]; then
  cp -r docker/images/* "${PACKAGE_DIR}/docker/images/"
fi

# Copy Docker configurations
if [ -f "docker-compose.prod.yml" ]; then
  cp docker-compose.prod.yml "${PACKAGE_DIR}/docker/docker-compose.yml"
fi

# Copy Kubernetes manifests
if [ -d "deployments/kubernetes" ]; then
  cp -r deployments/kubernetes/* "${PACKAGE_DIR}/kubernetes/" 2>/dev/null || true
fi

# Copy scripts
if [ -d "scripts" ]; then
  cp scripts/*.sh "${PACKAGE_DIR}/scripts/" 2>/dev/null || true
  chmod +x "${PACKAGE_DIR}/scripts/"*.sh 2>/dev/null || true
fi

# Copy documentation
if [ -d "docs" ]; then
  cp -r docs/* "${PACKAGE_DIR}/docs/" 2>/dev/null || true
fi

# Copy configuration templates
if [ -f ".env.example" ]; then
  cp .env.example "${PACKAGE_DIR}/config/.env.example"
fi

# Copy database migrations
if [ -d "migrations" ]; then
  cp -r migrations/* "${PACKAGE_DIR}/database/migrations/" 2>/dev/null || true
fi

# Build standalone application (only if not already built)
if [ ! -d "apps/api/.next" ] || [ ! -d "apps/web/.next" ]; then
  echo "Building standalone application..."
  pnpm build || echo "Warning: Build failed, continuing with existing build artifacts"
fi

# Copy built applications
cp -r apps/api/.next "${PACKAGE_DIR}/standalone/node2ai-server/.next" 2>/dev/null || echo "Warning: API build not found"
cp -r apps/web/.next "${PACKAGE_DIR}/standalone/node2ai-server/.next-web" 2>/dev/null || echo "Warning: Web build not found"

# Copy package.json and install production dependencies (only if package.json exists)
if [ -f "package.json" ]; then
  cp package.json "${PACKAGE_DIR}/standalone/node2ai-server/" || true
  cd "${PACKAGE_DIR}/standalone/node2ai-server"
  pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod 2>/dev/null || echo "Warning: Production dependency installation failed"
  cd - > /dev/null
fi

echo "Enterprise package created: ${PACKAGE_DIR}"

