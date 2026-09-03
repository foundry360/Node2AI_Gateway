#!/bin/bash
# Stop Node2AI Enterprise services

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
    log_info "Stopping Docker services..."
    cd docker
    docker-compose down
    log_info "Services stopped."
    
elif [ -f "/etc/systemd/system/node2ai.service" ]; then
    log_info "Stopping systemd service..."
    systemctl stop node2ai
    log_info "Service stopped."
    
elif command -v kubectl &> /dev/null && kubectl get namespace node2ai &> /dev/null; then
    log_info "Scaling down Kubernetes deployments..."
    kubectl scale deployment --all --replicas=0 -n node2ai
    log_info "Deployments scaled down."
    
else
    log_warn "No deployment method detected."
    exit 1
fi

log_info "Node2AI services stopped successfully!"

