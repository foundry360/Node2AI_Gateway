#!/bin/bash
# Check Node2AI Enterprise service status

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo "=========================================="
echo "Node2AI Enterprise Service Status"
echo "=========================================="
echo ""

# Check Docker deployment
if [ -f "docker/docker-compose.yml" ] && command -v docker-compose &> /dev/null; then
    log_info "Docker Deployment Status:"
    cd docker
    docker-compose ps
    echo ""
    
    # Check health endpoints
    log_info "Health Checks:"
    if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
        log_info "  ✓ API Server: Healthy"
    else
        log_error "  ✗ API Server: Unhealthy"
    fi
    
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        log_info "  ✓ Web Dashboard: Healthy"
    else
        log_error "  ✗ Web Dashboard: Unhealthy"
    fi
    
    # Check database
    if docker-compose exec -T postgres pg_isready -U node2ai > /dev/null 2>&1; then
        log_info "  ✓ PostgreSQL: Healthy"
    else
        log_error "  ✗ PostgreSQL: Unhealthy"
    fi
    
    # Check Redis
    if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_info "  ✓ Redis: Healthy"
    else
        log_error "  ✗ Redis: Unhealthy"
    fi

# Check systemd deployment
elif [ -f "/etc/systemd/system/node2ai.service" ]; then
    log_info "Systemd Service Status:"
    systemctl status node2ai --no-pager -l
    echo ""
    
    # Check health
    if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
        log_info "  ✓ API Server: Healthy"
    else
        log_error "  ✗ API Server: Unhealthy"
    fi

# Check Kubernetes deployment
elif command -v kubectl &> /dev/null && kubectl get namespace node2ai &> /dev/null; then
    log_info "Kubernetes Deployment Status:"
    echo ""
    echo "Pods:"
    kubectl get pods -n node2ai
    echo ""
    echo "Services:"
    kubectl get svc -n node2ai
    echo ""
    echo "Ingress:"
    kubectl get ingress -n node2ai 2>/dev/null || echo "  No ingress configured"
    echo ""
    
    # Check pod health
    READY_PODS=$(kubectl get pods -n node2ai -l app=node2ai --no-headers | grep -c Running || echo "0")
    TOTAL_PODS=$(kubectl get pods -n node2ai -l app=node2ai --no-headers | wc -l)
    log_info "  Pods: $READY_PODS/$TOTAL_PODS ready"

else
    log_warn "No deployment detected. Please run installation first."
    exit 1
fi

echo ""
echo "=========================================="

