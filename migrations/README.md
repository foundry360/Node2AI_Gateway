# Database Migrations

This directory contains database migration scripts for the Node2AI platform.

## Running Migrations

### Supabase (Hosted)

1. Log in to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the migration SQL from the desired migration file
4. Run the migration

### Local/Docker PostgreSQL

```bash
# Connect to your database
psql -U postgres -d node2ai

# Run the migration
\i migrations/add_environment_to_provider_keys.sql
```

### Using Docker Compose

```bash
# If running in Docker
docker exec -i node2-postgres psql -U postgres -d node2ai < migrations/add_environment_to_provider_keys.sql
```

## Available Migrations

### add_environment_to_provider_keys.sql

**Date**: 2025-10-27

**Description**: Adds a dedicated `environment` column to the `provider_keys` table to track deployment environment (production, staging, development) separately from the JSONB metadata field.

**Changes**:

- Adds `environment` TEXT column with CHECK constraint
- Migrates existing environment data from `key_metadata` JSONB to new column
- Removes environment from `key_metadata` to avoid duplication
- Sets default value to 'production'

**Rollback**: If you need to rollback this migration:

```sql
-- Move environment back to key_metadata
UPDATE provider_keys
SET key_metadata = jsonb_set(
    COALESCE(key_metadata, '{}'::jsonb),
    '{environment}',
    to_jsonb(environment::text)
)
WHERE environment IS NOT NULL;

-- Drop the environment column
ALTER TABLE provider_keys DROP COLUMN environment;
```

## Notes

- Always backup your database before running migrations
- Test migrations in a staging environment first
- Migrations are designed to be idempotent where possible
- Check application code compatibility after schema changes
