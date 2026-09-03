#!/bin/bash
set -e

# Node2AI Update Script
# Updates Node2AI to a new version

NEW_VERSION="${1}"
UPDATE_PACKAGE="${2}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$NEW_VERSION" ] || [ -z "$UPDATE_PACKAGE" ]; then
  echo "Usage: ./scripts/update.sh <new-version> <update-package.tar.gz>"
  exit 1
fi

if [ ! -f "$UPDATE_PACKAGE" ]; then
  echo -e "${RED}❌ Error: Update package not found: $UPDATE_PACKAGE${NC}"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Node2AI Update Utility"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Target Version: ${NEW_VERSION}"
echo "Update Package: $(basename $UPDATE_PACKAGE)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log() {
  echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# Get current version
if [ -f "VERSION" ]; then
  CURRENT_VERSION=$(grep "^VERSION=" VERSION | cut -d= -f2)
  log "Current version: ${CURRENT_VERSION}"
else
  warning "Could not determine current version"
  read -p "Continue anyway? (yes/no): " CONTINUE
  if [ "$CONTINUE" != "yes" ]; then
    exit 0
  fi
fi

# Warning
echo ""
echo -e "${YELLOW}⚠️  This update will:${NC}"
echo "   1. Create a backup of current installation"
echo "   2. Stop all services"
echo "   3. Update Docker images"
echo "   4. Run database migrations"
echo "   5. Restart services"
echo ""
read -p "Continue with update? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Update cancelled"
  exit 0
fi

# Create pre-update backup
log "Creating pre-update backup..."
./scripts/backup.sh || {
  warning "Backup failed"
  read -p "Continue without backup? (yes/no): " CONTINUE
  if [ "$CONTINUE" != "yes" ]; then
    exit 1
  fi
}

# Stop services
log "Stopping services..."
docker-compose down

# Extract update package
UPDATE_DIR="/tmp/node2ai-update-$(date +%s)"
mkdir -p "$UPDATE_DIR"
log "Extracting update package..."
tar xzf "$UPDATE_PACKAGE" -C "$UPDATE_DIR"

UPDATE_CONTENT=$(find "$UPDATE_DIR" -maxdepth 1 -type d -name "node2ai-*" | head -1)
if [ -z "$UPDATE_CONTENT" ]; then
  echo -e "${RED}❌ Invalid update package${NC}"
  exit 1
fi

# Verify update package
log "Verifying update package..."
cd "$UPDATE_CONTENT"
if [ -f "checksums.txt" ]; then
  sha256sum -c checksums.txt --quiet || {
    echo -e "${RED}❌ Update package verification failed${NC}"
    exit 1
  }
  log "✅ Update package verified"
fi

# Load new Docker images
log "Loading new Docker images..."
cd docker-images
for img in *.tar.gz; do
  log "Loading $img..."
  docker load < "$img"
done

# Tag images with new version
docker tag node2ai/api:${NEW_VERSION} node2ai/api:latest
docker tag node2ai/web:${NEW_VERSION} node2ai/web:latest

# Update docker-compose.yml if needed
cd -
if [ -f "deployments/docker/docker-compose.yml" ]; then
  log "Updating docker-compose.yml..."
  # Backup old compose file
  cp ../../deployments/docker/docker-compose.yml ../../deployments/docker/docker-compose.yml.bak
  # Copy new compose file
  cp deployments/docker/docker-compose.yml ../../deployments/docker/
fi

# Update documentation
if [ -d "docs" ]; then
  log "Updating documentation..."
  cp -r docs/* ../../docs/ 2>/dev/null || true
fi

# Return to deployment directory
cd -

# Start database for migrations
log "Starting database..."
docker-compose up -d postgres
sleep 10

# Run migrations
log "Running database migrations..."
docker-compose up -d api
sleep 10
docker-compose exec -T api pnpm run migrate || {
  warning "Migration failed - may need manual intervention"
}

# Start all services
log "Starting all services..."
docker-compose up -d

# Wait for health check
log "Waiting for services..."
sleep 30

# Verify update
log "Verifying update..."
if curl -sf http://localhost:3001/api/health > /dev/null; then
  log "✅ API is healthy"
  
  # Update VERSION file
  cat > VERSION << EOF
VERSION=${NEW_VERSION}
UPDATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
UPDATED_FROM=${CURRENT_VERSION}
EOF
  
else
  echo -e "${RED}❌ Update verification failed${NC}"
  echo ""
  echo "Rollback options:"
  echo "1. Check logs: docker-compose logs"
  echo "2. Rollback: docker-compose down && docker-compose up -d"
  echo "3. Restore backup: ./scripts/restore.sh /var/backups/node2ai/node2ai-backup-*.tar.gz"
  exit 1
fi

# Cleanup
log "Cleaning up..."
rm -rf "$UPDATE_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Update completed successfully!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Updated: ${CURRENT_VERSION} → ${NEW_VERSION}"
echo ""
echo "🌐 Node2AI is now running"
echo "   Web: http://localhost:3000"
echo "   API: http://localhost:3001"
echo ""
echo "📋 Next steps:"
echo "   1. Verify all functionality"
echo "   2. Review changelog for breaking changes"
echo "   3. Test critical workflows"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
