# Environment Field Migration - Summary

## Overview

Added a dedicated `environment` field to the `provider_keys` table to track deployment environment (production, staging, development) as a first-class database column instead of storing it in the JSONB `key_metadata` field.

## Changes Made

### 1. Database Schema Updates

#### Files Modified:

- `supabase-schema.sql`
- `supabase-schema-fixed.sql`
- `deployments/docker/init-db.sql`
- `apps/api/src/lib/db/schema.sql`
- `apps/api/src/lib/db/schema.prisma`

#### Schema Change:

```sql
ALTER TABLE provider_keys
ADD COLUMN environment TEXT DEFAULT 'production'
CHECK (environment IN ('production', 'staging', 'development'));
```

### 2. Migration Script

**File**: `migrations/add_environment_to_provider_keys.sql`

The migration:

- Adds the `environment` column with CHECK constraint
- Migrates existing data from `key_metadata->>'environment'` to the new column
- Removes `environment` from `key_metadata` to avoid duplication
- Includes rollback instructions in `migrations/README.md`

### 3. API Endpoint Updates

**File**: `apps/api/src/app/api/v1/provider-keys/route.ts`

#### GET `/api/v1/provider-keys`

- Now includes `environment` in the response
- Returns `environment` as a top-level field instead of nested in `keyMetadata`

#### POST `/api/v1/provider-keys`

- Accepts `environment` as a separate parameter
- Inserts `environment` directly into the database column
- Defaults to 'production' if not provided

**Request Body Changes**:

```javascript
// Before
{
  provider: 'openai',
  apiKey: 'sk-...',
  keyMetadata: {
    environment: 'production',
    description: '...'
  }
}

// After
{
  provider: 'openai',
  apiKey: 'sk-...',
  environment: 'production',  // Now a top-level field
  keyMetadata: {
    description: '...'
  }
}
```

**Response Changes**:

```javascript
// Response now includes environment at top level
{
  id: '...',
  provider: 'openai',
  environment: 'production',  // New top-level field
  keyMetadata: { description: '...' },
  ...
}
```

### 4. Frontend Updates

**File**: `apps/web/src/app/settings/page.tsx`

#### Form Submission (handleVerifyKey)

- Now sends `environment` as a top-level field in POST request
- Removes `environment` from `keyMetadata` object

#### Display (ModelApiKeysTab)

- Updated to read `environment` from `key.environment` instead of `key.keyMetadata.environment`
- Display logic unchanged (still shows as a badge)

## Benefits

1. **Performance**: Querying by environment is faster with an indexed column vs. JSONB extraction
2. **Type Safety**: Database-level CHECK constraint ensures valid values
3. **Clarity**: Environment is a core property, not metadata
4. **Flexibility**: Can now easily add indexes or foreign keys if needed
5. **Consistency**: Follows SQL best practices for structured data

## Migration Steps

### For Existing Deployments:

1. **Backup your database** (critical!)

   ```bash
   pg_dump -U postgres node2ai > backup_$(date +%Y%m%d).sql
   ```

2. **Run the migration**:
   - **Supabase**: Copy content from `migrations/add_environment_to_provider_keys.sql` into SQL Editor
   - **Local/Docker**:
     ```bash
     psql -U postgres -d node2ai < migrations/add_environment_to_provider_keys.sql
     ```

3. **Deploy updated API code** (includes changes to `route.ts`)

4. **Deploy updated frontend code** (includes changes to `settings/page.tsx`)

5. **Verify migration**:

   ```sql
   -- Check that environment column exists
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'provider_keys' AND column_name = 'environment';

   -- Verify data migration
   SELECT id, provider, environment,
          key_metadata->>'environment' as old_env
   FROM provider_keys;
   ```

## Rollback Plan

If issues arise, see `migrations/README.md` for detailed rollback instructions. In summary:

```sql
-- Move environment back to key_metadata
UPDATE provider_keys
SET key_metadata = jsonb_set(
    COALESCE(key_metadata, '{}'::jsonb),
    '{environment}',
    to_jsonb(environment::text)
)
WHERE environment IS NOT NULL;

-- Drop the column
ALTER TABLE provider_keys DROP COLUMN environment;
```

## Compatibility

- ✅ **Backward Compatible**: Default value ensures existing code works
- ✅ **Zero Downtime**: Migration can run while application is live
- ✅ **Data Preservation**: Existing environment values are migrated automatically
- ⚠️ **API Changes**: Clients using the API directly will see `environment` move from `keyMetadata` to top-level

## Testing Checklist

- [ ] Verify migration runs successfully in staging
- [ ] Test creating new provider keys with different environments
- [ ] Test listing provider keys shows correct environment
- [ ] Test updating provider keys maintains environment
- [ ] Verify UI displays environment correctly
- [ ] Check that old keys have correct environment after migration
- [ ] Validate CHECK constraint rejects invalid values
- [ ] Test API with and without environment parameter

## Notes

- The `environment` field has a DEFAULT value of 'production', so it will never be NULL
- Valid values are restricted by CHECK constraint: 'production', 'staging', 'development'
- Existing data in `key_metadata` will be preserved (minus the environment key)
- This change aligns with SQL normalization best practices
