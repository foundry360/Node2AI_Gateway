#!/bin/bash
set -e

# Node2AI Enterprise Installation Script
# Installs and configures Node2AI Enterprise Edition

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Node2AI Enterprise Installation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "⚠️  This script should not be run as root for security reasons"
   echo "   Please run as a regular user with sudo privileges"
   exit 1
fi

# Check prerequisites
echo ""
echo "🔍 Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed."; exit 1; }
echo "✅ Prerequisites met"

# Check for environment file
if [ ! -f ".env" ]; then
    echo ""
    echo "⚠️  No .env file found. Creating from template..."
    if [ -f "env.example" ]; then
        cp env.example .env
        echo "✅ Created .env from template"
        echo "⚠️  Please edit .env with your configuration before continuing"
        echo "   Press Enter when ready to continue..."
        read
    else
        echo "❌ No env.example found. Cannot proceed."
        exit 1
    fi
fi

# Load Docker images
echo ""
echo "🐳 Loading Docker images..."
if [ -d "docker-images" ]; then
    for image in docker-images/*.tar.gz; do
        if [ -f "$image" ]; then
            echo "Loading $(basename $image)..."
            docker load < "$image"
        fi
    done
    echo "✅ Docker images loaded"
else
    echo "⚠️  No docker-images directory found. Pulling from registry..."
    docker pull node2ai/api:latest
    docker pull node2ai/web:latest
    docker pull postgres:14-alpine
    docker pull redis:7-alpine
fi

# Start services
echo ""
echo "🚀 Starting Node2AI services..."
if [ -f "deployments/docker/docker-compose.yml" ]; then
    cd deployments/docker
    docker-compose up -d
    cd ../..
else
    echo "❌ No docker-compose.yml found in deployments/docker/"
    exit 1
fi

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service health
echo ""
echo "🔍 Checking service health..."
if curl -f http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "✅ API service is healthy"
else
    echo "❌ API service is not responding"
    echo "Check logs: docker-compose -f deployments/docker/docker-compose.yml logs api"
    exit 1
fi

if curl -f http://localhost:3000 >/dev/null 2>&1; then
    echo "✅ Web service is healthy"
else
    echo "❌ Web service is not responding"
    echo "Check logs: docker-compose -f deployments/docker/docker-compose.yml logs web"
    exit 1
fi

# Initialize database
echo ""
echo "🗄️  Initializing database..."
if [ -f "scripts/seed-data.ts" ]; then
    docker-compose -f deployments/docker/docker-compose.yml exec api pnpm run seed || {
        echo "⚠️  Database seeding failed, but services are running"
    }
else
    echo "⚠️  No seed script found. Database may need manual initialization."
fi

echo ""
echo "🎉 Node2AI Enterprise Edition installed successfully!"
echo ""
echo "Access your installation:"
echo "  Web Interface: http://localhost:3000"
echo "  API: http://localhost:3001"
echo ""
echo "Default login credentials:"
echo "  Email: admin@node2ai.ai"
echo "  Password: admin123"
echo ""
echo "⚠️  IMPORTANT: Change the default password immediately!"
echo ""
echo "Next steps:"
echo "  1. Login and change default password"
echo "  2. Add your AI provider API keys"
echo "  3. Configure your organization settings"
echo "  4. Review security settings"
echo ""
echo "For support: enterprise@foundry360.com"
