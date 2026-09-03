#!/bin/bash
# Backup Node2AI Enterprise data and configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

BACKUP_DIR="${BACKUP_DIR:-/var/backups/node2ai}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="node2ai-backup-${TIMESTAMP}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Create backup directory
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

log_info "Starting backup: $BACKUP_NAME"

# Backup database
log_info "Backing up database..."
if command -v docker-compose &> /dev/null && [ -f "docker/docker-compose.yml" ]; then
    docker-compose -f docker/docker-compose.yml exec -T postgres \
        pg_dump -U node2ai node2ai > "$BACKUP_DIR/$BACKUP_NAME/database.sql"
elif command -v psql &> /dev/null; then
    pg_dump -h localhost -U node2ai node2ai > "$BACKUP_DIR/$BACKUP_NAME/database.sql"
else
    log_warn "Database backup not available"
fi

# Backup configuration
log_info "Backing up configuration..."
if [ -f "docker/.env" ]; then
    cp docker/.env "$BACKUP_DIR/$BACKUP_NAME/env.txt"
elif [ -f "/etc/node2ai/.env" ]; then
    cp /etc/node2ai/.env "$BACKUP_DIR/$BACKUP_NAME/env.txt"
fi

# Backup persistent volumes (Docker)
if command -v docker &> /dev/null; then
    log_info "Backing up Docker volumes..."
    docker run --rm \
        -v node2ai-postgres-data:/data \
        -v "$BACKUP_DIR/$BACKUP_NAME:/backup" \
        alpine tar czf /backup/postgres-data.tar.gz -C /data .
fi

# Create backup archive
log_info "Creating backup archive..."
cd "$BACKUP_DIR"
tar czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

log_info "Backup completed: ${BACKUP_NAME}.tar.gz"
log_info "Backup location: $BACKUP_DIR"

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "node2ai-backup-*.tar.gz" -mtime +7 -delete

log_info "Backup process completed successfully!"
