# Restart API Server to Fix Provider Keys Error

## Quick Fix

The issue has been fixed in the code. You just need to restart your API server to pick up the changes.

### Steps:

1. **Stop your API server** (Ctrl+C in the terminal where it's running)

2. **Start it again:**

   ```bash
   pnpm --filter @node2/api dev
   ```

3. **Try adding a provider key again** via the UI

4. **Check the API logs** - you should now see:
   ```
   Getting organization ID from database...
   Organizations query result: { data: [...], error: null }
   Organization ID retrieved: <your-org-id>
   ```

This should fix the 500 error and allow you to add provider keys successfully.
