# Quick Start - Fix "Can't Connect" Issue

## The Problem

The dashboard can't connect because the API server isn't running or the native PostgreSQL connection isn't configured.

## Quick Fix Options

### Option 1: Run Web UI Only (Quick Visual Check)

The dashboard will show default mock data and the UI will work:

```bash
# Start web app only
cd apps/web
pnpm dev
```

Visit: http://localhost:3000

The dashboard will use default numbers and the UI will be fully functional.

### Option 2: Full Stack Setup (API + Web)

1. **Start API server:**

```bash
cd apps/api
pnpm dev
```

2. **Start web app (in another terminal):**

```bash
cd apps/web
pnpm dev
```

3. **Set up environment variables:**

For API server (`apps/api/env.example` → `.env.local`):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/node2ai_dev"
JWT_SECRET="generate-a-secret"
API_KEY_SECRET="dev-api-key"
```

For web app (`apps/web/env.example` → `.env.local`):

```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### Option 3: Test API Routes

Check if API is responding:

```bash
# Test API health
curl http://localhost:3001/api/health

# Test dashboard stats
curl http://localhost:3001/api/v1/dashboard/stats
```

## Verify What's Running

```bash
# Check if processes are running
lsof -i :3000  # Web app
lsof -i :3001  # API server
```

## Common Errors

### "No organization found"

- Run: `cd apps/api && pnpm db:seed`

### "Connection refused"

- Make sure API server is running on port 3001

### "Module not found"

- Run: `pnpm install` in both apps/web and apps/api

## Recommended: Start with Option 1

Just run the web app for now - the UI works with mock data!
