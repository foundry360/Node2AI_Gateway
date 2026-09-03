# Debugging Provider Key Verification

## Issue: Verify Button Not Working

If clicking "Verify" does nothing, follow these steps to diagnose:

### Step 1: Check Browser Console

1. Open browser DevTools (F12 or Cmd+Option+I)
2. Go to **Console** tab
3. Try adding a key and clicking Verify
4. Look for console logs starting with:
   - `handleVerifyKey called`
   - `Calling POST /api/v1/provider-keys`
   - `Provider key created:`
   - `Test response:`

### Step 2: Check What's Happening

**No logs at all?**

- The form might not be submitting
- Check if form validation is blocking submission
- Look for errors in console

**Logs stop after "Calling POST"?**

- Network error or API not responding
- Check Network tab in DevTools
- Look for 401 (auth) or 500 (server) errors

**Test response shows error?**

- API key is invalid
- Provider endpoint is down
- Check the error message

### Step 3: Check Network Tab

1. In DevTools, go to **Network** tab
2. Filter by "Fetch/XHR"
3. Click Verify button
4. Look for these requests:
   - `POST /api/v1/provider-keys`
   - `POST /api/v1/provider-keys/{id}/test`

**Common Issues:**

**401 Unauthorized:**

```
Error: Authorization header missing or invalid
```

**Fix**: Log out and log back in, refresh the page

**404 Not Found:**

```
Error: Provider key not found
```

**Fix**: Check if key was created properly

**500 Server Error:**

```
Error: Failed to verify provider key
```

**Fix**: Check server logs, verify API endpoint is working

### Step 4: Manual Test

Test the API directly with cURL:

```bash
# Get your auth token from browser storage
TOKEN="your-jwt-token-here"

# Create provider key
curl -X POST http://localhost:3001/api/v1/provider-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "apiKey": "sk-test-key",
    "environment": "production"
  }'

# This should return a provider_key with an id

# Test the key (use the id from above)
curl -X POST http://localhost:3001/api/v1/provider-keys/{id}/test \
  -H "Authorization: Bearer $TOKEN"
```

### Step 5: Check Server Logs

Look at API server logs for errors:

- Authentication failures
- Database connection issues
- Provider API errors

### Step 6: Verify Environment

**Required Environment Variables:**

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=your-jwt-secret
PROVIDER_KEY_ENCRYPTION_KEY=your-encryption-key
```

**Check if set:**

```bash
# In your terminal
env | grep DATABASE_URL
env | grep PROVIDER_KEY
```

### Common Solutions

1. **Refresh the page** - Sometimes state gets stuck
2. **Clear browser cache** - Old JavaScript might be cached
3. **Check authentication** - Token might have expired
4. **Verify database** - Make sure provider_keys table exists
5. **Check encryption** - PROVIDER_KEY_ENCRYPTION_KEY must be set

### Still Not Working?

Share these details for debugging:

1. Browser console logs (F12 → Console)
2. Network tab errors (F12 → Network)
3. API server logs
4. Steps to reproduce
5. What provider you're testing
6. Any error messages shown

This will help identify the exact issue.
