#!/bin/bash
set -e

# Node2AI Enterprise Packager
# Creates a distributable enterprise package with Docker images and documentation

VERSION="${1:-1.0.0}"
BUILD_DATE=$(date +%Y%m%d-%H%M%S)
PACKAGE_NAME="node2ai-enterprise-v${VERSION}"
OUTPUT_DIR="./dist/enterprise/${PACKAGE_NAME}"
ARCHIVE_NAME="${PACKAGE_NAME}-${BUILD_DATE}.tar.gz"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Node2AI Enterprise Packager"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Version: ${VERSION}"
echo "Build Date: ${BUILD_DATE}"
echo "Package: ${PACKAGE_NAME}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
echo ""
echo "🔍 Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required but not installed."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed."; exit 1; }
echo "✅ All prerequisites met"

# Clean previous build
echo ""
echo "🧹 Cleaning previous builds..."
rm -rf ./dist/enterprise
mkdir -p ${OUTPUT_DIR}

# Build applications
echo ""
echo "🔨 Building Node2AI applications..."
pnpm install --frozen-lockfile
pnpm run build

# Create Dockerfiles if they don't exist
echo ""
echo "📝 Ensuring Dockerfiles exist..."

# API Dockerfile
if [ ! -f "apps/api/Dockerfile" ]; then
cat > apps/api/Dockerfile << 'EOF'
FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/*/package.json ./packages/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build --filter=api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/api/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/api/.next/static ./apps/api/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/api/public ./apps/api/public
USER nextjs
EXPOSE 3001
ENV PORT=3001
CMD ["node", "apps/api/server.js"]
EOF
fi

# Web Dockerfile
if [ ! -f "apps/web/Dockerfile" ]; then
cat > apps/web/Dockerfile << 'EOF'
FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build --filter=web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
EOF
fi

# Build Docker images
echo ""
echo "🐳 Building Docker images..."
docker build --platform linux/amd64 -t node2ai/api:${VERSION} -f apps/api/Dockerfile . || {
  echo "❌ Failed to build API image"
  exit 1
}
docker build --platform linux/amd64 -t node2ai/web:${VERSION} -f apps/web/Dockerfile . || {
  echo "❌ Failed to build Web image"
  exit 1
}
echo "✅ Docker images built successfully"

# Save Docker images
echo ""
echo "💾 Saving Docker images to tar files..."
mkdir -p ${OUTPUT_DIR}/docker-images
docker save node2ai/api:${VERSION} | gzip > ${OUTPUT_DIR}/docker-images/node2ai-api-${VERSION}.tar.gz
docker save node2ai/web:${VERSION} | gzip > ${OUTPUT_DIR}/docker-images/node2ai-web-${VERSION}.tar.gz

# Pull and save PostgreSQL image
echo "💾 Saving PostgreSQL image..."
docker pull postgres:14-alpine
docker save postgres:14-alpine | gzip > ${OUTPUT_DIR}/docker-images/postgres-14-alpine.tar.gz

# Pull and save Redis image (optional but recommended)
echo "💾 Saving Redis image..."
docker pull redis:7-alpine
docker save redis:7-alpine | gzip > ${OUTPUT_DIR}/docker-images/redis-7-alpine.tar.gz

echo "✅ All images saved"

# Copy deployment files
echo ""
echo "📋 Copying deployment files..."
mkdir -p ${OUTPUT_DIR}/deployments

# Docker Compose
cp -r deployments/docker ${OUTPUT_DIR}/deployments/ 2>/dev/null || {
  echo "⚠️  No docker deployment found, creating default..."
  mkdir -p ${OUTPUT_DIR}/deployments/docker
}

# Kubernetes
cp -r deployments/kubernetes ${OUTPUT_DIR}/deployments/ 2>/dev/null || {
  echo "⚠️  No kubernetes deployment found, will create..."
}

# Copy scripts
echo ""
echo "📜 Copying installation scripts..."
mkdir -p ${OUTPUT_DIR}/scripts
cp scripts/install-enterprise.sh ${OUTPUT_DIR}/scripts/install.sh 2>/dev/null || {
  echo "⚠️  Install script not found, will create..."
}
cp scripts/backup.sh ${OUTPUT_DIR}/scripts/ 2>/dev/null || true
cp scripts/restore.sh ${OUTPUT_DIR}/scripts/ 2>/dev/null || true
cp scripts/health-check.sh ${OUTPUT_DIR}/scripts/ 2>/dev/null || true

# Make scripts executable
chmod +x ${OUTPUT_DIR}/scripts/*.sh 2>/dev/null || true

# Copy documentation
echo ""
echo "📖 Copying documentation..."
mkdir -p ${OUTPUT_DIR}/docs
cp docs/*.md ${OUTPUT_DIR}/docs/ 2>/dev/null || {
  echo "⚠️  Documentation not found"
}

# Create environment template
echo ""
echo "⚙️  Creating environment template..."
cat > ${OUTPUT_DIR}/env.example << 'ENVEOF'
# Node2AI Enterprise Configuration
# Version: ${VERSION}

# ============================================
# LICENSE (Required)
# ============================================
LICENSE_KEY=NODE2AI-XXXX-XXXX-XXXX

# ============================================
# APPLICATION
# ============================================
NODE_ENV=production
APP_NAME=Node2AI
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

# ============================================
# SECRETS (Generate new values!)
# ============================================
# Generate with: openssl rand -base64 32
JWT_SECRET=CHANGE_ME_GENERATE_NEW_SECRET
SESSION_SECRET=CHANGE_ME_GENERATE_NEW_SECRET

# Generate with: openssl rand -hex 32
PROVIDER_KEY_ENCRYPTION_KEY=CHANGE_ME_GENERATE_NEW_KEY

# ============================================
# DATABASE
# ============================================
DATABASE_URL=postgresql://node2ai:node2ai_secure_password@postgres:5432/node2ai
DATABASE_POOL_SIZE=20

# ============================================
# REDIS (Optional but recommended)
# ============================================
REDIS_URL=redis://redis:6379

# ============================================
# CORS
# ============================================
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# ============================================
# LOGGING
# ============================================
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# ============================================
# FEATURES
# ============================================
ENABLE_SANITIZATION=true
ENABLE_ANALYTICS=true
ENABLE_AUDIT_LOGS=true

# ============================================
# EMAIL (Optional - for notifications)
# ============================================
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=notifications@yourdomain.com
# SMTP_PASSWORD=your_smtp_password
# SMTP_FROM=Node2AI <notifications@yourdomain.com>
ENVEOF

# Create README for the package
echo ""
echo "📄 Creating package README..."
cat > ${OUTPUT_DIR}/README.md << 'READMEEOF'
# Node2AI Enterprise Edition

Version: ${VERSION}
Build Date: ${BUILD_DATE}

## Contents
```
node2ai-enterprise-v${VERSION}/
├── docker-images/           # Pre-built Docker images
│   ├── node2ai-api-*.tar.gz
│   ├── node2ai-web-*.tar.gz
│   ├── postgres-*.tar.gz
│   └── redis-*.tar.gz
├── deployments/
│   ├── docker/             # Docker Compose deployment
│   └── kubernetes/         # Kubernetes manifests
├── scripts/
│   ├── install.sh          # Installation script
│   ├── backup.sh           # Backup script
│   ├── restore.sh          # Restore script
│   └── health-check.sh     # Health check script
├── docs/                   # Complete documentation
├── env.example             # Environment configuration template
├── checksums.txt           # File integrity verification
└── README.md               # This file
```

## Quick Start

1. **Extract the package:**
   ```bash
   tar -xzf node2ai-enterprise-v${VERSION}-${BUILD_DATE}.tar.gz
   cd node2ai-enterprise-v${VERSION}
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Load Docker images:**
   ```bash
   docker load < docker-images/node2ai-api-${VERSION}.tar.gz
   docker load < docker-images/node2ai-web-${VERSION}.tar.gz
   docker load < docker-images/postgres-14-alpine.tar.gz
   docker load < docker-images/redis-7-alpine.tar.gz
   ```

4. **Install and start:**
   ```bash
   ./scripts/install.sh
   ```

5. **Access Node2AI:**
   - Web Interface: http://localhost:3000
   - API: http://localhost:3001
   - Default login: admin@node2ai.ai / admin123

## Documentation

See the `docs/` directory for complete documentation:
- [Installation Guide](docs/INSTALLATION.md)
- [API Documentation](docs/API.md)
- [Security Guide](docs/SECURITY.md)
- [Provider Keys Guide](docs/PROVIDER-KEYS.md)
- [FAQ](docs/FAQ.md)

## Support

- 📧 Email: enterprise@foundry360.com
- 📖 Documentation: https://docs.foundry360.com/node2ai
- 💬 Community: https://community.foundry360.com

## License

This is a licensed copy of Node2AI Enterprise Edition.
Contact sales@foundry360.com for licensing questions.
READMEEOF

# Create installation script
echo ""
echo "📜 Creating enterprise installation script..."
cat > ${OUTPUT_DIR}/scripts/install.sh << 'INSTALLEOF'
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
INSTALLEOF

chmod +x ${OUTPUT_DIR}/scripts/install.sh

# Create checksums
echo ""
echo "🔐 Creating file checksums..."
cd ${OUTPUT_DIR}
find . -type f -name "*.tar.gz" -o -name "*.sh" -o -name "*.md" -o -name "*.yml" -o -name "*.yaml" | sort | xargs sha256sum > checksums.txt
cd - > /dev/null

# Create final archive
echo ""
echo "📦 Creating final archive..."
cd ./dist/enterprise
tar -czf ${ARCHIVE_NAME} ${PACKAGE_NAME}
cd - > /dev/null

# Display summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Enterprise package created successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Package: ${ARCHIVE_NAME}"
echo "Size: $(du -h ./dist/enterprise/${ARCHIVE_NAME} | cut -f1)"
echo "Location: ./dist/enterprise/${ARCHIVE_NAME}"
echo ""
echo "Contents:"
echo "  📦 Docker images (API, Web, PostgreSQL, Redis)"
echo "  🚀 Deployment configurations (Docker, Kubernetes)"
echo "  📜 Installation and utility scripts"
echo "  📖 Complete documentation"
echo "  ⚙️  Environment configuration template"
echo "  🔐 File integrity checksums"
echo ""
echo "To distribute:"
echo "  scp ./dist/enterprise/${ARCHIVE_NAME} user@server:/path/to/install/"
echo ""
echo "To install:"
echo "  tar -xzf ${ARCHIVE_NAME}"
echo "  cd ${PACKAGE_NAME}"
echo "  ./scripts/install.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
