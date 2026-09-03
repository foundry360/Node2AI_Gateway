#!/bin/bash
# Start Node2AI Enterprise services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

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

# Detect deployment method
if [ -f "docker/docker-compose.yml" ] && command -v docker-compose &> /dev/null; then
    log_info "Starting Docker services..."
    cd docker
    
    if [ -f ".env.production" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    else
        docker-compose up -d
    fi
    
    log_info "Services started. Check status with: docker-compose ps"
    log_info "View logs with: docker-compose logs -f"
    
elif [ -f "/etc/systemd/system/node2ai.service" ]; then
    log_info "Starting systemd service..."
    systemctl start node2ai
    systemctl status node2ai
    
elif command -v kubectl &> /dev/null && kubectl get namespace node2ai &> /dev/null; then
    log_info "Starting Kubernetes deployments..."
    kubectl scale deployment --all --replicas=2 -n node2ai
    log_info "Deployments scaled up. Check status with: kubectl get pods -n node2ai"
    
else
    log_warn "No deployment method detected. Please run installation first."
    exit 1
fi

log_info "Node2AI services started successfully!"

