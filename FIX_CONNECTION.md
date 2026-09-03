# Fix: "localhost not connecting"

## The Issue

Your web app at http://localhost:3000 is trying to call API routes, but the API server isn't running on port 3001.

## Quick Fix (Choose One)

### Option 1: Start Both Servers

Open TWO terminal windows:

**Terminal 1 - API Server:**

```bash
cd /Users/jasongelsomino/Projects/Node2/apps/api
pnpm dev
```

**Terminal 2 - Web App:**

```bash
cd /Users/jasongelsomino/Projects/Node2/apps/web
pnpm dev
```

Then visit: http://localhost:3000

### Option 2: Use the Startup Script

From the project root:

```bash
./START_SERVERS.sh
```

This starts both servers automatically.

### Option 3: Make Web App Work Alone (Fastest)

The web app will work with mock data if you just start it:

```bash
cd apps/web
pnpm dev
```

The UI will be fully functional, it just won't connect to a database yet.

## Verify What's Running

Check if ports are in use:

```bash
lsof -i :3000  # Should show Next.js web app
lsof -i :3001  # Should show Next.js API server
```

## What Should You See?

✅ **Success**: Dashboard loads at http://localhost:3000  
✅ **API Working**: Visit http://localhost:3001/api/health  
✅ **Stats Working**: Visit http://localhost:3001/api/v1/dashboard/stats

❌ **Failed to Connect**: API server not running  
❌ **Cannot GET /api/v1/dashboard/stats**: Wrong port or not started

## Next Steps

Once both servers are running:

1. Visit http://localhost:3000
2. You should see the dashboard with data
3. If you see errors, check browser console (F12)

## Still Not Working?

Check:

1. Are both terminals showing "✓ Ready" messages?
2. Any errors in the terminal output?
3. Try visiting http://localhost:3001/api/health manually

If the API health check works, the web app should connect to it.
