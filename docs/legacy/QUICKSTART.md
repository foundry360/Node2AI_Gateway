# Node2AI Quick Start Guide

## Get Started in 10 Minutes

This guide will get Node2AI running on your local machine in under 10 minutes.

### Prerequisites Check

```bash
# Verify you have these installed:
docker --version        # Need: 20.10+
docker-compose --version # Need: 2.0+
node --version          # Need: 18+
pnpm --version          # Need: 8+
```

If missing, install from:

- **Docker**: https://docs.docker.com/get-docker/
- **Node.js**: https://nodejs.org/
- **pnpm**: `npm install -g pnpm`

---

## Step 1: Clone & Setup (2 minutes)

```bash
# Clone the repository
git clone https://github.com/foundry360/node2ai.git
cd node2ai

# Copy environment template
cp env.example .env

# Generate secure keys
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "PROVIDER_KEY_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "SESSION_SECRET=$(openssl rand -base64 32)" >> .env
```

**What this does:**

- Downloads Node2AI source code
- Creates your local configuration file
- Generates secure encryption keys for your installation

---

## Step 2: Start Services (3 minutes)

```bash
# Start all services with Docker Compose
docker-compose -f deployments/docker/docker-compose.yml up -d

# Wait for database to be ready (30 seconds)
echo "Waiting for database..."
sleep 30

# Check services are running
docker-compose -f deployments/docker/docker-compose.yml ps

# You should see:
# - postgres (healthy)
# - redis (healthy)
# - api (healthy)
# - web (healthy)
```

**What this does:**

- Starts PostgreSQL database
- Starts Redis cache
- Starts Node2AI API server
- Starts Node2AI web interface
- All services run in Docker containers

---

## Step 3: Initialize Database (1 minute)

```bash
# Seed initial data (creates default users)
docker-compose -f deployments/docker/docker-compose.yml exec api pnpm run seed

# Expected output:
# ✓ Created default organization
# ✓ Created 4 users (admin, developer, viewer, auditor)
# ✓ Created 3 API keys
# ✓ Created sample data
```

**What this does:**

- Creates database tables
- Adds default users with different roles
- Generates test API keys
- Sets up sample data for testing

---

## Step 4: Login (1 minute)

```bash
# Open Node2AI in your browser
open http://localhost:3000

# Or manually navigate to:
# http://localhost:3000
```

**Login with default credentials:**

- **Email:** `admin@node2ai.ai`
- **Password:** `admin123`

⚠️ **IMPORTANT**: Change this password immediately!

- Click your profile (top right)
- Settings → Security → Change Password

---

## Step 5: Add Your First AI Provider Key (3 minutes)

### Get an OpenAI API Key (easiest to start with)

1. Go to https://platform.openai.com/api-keys
2. Sign in or create account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-proj-`)
5. Set up billing: https://platform.openai.com/account/billing

### Add Key to Node2AI

1. In Node2AI: **Settings → Provider Keys**
2. Click **"Add Provider Key"**
3. Select **"OpenAI"**
4. Paste your API key
5. Add metadata:
   - **Name:** "My OpenAI Key"
   - **Model:** "gpt-4"
   - **Environment:** "development"
6. Click **"Test Connection"** (should show ✅)
7. Click **"Add Provider Key"**

---

## Step 6: Send Your First Message! 🎉

### Option 1: Via Web Interface

1. Click **"New Chat"** in sidebar
2. Type: **"Explain what Node2AI does"**
3. Press **Enter**
4. Watch the AI respond!

### Option 2: Via API

```bash
curl -X POST http://localhost:3001/api/v1/chat \
  -H "X-API-Key: test-api-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, World!",
    "provider": "openai",
    "model": "gpt-4"
  }'
