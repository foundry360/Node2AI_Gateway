#!/bin/bash
# Standalone installation script for Node2AI Enterprise

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

INSTALL_DIR="/opt/node2ai"
SERVICE_USER="node2ai"
SERVICE_FILE="/etc/systemd/system/node2ai.service"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version must be 18 or higher"
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_info "Installing pnpm..."
        npm install -g pnpm@8
    fi
    
    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        log_warn "PostgreSQL client not found. Database must be configured manually."
    fi
    
    log_info "Prerequisites check complete"
}

# Create service user
create_service_user() {
    if id "$SERVICE_USER" &>/dev/null; then
        log_info "Service user $SERVICE_USER already exists"
    else
        log_info "Creating service user $SERVICE_USER..."
        useradd -r -s /bin/false -d "$INSTALL_DIR" "$SERVICE_USER"
    fi
}

# Install application
install_application() {
    log_info "Installing application to $INSTALL_DIR..."
    
    # Create directory
    mkdir -p "$INSTALL_DIR"
    
    # Copy application files
    cp -r node2ai-server/* "$INSTALL_DIR/"
    
    # Install production dependencies
    cd "$INSTALL_DIR"
    pnpm install --prod --frozen-lockfile
    
    # Set ownership
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    
    log_info "Application installed"
}

# Configure environment
configure_environment() {
    log_info "Configuring environment..."
    
    ENV_DIR="/etc/node2ai"
    mkdir -p "$ENV_DIR"
    
    # Copy or create .env file
    if [ -f "../config/.env.production" ]; then
        cp "../config/.env.production" "$ENV_DIR/.env"
    else
        cp "../config/.env.example" "$ENV_DIR/.env"
        log_warn "Please edit $ENV_DIR/.env with your configuration"
    fi
    
    chmod 600 "$ENV_DIR/.env"
    chown "$SERVICE_USER:$SERVICE_USER" "$ENV_DIR/.env"
}

# Install systemd service
install_service() {
    log_info "Installing systemd service..."
    
    # Copy service file
    cp systemd/node2ai.service "$SERVICE_FILE"
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    systemctl enable node2ai
    
    log_info "Systemd service installed"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    cd "$INSTALL_DIR"
    
    if [ -f "package.json" ] && grep -q "db:migrate" package.json; then
        sudo -u "$SERVICE_USER" pnpm run db:migrate || log_warn "Migration failed. Please run manually."
    else
        log_warn "No migration script found. Please run migrations manually."
    fi
}

# Main installation
main() {
    log_info "Starting Node2AI standalone installation..."
    
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        exit 1
    fi
    
    check_prerequisites
    create_service_user
    install_application
    configure_environment
    install_service
    
    log_info ""
    log_info "Installation complete!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Edit /etc/node2ai/.env with your configuration"
    log_info "2. Run database migrations: cd $INSTALL_DIR && pnpm run db:migrate"
    log_info "3. Start service: systemctl start node2ai"
    log_info "4. Check status: systemctl status node2ai"
    log_info "5. View logs: journalctl -u node2ai -f"
}

main "$@"

