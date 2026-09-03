#!/bin/bash

# Node2AI Development Teardown Script
# This script stops and cleans up the development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Stop Docker services
stop_services() {
    log_info "Stopping Docker services..."
    
    # Stop development services
    if docker-compose -f docker-compose.dev.yml ps -q | grep -q .; then
        docker-compose -f docker-compose.dev.yml down
        log_success "Development services stopped"
    else
        log_info "No development services running"
    fi
    
    # Stop production services (if running)
    if docker-compose -f docker-compose.prod.yml ps -q | grep -q .; then
        docker-compose -f docker-compose.prod.yml down
        log_success "Production services stopped"
    fi
}

# Remove Docker containers
remove_containers() {
    log_info "Removing Docker containers..."
    
    # Remove Node2AI containers
    CONTAINERS=$(docker ps -a --filter "name=node2-" --format "{{.Names}}" 2>/dev/null || true)
    
    if [ -n "$CONTAINERS" ]; then
        echo "$CONTAINERS" | xargs docker rm -f 2>/dev/null || true
        log_success "Containers removed"
    else
        log_info "No Node2AI containers found"
    fi
}

# Remove Docker images
remove_images() {
    log_info "Removing Docker images..."
    
    # Remove Node2AI images
    IMAGES=$(docker images --filter "reference=node2*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
    
    if [ -n "$IMAGES" ]; then
        echo "$IMAGES" | xargs docker rmi -f 2>/dev/null || true
        log_success "Images removed"
    else
        log_info "No Node2AI images found"
    fi
}

# Remove Docker volumes
remove_volumes() {
    log_info "Removing Docker volumes..."
    
    # Remove Node2AI volumes
    VOLUMES=$(docker volume ls --filter "name=node2-" --format "{{.Name}}" 2>/dev/null || true)
    
    if [ -n "$VOLUMES" ]; then
        echo "$VOLUMES" | xargs docker volume rm 2>/dev/null || true
        log_success "Volumes removed"
    else
        log_info "No Node2AI volumes found"
    fi
}

# Remove Docker networks
remove_networks() {
    log_info "Removing Docker networks..."
    
    # Remove Node2AI networks
    NETWORKS=$(docker network ls --filter "name=node2-" --format "{{.Name}}" 2>/dev/null || true)
    
    if [ -n "$NETWORKS" ]; then
        echo "$NETWORKS" | xargs docker network rm 2>/dev/null || true
        log_success "Networks removed"
    else
        log_info "No Node2AI networks found"
    fi
}

# Clean up local data directories
cleanup_data() {
    log_info "Cleaning up local data directories..."
    
    if [ -d "data" ]; then
        # Ask for confirmation before removing data
        echo
        log_warning "This will remove all local development data including:"
        echo "  • Database data (./data/postgres)"
        echo "  • Redis data (./data/redis)"
        echo "  • Ollama models (./data/ollama)"
        echo "  • Upload files (./data/uploads)"
        echo "  • Log files (./data/logs)"
        echo
        read -p "Are you sure you want to remove all data? (y/N): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf data/
            log_success "Local data directories removed"
        else
            log_info "Data directories preserved"
        fi
    else
        log_info "No data directories found"
    fi
}

# Clean up node_modules
cleanup_node_modules() {
    log_info "Cleaning up node_modules..."
    
    if [ -d "node_modules" ]; then
        rm -rf node_modules/
        log_success "node_modules removed"
    fi
    
    # Remove package lock files
    if [ -f "pnpm-lock.yaml" ]; then
        rm -f pnpm-lock.yaml
        log_success "pnpm-lock.yaml removed"
    fi
}

# Clean up build artifacts
cleanup_build() {
    log_info "Cleaning up build artifacts..."
    
    # Remove Next.js build directories
    find . -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
    find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
    find . -name "build" -type d -exec rm -rf {} + 2>/dev/null || true
    
    log_success "Build artifacts removed"
}

# Clean up Docker system
cleanup_docker_system() {
    log_info "Cleaning up Docker system..."
    
    # Remove unused containers, networks, images, and build cache
    docker system prune -f
    
    # Remove unused volumes
    docker volume prune -f
    
    log_success "Docker system cleaned"
}

# Show cleanup summary
show_summary() {
    log_success "Node2AI development environment cleaned up!"
    echo
    echo "=========================================="
    echo "Cleanup Summary"
    echo "=========================================="
    echo
    echo "Removed:"
    echo "  🐳 Docker containers"
    echo "  🖼️  Docker images"
    echo "  💾 Docker volumes"
    echo "  🌐 Docker networks"
    echo "  📦 node_modules"
    echo "  🏗️  Build artifacts"
    echo "  🧹 Docker system cache"
    echo
    echo "To start fresh:"
    echo "  🚀 ./scripts/dev-setup.sh"
    echo
    echo "To reinstall dependencies:"
    echo "  📦 pnpm install"
    echo
    log_info "Development environment is now clean and ready for a fresh start!"
}

# Main teardown function
main() {
    echo "🧹 Node2AI Development Teardown"
    echo "==============================="
    echo
    
    stop_services
    remove_containers
    remove_images
    remove_volumes
    remove_networks
    cleanup_data
    cleanup_node_modules
    cleanup_build
    cleanup_docker_system
    show_summary
}

# Run main function
main "$@"
