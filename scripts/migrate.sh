#!/bin/bash

# Node2AI Database Migration Script
# Handles Prisma migrations and database initialization

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

# Check if running in correct directory
check_directory() {
    if [ ! -f "package.json" ] || [ ! -d "apps/api" ]; then
        log_error "Please run this script from the Node2AI root directory"
        exit 1
    fi
}

# Check if required tools are installed
check_requirements() {
    log_info "Checking requirements..."
    
    # Check if pnpm is installed
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed. Please install pnpm first."
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if database is accessible
    if [ -n "$DATABASE_URL" ]; then
        log_info "Testing database connection..."
        if ! pg_isready -d "$DATABASE_URL" &> /dev/null; then
            log_warning "Database not accessible. Make sure PostgreSQL is running."
        fi
    fi
    
    log_success "Requirements check completed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    pnpm install
    log_success "Dependencies installed"
}

# Generate Prisma client
generate_prisma_client() {
    log_info "Generating Prisma client..."
    cd apps/api
    pnpm prisma generate
    cd ../..
    log_success "Prisma client generated"
}

# Run Prisma migrations
run_prisma_migrations() {
    log_info "Running Prisma migrations..."
    cd apps/api
    
    # Check if migrations exist
    if [ -d "prisma/migrations" ]; then
        log_info "Found existing migrations, running them..."
        pnpm prisma migrate deploy
    else
        log_info "No migrations found, creating initial migration..."
        pnpm prisma migrate dev --name init
    fi
    
    cd ../..
    log_success "Prisma migrations completed"
}

# Run database initialization script
run_database_init() {
    log_info "Running database initialization script..."
    
    # Check if init script exists
    if [ ! -f "deployments/docker/init-db.sql" ]; then
        log_error "Database initialization script not found at deployments/docker/init-db.sql"
        exit 1
    fi
    
    # Run the initialization script
    if [ -n "$DATABASE_URL" ]; then
        log_info "Using DATABASE_URL from environment..."
        psql "$DATABASE_URL" -f deployments/docker/init-db.sql
    else
        log_info "Using default database connection..."
        psql -h localhost -p 5432 -U node2 -d node2 -f deployments/docker/init-db.sql
    fi
    
    log_success "Database initialization completed"
}

# Verify database setup
verify_database() {
    log_info "Verifying database setup..."
    
    # Check if tables exist
    if [ -n "$DATABASE_URL" ]; then
        table_count=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('organizations', 'users', 'api_keys', 'provider_keys', 'usage_events', 'token_mappings', 'curated_sources', 'vector_embeddings', 'audit_logs', 'integrations', 'integration_events');")
    else
        table_count=$(psql -h localhost -p 5432 -U node2 -d node2 -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('organizations', 'users', 'api_keys', 'provider_keys', 'usage_events', 'token_mappings', 'curated_sources', 'vector_embeddings', 'audit_logs', 'integrations', 'integration_events');")
    fi
    
    if [ "$table_count" -eq 11 ]; then
        log_success "All required tables found"
    else
        log_error "Expected 11 tables, found $table_count"
        exit 1
    fi
    
    # Check if default organization exists
    if [ -n "$DATABASE_URL" ]; then
        org_count=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM organizations WHERE id = 'default-org';")
    else
        org_count=$(psql -h localhost -p 5432 -U node2 -d node2 -t -c "SELECT COUNT(*) FROM organizations WHERE id = 'default-org';")
    fi
    
    if [ "$org_count" -eq 1 ]; then
        log_success "Default organization found"
    else
        log_error "Default organization not found"
        exit 1
    fi
    
    # Check if default admin user exists
    if [ -n "$DATABASE_URL" ]; then
        user_count=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM users WHERE email = 'admin@node2.ai';")
    else
        user_count=$(psql -h localhost -p 5432 -U node2 -d node2 -t -c "SELECT COUNT(*) FROM users WHERE email = 'admin@node2.ai';")
    fi
    
    if [ "$user_count" -eq 1 ]; then
        log_success "Default admin user found"
    else
        log_error "Default admin user not found"
        exit 1
    fi
}

# Reset database (for development)
reset_database() {
    log_warning "Resetting database..."
    
    if [ -n "$DATABASE_URL" ]; then
        psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    else
        psql -h localhost -p 5432 -U node2 -d node2 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    fi
    
    log_success "Database reset completed"
}

# Show database status
show_status() {
    log_info "Database status:"
    
    if [ -n "$DATABASE_URL" ]; then
        psql "$DATABASE_URL" -c "
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
        psql "$DATABASE_URL" -c "
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
    else
        psql -h localhost -p 5432 -U node2 -d node2 -c "
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
        psql -h localhost -p 5432 -U node2 -d node2 -c "
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
    fi
}

# Main migration function
run_migration() {
    log_info "Starting Node2AI database migration..."
    
    check_directory
    check_requirements
    install_dependencies
    generate_prisma_client
    run_prisma_migrations
    run_database_init
    verify_database
    
    log_success "Database migration completed successfully!"
    echo
    log_info "Default credentials:"
    echo "  Organization: default-org"
    echo "  Admin User: admin@node2.ai"
    echo "  Password: admin123"
    echo "  API Key: test-api-key-123"
    echo
    log_info "You can now start the Node2AI services with:"
    echo "  docker-compose up -d"
}

# Help function
show_help() {
    echo "Node2AI Database Migration Script"
    echo
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  migrate    Run full database migration (default)"
    echo "  reset      Reset database (WARNING: destroys all data)"
    echo "  status     Show database status"
    echo "  help       Show this help message"
    echo
    echo "Environment Variables:"
    echo "  DATABASE_URL    PostgreSQL connection string"
    echo "                   (default: postgresql://node2:node2123@localhost:5432/node2)"
    echo
    echo "Examples:"
    echo "  $0                    # Run full migration"
    echo "  $0 reset              # Reset database"
    echo "  $0 status             # Show database status"
    echo "  DATABASE_URL=postgresql://user:pass@host:port/db $0 migrate"
}

# Main script logic
case "${1:-migrate}" in
    "migrate")
        run_migration
        ;;
    "reset")
        check_directory
        check_requirements
        reset_database
        run_database_init
        verify_database
        log_success "Database reset and reinitialized successfully!"
        ;;
    "status")
        check_directory
        show_status
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
