#!/bin/bash

# Node2AI Development Setup Script
# This script sets up the complete development environment for Node2AI

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

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root"
        exit 1
    fi
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker Desktop first."
        log_info "Download from: https://www.docker.com/products/docker-desktop/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warning "pnpm is not installed. Installing pnpm..."
        npm install -g pnpm
    fi
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    log_success "All requirements satisfied"
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."
    
    mkdir -p data/postgres
    mkdir -p data/redis
    mkdir -p data/ollama
    mkdir -p data/uploads
    mkdir -p data/logs
    mkdir -p data/backups
    
    # Set proper permissions
    chmod 755 data/
    chmod 755 data/postgres
    chmod 755 data/redis
    chmod 755 data/ollama
    chmod 755 data/uploads
    chmod 755 data/logs
    chmod 755 data/backups
    
    log_success "Directories created"
}

# Setup environment file
setup_environment() {
    log_info "Setting up environment configuration..."
    
    if [ ! -f .env ]; then
        if [ -f env.example ]; then
            cp env.example .env
            log_success "Created .env file from env.example"
            log_warning "Please update .env file with your configuration values"
        else
            log_error "env.example file not found"
            exit 1
        fi
    else
        log_info ".env file already exists"
    fi
    
    # Generate secure secrets if not set
    if ! grep -q "JWT_SECRET=" .env || grep -q "dev-jwt-secret" .env; then
        JWT_SECRET=$(openssl rand -base64 32)
        sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
        log_success "Generated secure JWT secret"
    fi
    
    if ! grep -q "ENCRYPTION_KEY=" .env || grep -q "dev-encryption-key" .env; then
        ENCRYPTION_KEY=$(openssl rand -base64 32)
        sed -i.bak "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
        log_success "Generated secure encryption key"
    fi
    
    if ! grep -q "API_KEY_SECRET=" .env || grep -q "dev-api-key-secret" .env; then
        API_KEY_SECRET=$(openssl rand -base64 32)
        sed -i.bak "s/API_KEY_SECRET=.*/API_KEY_SECRET=$API_KEY_SECRET/" .env
        log_success "Generated secure API key secret"
    fi
    
    # Clean up backup files
    rm -f .env.bak
}

# Install dependencies
install_dependencies() {
    log_info "Installing project dependencies..."
    
    # Install root dependencies
    pnpm install
    
    # Build shared packages
    log_info "Building shared packages..."
    pnpm --filter @node2/shared build
    pnpm --filter @node2/sanitization build
    pnpm --filter @node2/sdk build
    
    log_success "Dependencies installed and packages built"
}

# Start Docker services
start_services() {
    log_info "Starting Docker services..."
    
    # Stop any existing services
    docker-compose -f docker-compose.dev.yml down 2>/dev/null || true
    
    # Start services
    docker-compose -f docker-compose.dev.yml up -d postgres redis
    
    # Wait for database to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    sleep 10
    
    # Check if PostgreSQL is ready
    for i in {1..30}; do
        if docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U node2 -d node2 >/dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "PostgreSQL failed to start"
            exit 1
        fi
        sleep 2
    done
    
    # Start API and Web services
    log_info "Starting API and Web services..."
    docker-compose -f docker-compose.dev.yml up -d api web
    
    log_success "All services started"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Wait for API to be ready
    sleep 10
    
    # Run migrations (if available)
    if docker-compose -f docker-compose.dev.yml exec -T api pnpm --filter @node2/api db:migrate 2>/dev/null; then
        log_success "Database migrations completed"
    else
        log_warning "No migrations found or migration command not available"
    fi
}

# Seed development data
seed_data() {
    log_info "Seeding development data..."
    
    # Wait for API to be ready
    sleep 5
    
    # Seed data (if available)
    if docker-compose -f docker-compose.dev.yml exec -T api pnpm --filter @node2/api db:seed 2>/dev/null; then
        log_success "Development data seeded"
    else
        log_warning "No seed data found or seed command not available"
    fi
}

# Check service health
check_health() {
    log_info "Checking service health..."
    
    # Wait for services to be ready
    sleep 15
    
    # Check API health
    if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
        log_success "API service is healthy"
    else
        log_warning "API service health check failed"
    fi
    
    # Check Web health
    if curl -f http://localhost:3001 >/dev/null 2>&1; then
        log_success "Web service is healthy"
    else
        log_warning "Web service health check failed"
    fi
}

# Display setup summary
show_summary() {
    log_success "Node2AI development setup completed!"
    echo
    echo "=========================================="
    echo "Development Environment Ready"
    echo "=========================================="
    echo
    echo "Access URLs:"
    echo "  🌐 Web Dashboard: http://localhost:3001"
    echo "  🔌 API Gateway:   http://localhost:3000"
    echo "  📚 API Docs:      http://localhost:3000/api/docs"
    echo "  ❤️  Health Check: http://localhost:3000/api/health"
    echo
    echo "Default Credentials:"
    echo "  📧 Email:    admin@node2.ai"
    echo "  🔑 Password: admin123"
    echo
    echo "Services:"
    echo "  🐘 PostgreSQL: localhost:5432"
    echo "  🔴 Redis:     localhost:6379"
    echo "  🤖 Ollama:   localhost:11434 (optional)"
    echo
    echo "Useful Commands:"
    echo "  📊 View logs:     docker-compose -f docker-compose.dev.yml logs -f"
    echo "  🔄 Restart:      docker-compose -f docker-compose.dev.yml restart"
    echo "  🛑 Stop all:      docker-compose -f docker-compose.dev.yml down"
    echo "  🧹 Clean up:      ./scripts/dev-teardown.sh"
    echo
    echo "Development Tips:"
    echo "  • Hot reload is enabled for API and Web services"
    echo "  • Database data persists in ./data/postgres"
    echo "  • Redis data persists in ./data/redis"
    echo "  • Logs are available in ./data/logs"
    echo
    log_warning "Remember to update your .env file with production values before deploying!"
}

# Main setup function
main() {
    echo "🚀 Node2AI Development Setup"
    echo "============================"
    echo
    
    check_root
    check_requirements
    create_directories
    setup_environment
    install_dependencies
    start_services
    run_migrations
    seed_data
    check_health
    show_summary
}

# Run main function
main "$@"
