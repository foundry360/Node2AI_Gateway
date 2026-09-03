-- Migration: Add environment field to provider_keys table
-- Date: 2025-10-27
-- Description: Adds environment column to track deployment environment for provider keys

-- Add environment column with CHECK constraint
ALTER TABLE provider_keys 
ADD COLUMN environment TEXT DEFAULT 'production' 
CHECK (environment IN ('production', 'staging', 'development'));

-- Migrate existing data from key_metadata JSONB to environment column
UPDATE provider_keys 
SET environment = COALESCE(
    (key_metadata->>'environment')::TEXT,
    'production'
)
WHERE key_metadata IS NOT NULL 
  AND key_metadata ? 'environment';

-- Remove environment from key_metadata to avoid duplication
UPDATE provider_keys 
SET key_metadata = key_metadata - 'environment'
WHERE key_metadata IS NOT NULL 
  AND key_metadata ? 'environment';

-- Add comment for documentation
COMMENT ON COLUMN provider_keys.environment IS 'Deployment environment: production, staging, or development';