```

**Expected response:**

```json
{
  "success": true,
  "data": {
    "message": "Hello! I'm an AI assistant...",
    "usage": {
      "totalTokens": 25
    },
    "cost": {
      "amount": 0.00075
    }
  }
}
```

---

## Next Steps

### Explore Features

- ✅ Try different AI providers (add Anthropic, Google, Perplexity)
- ✅ Compare models side-by-side
- ✅ Check usage analytics (Settings → Analytics)
- ✅ Create more users (Settings → Users)
- ✅ Generate API keys (Settings → API Keys)
- ✅ Review audit logs (Settings → Audit Logs)

### Secure Your Installation

- ✅ Change all default passwords
- ✅ Enable MFA (Settings → Security)
- ✅ Review user roles
- ✅ Set up spending alerts
- ✅ Configure backup schedule

### Learn More

- 📖 [Full Installation Guide](./INSTALLATION.md) - Detailed setup
- 🔑 [Provider Keys Guide](./PROVIDER-KEYS.md) - Managing AI provider keys
- 🔒 [Security Best Practices](./SECURITY.md) - Production hardening
- 📚 [API Documentation](./API.md) - Integrate with your apps
- ❓ [FAQ](./FAQ.md) - Common questions

---

## Common First-Time Issues

### Issue: Services won't start

```bash
# Check ports are available
sudo lsof -i :3000
sudo lsof -i :3001
sudo lsof -i :5432

# If ports in use, stop conflicting services or change ports
# Edit deployments/docker/docker-compose.yml
```

**Solution:** Stop conflicting services or change ports in `docker-compose.yml`

### Issue: Can't login

```bash
# Verify services are healthy
docker-compose -f deployments/docker/docker-compose.yml ps

# Check API is responding
curl http://localhost:3001/api/health

# Verify database was seeded
docker-compose -f deployments/docker/docker-compose.yml exec postgres \
  psql -U node2ai -d node2ai -c "SELECT COUNT(*) FROM users;"
# Should return: 4
```

**Solution:** Ensure all services are healthy and database was seeded

### Issue: Provider key test fails

```bash
# Test key manually with OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_OPENAI_KEY"

# If this works but Node2AI test fails:
# 1. Check PROVIDER_KEY_ENCRYPTION_KEY is set (32 hex chars)
# 2. Restart API: docker-compose restart api
# 3. Try adding key again
```

**Solution:** Verify your OpenAI key works directly, then check Node2AI encryption key

---

## Video Tutorial

**Watch: Node2AI in 10 Minutes**
[Embed video or link]

- Installation walkthrough
- Adding first provider key
- Sending first message
- Exploring features

---

## Quick Command Reference

```bash
# Start services
docker-compose -f deployments/docker/docker-compose.yml up -d

# Stop services
docker-compose -f deployments/docker/docker-compose.yml down

# View logs
docker-compose -f deployments/docker/docker-compose.yml logs -f

# Restart services
docker-compose -f deployments/docker/docker-compose.yml restart

# Check status
docker-compose -f deployments/docker/docker-compose.yml ps

# Backup database
docker-compose -f deployments/docker/docker-compose.yml exec postgres \
  pg_dump -U node2ai node2ai > backup.sql

# Run tests
pnpm run test:auth
pnpm run test:provider-keys

# Update Node2AI
git pull origin main
pnpm install
docker-compose -f deployments/docker/docker-compose.yml restart
```

---

## Getting Help

### Stuck? We're here to help!

- 💬 **Community Forum:** https://community.foundry360.com
- 📖 **Documentation:** https://docs.foundry360.com/node2ai
- 🐛 **Report Bug:** https://github.com/foundry360/node2ai/issues
- 📧 **Email:** support@foundry360.com
- 💭 **Discord:** https://discord.gg/node2ai

### Before asking for help, try:

1. Check the [FAQ](./FAQ.md)
2. Search existing GitHub issues
3. Run: `./scripts/test-installation.sh`
4. Check logs: `docker-compose logs`

---

## Progress Checklist

- [ ] Prerequisites installed (Docker, Node.js, pnpm)
- [ ] Repository cloned and configured
- [ ] Services started and healthy
- [ ] Database initialized with seed data
- [ ] Successfully logged in to web interface
- [ ] Added first AI provider key
- [ ] Sent first message successfully
- [ ] Changed default password
- [ ] Explored analytics dashboard
- [ ] Created additional users (optional)

---

## Congratulations! 🎉

You've successfully set up Node2AI! Start exploring and building with multiple AI providers through a single, unified platform.

**What's Next?**

- Add more AI providers for comparison
- Integrate with your applications using the API
- Set up production deployment
- Explore advanced features like prompt sanitization
- Join our community for tips and support

---

**Last updated:** January 2024  
**Version:** 1.0.0
