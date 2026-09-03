-- Run this in your Supabase SQL Editor to fix user creation
-- This disables the problematic audit trigger

-- Disable audit trigger on users table
ALTER TABLE users DISABLE TRIGGER audit_users_trigger;

-- If you want to add the missing columns instead:
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Then re-enable the trigger
ALTER TABLE users ENABLE TRIGGER audit_users_trigger;

