#!/bin/bash

# Node2AI Upgrade Script
# This script upgrades Node2AI to a new version

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
UPGRADE_DIR="./upgrade"
CURRENT_VERSION=""
TARGET_VERSION=""

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root"
        exit 1
    fi
}

# Check current version
get_current_version() {
    log_info "Checking current version..."
    
    if [ -f "package.json" ]; then
        CURRENT_VERSION=$(grep '"version"' package.json | cut -d'"' -f4)
        log_success "Current version: $CURRENT_VERSION"
    else
        log_error "package.json not found. Are you in the correct directory?"
        exit 1
    fi
}

# Check target version
get_target_version() {
    if [ -z "$1" ]; then
        log_error "Target version not specified"
        echo "Usage: $0 <target_version>"
        exit 1
    fi
    
    TARGET_VERSION="$1"
    log_info "Target version: $TARGET_VERSION"
}

# Create backup before upgrade
create_backup() {
    log_info "Creating backup before upgrade..."
    
    if [ -f "./scripts/backup.sh" ]; then
        ./scripts/backup.sh backup
        log_success "Backup created successfully"
    else
        log_warning "Backup script not found. Skipping backup."
    fi
}

# Stop services
stop_services() {
    log_info "Stopping services..."
    
    if docker-compose ps | grep -q "Up"; then
        docker-compose down
        log_success "Services stopped"
    else
        log_info "Services already stopped"
    fi
}

# Update application code
update_code() {
    log_info "Updating application code..."
    
    # Create upgrade directory
    mkdir -p "$UPGRADE_DIR"
    
    # Download new version (if URL provided)
    if [ -n "$2" ]; then
        local download_url="$2"
        log_info "Downloading new version from: $download_url"
        
        if command -v curl &> /dev/null; then
            curl -L "$download_url" -o "$UPGRADE_DIR/supernova-$TARGET_VERSION.tar.gz"
        elif command -v wget &> /dev/null; then
            wget "$download_url" -O "$UPGRADE_DIR/supernova-$TARGET_VERSION.tar.gz"
        else
            log_error "Neither curl nor wget found. Please download the new version manually."
            exit 1
        fi
        
        # Extract new version
        tar -xzf "$UPGRADE_DIR/supernova-$TARGET_VERSION.tar.gz" -C "$UPGRADE_DIR"
        log_success "New version downloaded and extracted"
    else
        log_info "No download URL provided. Assuming code is already updated."
    fi
}

# Update dependencies
update_dependencies() {
    log_info "Updating dependencies..."
    
    # Install pnpm if not present
    if ! command -v pnpm &> /dev/null; then
        log_info "Installing pnpm..."
        npm install -g pnpm
    fi
    
    # Install dependencies
    pnpm install
    
    log_success "Dependencies updated"
}

# Build application
build_application() {
    log_info "Building application..."
    
    # Build packages
    pnpm run build:packages
    
    # Build applications
    pnpm run build:apps
    
    log_success "Application built successfully"
}

# Update Docker images
update_docker_images() {
    log_info "Updating Docker images..."
    
    # Build new images
    docker-compose build --no-cache
    
    log_success "Docker images updated"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Start database
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 30
    
    # Run migrations (if migration script exists)
    if [ -f "./scripts/migrate.sh" ]; then
        ./scripts/migrate.sh
        log_success "Database migrations completed"
    else
        log_info "No migration script found. Skipping migrations."
    fi
}

# Start services
start_services() {
    log_info "Starting services..."
    
    # Start all services
    docker-compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 60
    
    # Check health
    if [ -f "./scripts/health-check.sh" ]; then
        ./scripts/health-check.sh
    else
        log_warning "Health check script not found. Please verify services manually."
    fi
}

# Verify upgrade
verify_upgrade() {
    log_info "Verifying upgrade..."
    
    # Check API health
    if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
        log_success "API service is healthy"
    else
        log_error "API service is not responding"
        return 1
    fi
    
    # Check Web dashboard
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        log_success "Web dashboard is healthy"
    else
        log_error "Web dashboard is not responding"
        return 1
    fi
    
    # Check version
    local new_version=$(grep '"version"' package.json | cut -d'"' -f4)
    if [ "$new_version" = "$TARGET_VERSION" ]; then
        log_success "Version updated to $new_version"
    else
        log_warning "Version mismatch. Expected: $TARGET_VERSION, Got: $new_version"
    fi
    
    log_success "Upgrade verification completed"
}

# Cleanup
cleanup() {
    log_info "Cleaning up..."
    
    # Remove upgrade directory
    if [ -d "$UPGRADE_DIR" ]; then
        rm -rf "$UPGRADE_DIR"
        log_success "Upgrade directory cleaned"
    fi
    
    # Remove old Docker images
    docker image prune -f
    log_success "Old Docker images cleaned"
}

# Rollback function
rollback() {
    log_error "Upgrade failed. Starting rollback..."
    
    # Stop services
    docker-compose down
    
    # Restore from backup
    if [ -f "./scripts/backup.sh" ]; then
        local latest_backup=$(ls -t "$BACKUP_DIR"/supernova_* 2>/dev/null | head -n1)
        if [ -n "$latest_backup" ]; then
            log_info "Restoring from backup: $latest_backup"
            ./scripts/backup.sh restore "$latest_backup"
        else
            log_error "No backup found for rollback"
        fi
    else
        log_error "Backup script not found. Manual rollback required."
    fi
    
    # Start services
    docker-compose up -d
    
    log_warning "Rollback completed. Please check the system manually."
}

# Display upgrade summary
show_summary() {
    log_success "Node2AI upgrade completed successfully!"
    echo
    echo "Upgrade Summary:"
    echo "  From: $CURRENT_VERSION"
    echo "  To:   $TARGET_VERSION"
    echo
    echo "Access URLs:"
    echo "  Web Dashboard: http://localhost:3000"
    echo "  API Gateway:   http://localhost:3001"
    echo "  API Docs:      http://localhost:3001/api/docs"
    echo
    echo "Next steps:"
    echo "  1. Verify all services are running"
    echo "  2. Test critical functionality"
    echo "  3. Update any custom configurations"
    echo "  4. Monitor system performance"
    echo
    log_warning "Remember to test your installation thoroughly!"
}

# Main upgrade function
main() {
    local target_version="$1"
    local download_url="$2"
    
    if [ -z "$target_version" ]; then
        log_error "Target version not specified"
        echo "Usage: $0 <target_version> [download_url]"
        exit 1
    fi
    
    log_info "Starting Node2AI upgrade to version $target_version..."
    
    # Set up error handling
    trap 'rollback' ERR
    
    check_root
    get_current_version
    get_target_version "$target_version"
    create_backup
    stop_services
    update_code "$target_version" "$download_url"
    update_dependencies
    build_application
    update_docker_images
    run_migrations
    start_services
    verify_upgrade
    cleanup
    show_summary
    
    # Clear error trap
    trap - ERR
}

# Run main function
main "$@"
