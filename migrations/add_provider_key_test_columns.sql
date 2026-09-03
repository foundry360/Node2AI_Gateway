-- Migration: Add test columns to provider_keys table
-- This migration adds columns for tracking key verification tests

-- Add columns if they don't exist
DO $$
BEGIN
    -- Add last_tested_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'provider_keys' 
        AND column_name = 'last_tested_at'
    ) THEN
        ALTER TABLE provider_keys 
        ADD COLUMN last_tested_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add last_test_status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'provider_keys' 
        AND column_name = 'last_test_status'
    ) THEN
        ALTER TABLE provider_keys 
        ADD COLUMN last_test_status VARCHAR(20) CHECK (last_test_status IN ('success', 'failed'));
    END IF;

    -- Add last_test_error column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'provider_keys' 
        AND column_name = 'last_test_error'
    ) THEN
        ALTER TABLE provider_keys 
        ADD COLUMN last_test_error TEXT;
    END IF;

    -- Update the provider check constraint to include 'perplexity'
    ALTER TABLE provider_keys 
    DROP CONSTRAINT IF EXISTS provider_keys_provider_check;
    
    ALTER TABLE provider_keys 
    ADD CONSTRAINT provider_keys_provider_check 
    CHECK (provider IN ('openai', 'anthropic', 'google', 'local', 'perplexity'));
    
    RAISE NOTICE 'Test columns added to provider_keys table successfully';
END $$;

