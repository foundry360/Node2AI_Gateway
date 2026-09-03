#!/bin/bash

# Node2AI Database Setup Script
# Alternative to migrate.sh for Docker-based setup

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

# Check if Docker is running
check_docker() {
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    log_success "Docker is running"
}

# Start database services
start_database() {
    log_info "Starting database services..."
    cd deployments/docker
    docker-compose up -d postgres redis
    cd ../..
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 30
    
    # Check if database is accessible
    if docker-compose -f deployments/docker/docker-compose.yml exec postgres pg_isready -U node2 -d node2; then
        log_success "Database is ready"
    else
        log_error "Database is not ready"
        exit 1
    fi
}

# Run database initialization
run_initialization() {
    log_info "Running database initialization..."
    
    # The initialization script is automatically run by PostgreSQL
    # when the container starts, but we can verify it worked
    sleep 10
    
    # Check if tables exist
    table_count=$(docker-compose -f deployments/docker/docker-compose.yml exec -T postgres psql -U node2 -d node2 -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('organizations', 'users', 'api_keys', 'provider_keys', 'usage_events', 'token_mappings', 'curated_sources', 'vector_embeddings', 'audit_logs', 'integrations', 'integration_events');")
    
    if [ "$table_count" -eq 11 ]; then
        log_success "Database initialization completed successfully"
    else
        log_error "Database initialization failed. Expected 11 tables, found $table_count"
        exit 1
    fi
}

# Show database status
show_status() {
    log_info "Database status:"
    
    docker-compose -f deployments/docker/docker-compose.yml exec postgres psql -U node2 -d node2 -c "
        SELECT 
            schemaname,
            tablename,
            tableowner
        FROM pg_tables 
        WHERE schemaname = 'public' 
        ORDER BY tablename;
    "
    
    echo
    log_info "Default data:"
    docker-compose -f deployments/docker/docker-compose.yml exec postgres psql -U node2 -d node2 -c "
        SELECT 'Organizations' as table_name, COUNT(*) as count FROM organizations
        UNION ALL
        SELECT 'Users', COUNT(*) FROM users
        UNION ALL
        SELECT 'API Keys', COUNT(*) FROM api_keys
        UNION ALL
        SELECT 'Usage Events', COUNT(*) FROM usage_events
        UNION ALL
        SELECT 'Audit Logs', COUNT(*) FROM audit_logs;
    "
}

# Main setup function
main() {
    log_info "Starting Node2AI database setup..."
    
    check_docker
    start_database
    run_initialization
    show_status
    
    log_success "Database setup completed successfully!"
    echo
    log_info "Default credentials:"
    echo "  Organization: default-org"
    echo "  Admin User: admin@node2.ai"
    echo "  Password: admin123"
    echo "  API Key: test-api-key-123"
    echo
    log_info "You can now start the full Node2AI stack with:"
    echo "  docker-compose -f deployments/docker/docker-compose.yml up -d"
}

# Run main function
main "$@"