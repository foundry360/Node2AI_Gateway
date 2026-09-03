#!/bin/bash

# Node2AI Package Validation Script
# Validates that an enterprise package contains all required components

PACKAGE_DIR="${1:-.}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
WARNINGS=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Node2AI Package Validator"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Package Directory: ${PACKAGE_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check_exists() {
  local path="$1"
  local name="$2"
  
  if [ -e "${PACKAGE_DIR}/${path}" ]; then
    echo -e "${GREEN}✅${NC} ${name}"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}❌${NC} ${name} (missing: ${path})"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

check_warning() {
  local path="$1"
  local name="$2"
  
  if [ -e "${PACKAGE_DIR}/${path}" ]; then
    echo -e "${GREEN}✅${NC} ${name}"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${YELLOW}⚠️${NC}  ${name} (optional: ${path})"
    WARNINGS=$((WARNINGS + 1))
    return 1
  fi
}

check_executable() {
  local path="$1"
  local name="$2"
  
  if [ -x "${PACKAGE_DIR}/${path}" ]; then
    echo -e "${GREEN}✅${NC} ${name} (executable)"
    PASSED=$((PASSED + 1))
    return 0
  elif [ -f "${PACKAGE_DIR}/${path}" ]; then
    echo -e "${YELLOW}⚠️${NC}  ${name} (not executable)"
    WARNINGS=$((WARNINGS + 1))
    return 1
  else
    echo -e "${RED}❌${NC} ${name} (missing: ${path})"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# Check Docker images
echo "🐳 Docker Images"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_exists "docker-images/node2ai-api-*.tar.gz" "API Docker Image"
check_exists "docker-images/node2ai-web-*.tar.gz" "Web Docker Image"
check_exists "docker-images/postgres-*.tar.gz" "PostgreSQL Docker Image"
check_warning "docker-images/redis-*.tar.gz" "Redis Docker Image"
echo ""

# Check deployment files
echo "📦 Deployment Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_exists "deployments/docker/docker-compose.yml" "Docker Compose Configuration"
check_warning "deployments/kubernetes" "Kubernetes Manifests"
check_exists "env.example" "Environment Template"
echo ""

# Check scripts
echo "📜 Installation Scripts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_executable "scripts/install.sh" "Installation Script"
check_executable "scripts/backup.sh" "Backup Script"
check_executable "scripts/restore.sh" "Restore Script"
check_executable "scripts/health-check.sh" "Health Check Script"
check_warning "scripts/update.sh" "Update Script"
echo ""

# Check documentation
echo "📖 Documentation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_exists "docs/INSTALLATION.md" "Installation Guide"
check_exists "docs/QUICKSTART.md" "Quick Start Guide"
check_exists "docs/PROVIDER-KEYS.md" "Provider Keys Guide"
check_exists "docs/SECURITY.md" "Security Guide"
check_exists "docs/API.md" "API Documentation"
check_exists "docs/FAQ.md" "FAQ"
check_exists "docs/TROUBLESHOOTING.md" "Troubleshooting Guide"
check_exists "README.md" "Package README"
echo ""

# Check integrity files
echo "🔐 Integrity & Metadata"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_exists "checksums.txt" "Checksums File"
check_exists "VERSION" "Version Information"
check_warning "MANIFEST.txt" "Package Manifest"
echo ""

# Validate checksums if file exists
if [ -f "${PACKAGE_DIR}/checksums.txt" ]; then
  echo "🔍 Validating Checksums"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd "${PACKAGE_DIR}"
  if sha256sum -c checksums.txt --quiet 2>/dev/null; then
    echo -e "${GREEN}✅${NC} All checksums valid"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌${NC} Checksum validation failed"
    FAILED=$((FAILED + 1))
  fi
  cd - > /dev/null
  echo ""
fi

# Check Docker image integrity
echo "🔍 Docker Image Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for img in "${PACKAGE_DIR}"/docker-images/*.tar.gz; do
  if [ -f "$img" ]; then
    IMG_NAME=$(basename "$img")
    # Test if gzip file is valid
    if gunzip -t "$img" 2>/dev/null; then
      echo -e "${GREEN}✅${NC} ${IMG_NAME} (valid gzip)"
      PASSED=$((PASSED + 1))
    else
      echo -e "${RED}❌${NC} ${IMG_NAME} (corrupted)"
      FAILED=$((FAILED + 1))
    fi
  fi
done
echo ""

# Check configuration template
echo "⚙️  Configuration Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "${PACKAGE_DIR}/env.example" ]; then
  # Check for required environment variables
  REQUIRED_VARS=(
    "LICENSE_KEY"
    "JWT_SECRET"
    "SESSION_SECRET"
    "PROVIDER_KEY_ENCRYPTION_KEY"
    "DATABASE_URL"
  )
  
  for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${var}=" "${PACKAGE_DIR}/env.example"; then
      echo -e "${GREEN}✅${NC} ${var} defined"
      PASSED=$((PASSED + 1))
    else
      echo -e "${RED}❌${NC} ${var} missing"
      FAILED=$((FAILED + 1))
    fi
  done
else
  echo -e "${RED}❌${NC} env.example not found"
  FAILED=$((FAILED + 1))
fi
echo ""

# Check VERSION file format
echo "📋 Version Information"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "${PACKAGE_DIR}/VERSION" ]; then
  if grep -q "^VERSION=" "${PACKAGE_DIR}/VERSION"; then
    VERSION=$(grep "^VERSION=" "${PACKAGE_DIR}/VERSION" | cut -d= -f2)
    echo -e "${GREEN}✅${NC} Version: ${VERSION}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌${NC} Invalid VERSION file format"
    FAILED=$((FAILED + 1))
  fi
  
  if grep -q "^BUILD_DATE=" "${PACKAGE_DIR}/VERSION"; then
    BUILD_DATE=$(grep "^BUILD_DATE=" "${PACKAGE_DIR}/VERSION" | cut -d= -f2)
    echo -e "${GREEN}✅${NC} Build Date: ${BUILD_DATE}"
    PASSED=$((PASSED + 1))
  fi
else
  echo -e "${RED}❌${NC} VERSION file not found"
  FAILED=$((FAILED + 1))
fi
echo ""

# Check package size
echo "📊 Package Statistics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
PACKAGE_SIZE=$(du -sh "${PACKAGE_DIR}" | cut -f1)
echo -e "${BLUE}ℹ️${NC}  Total Package Size: ${PACKAGE_SIZE}"

IMAGE_SIZE=$(du -sh "${PACKAGE_DIR}/docker-images" 2>/dev/null | cut -f1)
if [ -n "$IMAGE_SIZE" ]; then
  echo -e "${BLUE}ℹ️${NC}  Docker Images Size: ${IMAGE_SIZE}"
fi

FILE_COUNT=$(find "${PACKAGE_DIR}" -type f | wc -l)
echo -e "${BLUE}ℹ️${NC}  Total Files: ${FILE_COUNT}"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Passed: ${PASSED}${NC}"
echo -e "${YELLOW}⚠️  Warnings: ${WARNINGS}${NC}"
echo -e "${RED}❌ Failed: ${FAILED}${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAILED -eq 0 ]; then
  if [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ Package is valid and complete${NC}"
    exit 0
  else
    echo -e "${YELLOW}⚠️  Package is valid but has warnings${NC}"
    exit 0
  fi
else
  echo -e "${RED}❌ Package validation failed${NC}"
  echo ""
  echo "Please fix the issues and rebuild the package"
  exit 1
fi
