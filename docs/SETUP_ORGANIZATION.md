# Setup Organization - Fix 500 Error

## The Problem

You're getting a **500 Internal Server Error** when trying to add provider keys because there's no organization in your database.

## Quick Fix - Run This SQL

Go to your **Supabase Dashboard** → **SQL Editor** and run this:

```sql
-- Create a default organization
INSERT INTO organizations (
  id,
  name,
  subscription_tier,
  subscription_status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Organization',
  'trial',
  'active',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Add test columns to provider_keys table (if missing)
DO $$
BEGIN
    -- Add last_tested_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'provider_keys'
        AND column_name = 'last_tested_at'
    ) THEN
        ALTER TABLE provider_keys
        ADD COLUMN last_tested_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add last_test_status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'provider_keys'
        AND column_name = 'last_test_status'
    ) THEN
        ALTER TABLE provider_keys
        ADD COLUMN last_test_status VARCHAR(20) CHECK (last_test_status IN ('success', 'failed'));
    END IF;

    -- Add last_test_error
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'provider_keys'
        AND column_name = 'last_test_error'
    ) THEN
        ALTER TABLE provider_keys
        ADD COLUMN last_test_error TEXT;
    END IF;

    -- Update provider constraint to include perplexity
    ALTER TABLE provider_keys
    DROP CONSTRAINT IF EXISTS provider_keys_provider_check;

    ALTER TABLE provider_keys
    ADD CONSTRAINT provider_keys_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'google', 'local', 'perplexity'));
END $$;
```

## Verify It Worked

Run this query:

```sql
SELECT * FROM organizations;
```

You should see at least one organization.

## Try Again

After running the SQL:

1. Refresh your browser
2. Go to **Settings** → **API Keys**
3. Click **+ Add Provider Key**
4. Fill in the form and click **Verify**

It should work now! ✅

## Still Not Working?

1. Check API server logs for specific errors
2. Verify Supabase credentials are correct
3. Make sure provider_keys table exists
4. Share the error message from the API logs
