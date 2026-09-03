#!/bin/bash
# Master installation script for Node2AI Enterprise
# Handles prerequisites, configuration, and deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

VERSION="1.0.0"
INSTALL_DIR="/opt/node2ai"
LOG_FILE="/var/log/node2ai-install.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
        OS_VERSION=$(lsb_release -sr)
    elif [ -f /etc/lsb-release ]; then
        . /etc/lsb-release
        OS=$DISTRIB_ID
        OS_VERSION=$DISTRIB_RELEASE
    elif [ -f /etc/debian_version ]; then
        OS=debian
        OS_VERSION=$(cat /etc/debian_version)
    elif [ -f /etc/redhat-release ]; then
        OS=rhel
        OS_VERSION=$(cat /etc/redhat-release | sed 's/.*release \([0-9.]*\).*/\1/')
    else
        log_error "Cannot detect operating system"
        exit 1
    fi
    
    log_info "Detected OS: $OS $OS_VERSION"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | cut -d ' ' -f 3 | cut -d ',' -f 1)
        log_info "Docker found: $DOCKER_VERSION"
        HAS_DOCKER=true
    else
        log_warn "Docker not found. Will use standalone installation."
        HAS_DOCKER=false
    fi
    
    # Check Docker Compose
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        log_info "Docker Compose found"
        HAS_DOCKER_COMPOSE=true
    else
        log_warn "Docker Compose not found"
        HAS_DOCKER_COMPOSE=false
    fi
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | cut -d 'v' -f 2)
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d '.' -f 1)
        if [ "$NODE_MAJOR" -ge 18 ]; then
            log_info "Node.js found: $NODE_VERSION"
            HAS_NODE=true
        else
            log_warn "Node.js version $NODE_VERSION is too old. Need 18+"
            HAS_NODE=false
        fi
    else
        log_warn "Node.js not found"
        HAS_NODE=false
    fi
    
    # Check pnpm
    if command -v pnpm &> /dev/null; then
        log_info "pnpm found"
        HAS_PNPM=true
    else
        log_warn "pnpm not found. Will install it."
        HAS_PNPM=false
    fi
    
    # Check PostgreSQL
    if command -v psql &> /dev/null; then
        log_info "PostgreSQL client found"
    fi
}

# Install prerequisites
install_prerequisites() {
    log_info "Installing prerequisites..."
    
    case $OS in
        ubuntu|debian)
            apt-get update
            if [ "$HAS_DOCKER" = false ]; then
                log_info "Installing Docker..."
                apt-get install -y docker.io docker-compose
            fi
            if [ "$HAS_NODE" = false ]; then
                log_info "Installing Node.js..."
                curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
                apt-get install -y nodejs
            fi
            ;;
        rhel|centos|fedora)
            if [ "$HAS_DOCKER" = false ]; then
                log_info "Installing Docker..."
                yum install -y docker docker-compose
                systemctl enable docker
                systemctl start docker
            fi
            if [ "$HAS_NODE" = false ]; then
                log_info "Installing Node.js..."
                curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
                yum install -y nodejs
            fi
            ;;
    esac
    
    if [ "$HAS_PNPM" = false ]; then
        log_info "Installing pnpm..."
        npm install -g pnpm@8
    fi
}

# Generate secrets
generate_secrets() {
    log_info "Generating secure secrets..."
    
    SECRETS_FILE="$SCRIPT_DIR/../config/.env.secrets"
    
    cat > "$SECRETS_FILE" <<EOF
# Auto-generated secrets - DO NOT SHARE
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
API_KEY_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)
EOF
    
    chmod 600 "$SECRETS_FILE"
    log_info "Secrets generated in $SECRETS_FILE"
}

# Main installation flow
main() {
    log_info "Starting Node2AI Enterprise installation v$VERSION"
    
    check_root
    detect_os
    check_prerequisites
    
    read -p "Install missing prerequisites? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_prerequisites
    fi
    
    # Choose installation method
    echo ""
    echo "Select installation method:"
    echo "1) Docker (Recommended)"
    echo "2) Standalone"
    echo "3) Kubernetes"
    read -p "Enter choice [1-3]: " INSTALL_METHOD
    
    case $INSTALL_METHOD in
        1)
            if [ "$HAS_DOCKER" = false ]; then
                log_error "Docker is required for this installation method"
                exit 1
            fi
            log_info "Installing via Docker..."
            cd docker
            generate_secrets
            cp ../config/.env.example .env
            cat ../config/.env.secrets >> .env
            docker-compose up -d
            ;;
        2)
            if [ "$HAS_NODE" = false ]; then
                log_error "Node.js 18+ is required for standalone installation"
                exit 1
            fi
            log_info "Installing standalone..."
            cd standalone
            ./install.sh
            ;;
        3)
            log_info "Kubernetes installation..."
            log_warn "See kubernetes/README.md for detailed instructions"
            cd kubernetes
            kubectl apply -f namespace.yaml
            kubectl apply -f .
            ;;
        *)
            log_error "Invalid choice"
            exit 1
            ;;
    esac
    
    log_info "Installation complete!"
    log_info "Access web dashboard at: http://localhost:3000"
    log_info "API health check: http://localhost:3001/api/health"
}

main "$@"
