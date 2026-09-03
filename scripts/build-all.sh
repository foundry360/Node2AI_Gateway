#!/bin/bash
set -e

# Node2AI Master Build Script
# Builds all components and creates production-ready artifacts

VERSION="${1:-1.0.0}"
BUILD_MODE="${2:-production}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏗️  Node2AI Build System"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Version: ${VERSION}"
echo "Mode: ${BUILD_MODE}"
echo "Root: ${ROOT_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log() {
  echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[$(date '+%H:%M:%S')] ERROR:${NC} $1"
}

step() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Track build times
START_TIME=$(date +%s)

# Step 1: Environment validation
step "Step 1: Validating Build Environment"

log "Checking required tools..."
command -v node >/dev/null 2>&1 || { error "Node.js not found"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { error "pnpm not found"; exit 1; }
command -v docker >/dev/null 2>&1 || { error "Docker not found"; exit 1; }

NODE_VERSION=$(node --version)
PNPM_VERSION=$(pnpm --version)
DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+\.\d+')

log "✅ Node.js ${NODE_VERSION}"
log "✅ pnpm ${PNPM_VERSION}"
log "✅ Docker ${DOCKER_VERSION}"

# Check disk space
AVAILABLE_SPACE=$(df -BG "${ROOT_DIR}" | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt 20 ]; then
  error "Insufficient disk space: ${AVAILABLE_SPACE}GB available (need 20GB+)"
  exit 1
fi
log "✅ Disk space: ${AVAILABLE_SPACE}GB available"

# Step 2: Clean previous builds
step "Step 2: Cleaning Previous Builds"

log "Removing old build artifacts..."
rm -rf dist/
rm -rf apps/*/dist/
rm -rf apps/*/.next/
rm -rf packages/*/dist/
log "✅ Cleaned build directories"

# Step 3: Install dependencies
step "Step 3: Installing Dependencies"

log "Running pnpm install..."
cd "${ROOT_DIR}"
pnpm install --frozen-lockfile
log "✅ Dependencies installed"

# Step 4: Run linting
step "Step 4: Code Quality Checks"

log "Running ESLint..."
pnpm run lint || {
  error "Linting failed"
  exit 1
}
log "✅ Linting passed"

log "Running TypeScript checks..."
pnpm run type-check || {
  error "Type checking failed"
  exit 1
}
log "✅ Type checking passed"

# Step 5: Run tests
step "Step 5: Running Tests"

log "Running unit tests..."
pnpm run test:unit || {
  error "Unit tests failed"
  exit 1
}
log "✅ Unit tests passed"

log "Running integration tests..."
pnpm run test:integration || {
  error "Integration tests failed"
  exit 1
}
log "✅ Integration tests passed"

# Step 6: Build packages
step "Step 6: Building Packages"

log "Building shared packages..."
pnpm run build --filter='./packages/*' || {
  error "Package build failed"
  exit 1
}
log "✅ Packages built"

# Step 7: Build applications
step "Step 7: Building Applications"

log "Building API application..."
cd "${ROOT_DIR}/apps/api"
pnpm run build || {
  error "API build failed"
  exit 1
}
log "✅ API built"

log "Building Web application..."
cd "${ROOT_DIR}/apps/web"
pnpm run build || {
  error "Web build failed"
  exit 1
}
log "✅ Web built"

cd "${ROOT_DIR}"

# Step 8: Build Docker images
step "Step 8: Building Docker Images"

log "Building API Docker image..."
docker build \
  --platform linux/amd64 \
  --build-arg VERSION=${VERSION} \
  --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t node2ai/api:${VERSION} \
  -t node2ai/api:latest \
  -f apps/api/Dockerfile \
  . || {
  error "API Docker build failed"
  exit 1
}
log "✅ API Docker image built"

log "Building Web Docker image..."
docker build \
  --platform linux/amd64 \
  --build-arg VERSION=${VERSION} \
  --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t node2ai/web:${VERSION} \
  -t node2ai/web:latest \
  -f apps/web/Dockerfile \
  . || {
  error "Web Docker build failed"
  exit 1
}
log "✅ Web Docker image built"

# Step 9: Test Docker images
step "Step 9: Testing Docker Images"

log "Testing API image..."
docker run --rm node2ai/api:${VERSION} node --version || {
  error "API image test failed"
  exit 1
}
log "✅ API image tested"

log "Testing Web image..."
docker run --rm node2ai/web:${VERSION} node --version || {
  error "Web image test failed"
  exit 1
}
log "✅ Web image tested"

# Step 10: Security scanning
step "Step 10: Security Scanning"

log "Scanning Docker images for vulnerabilities..."
if command -v trivy >/dev/null 2>&1; then
  trivy image --severity HIGH,CRITICAL node2ai/api:${VERSION} || {
    error "Security scan found critical vulnerabilities in API image"
    exit 1
  }
  trivy image --severity HIGH,CRITICAL node2ai/web:${VERSION} || {
    error "Security scan found critical vulnerabilities in Web image"
    exit 1
  }
  log "✅ Security scans passed"
else
  log "⚠️  Trivy not installed, skipping security scan"
  log "   Install: https://aquasecurity.github.io/trivy/"
fi

# Step 11: Generate build metadata
step "Step 11: Generating Build Metadata"

mkdir -p dist/metadata

cat > dist/metadata/build-info.json << EOF
{
  "version": "${VERSION}",
  "buildMode": "${BUILD_MODE}",
  "buildDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "buildHost": "$(hostname)",
  "buildUser": "$(whoami)",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "gitTag": "$(git describe --tags --exact-match 2>/dev/null || echo 'none')",
  "nodeVersion": "${NODE_VERSION}",
  "pnpmVersion": "${PNPM_VERSION}",
  "dockerVersion": "${DOCKER_VERSION}",
  "images": {
    "api": "node2ai/api:${VERSION}",
    "web": "node2ai/web:${VERSION}"
  }
}
EOF

log "✅ Build metadata generated"

# Step 12: Create build summary
step "Step 12: Build Summary"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📊 Build Statistics:"
echo "  Version: ${VERSION}"
echo "  Duration: ${MINUTES}m ${SECONDS}s"
echo "  Images:"
echo "    • node2ai/api:${VERSION}"
echo "    • node2ai/web:${VERSION}"
echo ""
echo "📦 Docker Images:"
docker images | grep node2ai | grep -E "${VERSION}|latest"
echo ""
echo "🚀 Next Steps:"
echo "  1. Package for distribution:"
echo "     ./scripts/package-enterprise.sh ${VERSION}"
echo ""
echo "  2. Test the package:"
echo "     ./scripts/test-package.sh dist/enterprise/node2ai-enterprise-v${VERSION}-*.tar.gz"
echo ""
echo "  3. Deploy to registry:"
echo "     docker push node2ai/api:${VERSION}"
echo "     docker push node2ai/web:${VERSION}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
