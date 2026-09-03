#!/bin/bash

# Node2AI Database Setup Script
# This script sets up the PostgreSQL database for development

set -e

echo "🗄️ Setting up Node2AI Database..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="node2ai_dev"
DB_USER="postgres"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"

echo -e "${BLUE}📋 Database Configuration:${NC}"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo ""

# Check if PostgreSQL is running
echo -e "${YELLOW}🔍 Checking PostgreSQL status...${NC}"
if ! pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
    echo -e "${RED}❌ PostgreSQL is not running on $DB_HOST:$DB_PORT${NC}"
    echo ""
    echo -e "${YELLOW}💡 To start PostgreSQL:${NC}"
    echo "  macOS: brew services start postgresql@15"
    echo "  Docker: docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15"
    echo "  Linux: sudo systemctl start postgresql"
    echo ""
    echo -e "${YELLOW}📚 Or use a managed cloud database:${NC}"
    echo "  Neon: https://neon.tech (free tier)"
    echo "  Railway: https://railway.app (free tier)"
    echo "  Aiven: https://aiven.io"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL is running${NC}"

# Create database
echo -e "${YELLOW}🔧 Creating database...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo "Database already exists"

echo -e "${GREEN}✅ Database created${NC}"

# Test connection
echo -e "${YELLOW}🔍 Testing database connection...${NC}"
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection successful${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    exit 1
fi

# Create extensions
echo -e "${YELLOW}🔧 Creating database extensions...${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
    CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";
    CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";
    CREATE EXTENSION IF NOT EXISTS \"btree_gin\";
"

echo -e "${GREEN}✅ Database extensions created${NC}"

# Run Prisma migrations
echo -e "${YELLOW}🔄 Running database migrations...${NC}"
cd apps/api
if [ -f "prisma/schema.prisma" ]; then
    npx prisma migrate deploy
    echo -e "${GREEN}✅ Database migrations completed${NC}"
else
    echo -e "${YELLOW}⚠️  No Prisma schema found, skipping migrations${NC}"
fi

# Seed test data
echo -e "${YELLOW}🌱 Seeding test data...${NC}"
if [ -f "scripts/seed-test-data.ts" ]; then
    npx tsx scripts/seed-test-data.ts
    echo -e "${GREEN}✅ Test data seeded${NC}"
else
    echo -e "${YELLOW}⚠️  No seed script found, skipping data seeding${NC}"
fi

cd ../..

echo ""
echo -e "${GREEN}🎉 Database Setup Complete!${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "1. Copy env.local.example to apps/api/.env.local"
echo "2. Update your OpenAI API key in .env.local"
echo "3. Restart the API server: cd apps/api && pnpm run dev"
echo "4. Test the API with real database: curl http://localhost:3001/api/v1/admin/status"
echo ""
echo -e "${BLUE}🔗 Database Connection String:${NC}"
echo "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""
echo -e "${BLUE}🧪 Test the connection:${NC}"
echo "psql postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
