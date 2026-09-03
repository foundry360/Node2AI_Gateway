#!/bin/bash
# Restore Node2AI Enterprise from backup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

if [ -z "$1" ]; then
    log_error "Usage: $0 <backup-file.tar.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

log_warn "This will restore from backup and may overwrite existing data!"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log_info "Restore cancelled"
    exit 0
fi

# Extract backup
TEMP_DIR=$(mktemp -d)
tar xzf "$BACKUP_FILE" -C "$TEMP_DIR"
BACKUP_DIR=$(ls -d "$TEMP_DIR"/* | head -1)

log_info "Restoring from backup..."

# Restore database
if [ -f "$BACKUP_DIR/database.sql" ]; then
    log_info "Restoring database..."
    if command -v docker-compose &> /dev/null && [ -f "docker/docker-compose.yml" ]; then
        docker-compose -f docker/docker-compose.yml exec -T postgres \
            psql -U node2ai node2ai < "$BACKUP_DIR/database.sql"
    elif command -v psql &> /dev/null; then
        psql -h localhost -U node2ai node2ai < "$BACKUP_DIR/database.sql"
    else
        log_error "Database restore not available"
    fi
fi

# Restore configuration
if [ -f "$BACKUP_DIR/env.txt" ]; then
    log_warn "Configuration file found. Please review and restore manually:"
    log_info "  Source: $BACKUP_DIR/env.txt"
    log_info "  Target: docker/.env or /etc/node2ai/.env"
fi

# Restore volumes
if [ -f "$BACKUP_DIR/postgres-data.tar.gz" ]; then
    log_warn "Volume data found. Restore manually if needed:"
    log_info "  Source: $BACKUP_DIR/postgres-data.tar.gz"
fi

# Cleanup
rm -rf "$TEMP_DIR"

log_info "Restore completed!"
log_warn "Please restart services: ./scripts/restart.sh"
