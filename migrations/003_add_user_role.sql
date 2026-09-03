-- Migration: Add 'user' role to users table
-- Date: 2025-10-29
-- Description: Adds 'user' as a valid role option in addition to 'admin', 'developer', and 'viewer'

-- Drop existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add new constraint with 'user' role included
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'developer', 'viewer', 'user'));

-- Note: This migration is idempotent - it's safe to run multiple times

