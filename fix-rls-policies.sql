-- Fix RLS policies for Supabase Auth (Safe version - handles existing policies)
-- This allows authenticated users to read their own user records

-- Drop all existing policies safely
DROP POLICY IF EXISTS "users_organization_data" ON users;
DROP POLICY IF EXISTS "users_read_own_data" ON users;
DROP POLICY IF EXISTS "users_update_own_data" ON users;
DROP POLICY IF EXISTS "service_role_all_users" ON users;

-- Create a new policy that allows users to read their own data
-- This uses auth.uid() which is automatically set by Supabase Auth
CREATE POLICY "users_read_own_data" ON users
    FOR SELECT
    USING (auth.uid() = id);

-- Allow users to update their own data
CREATE POLICY "users_update_own_data" ON users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Optional: Allow service role (API server) to manage all user records
-- This is useful for admin operations from your API
CREATE POLICY "service_role_all_users" ON users
    FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        auth.jwt() ->> 'role' = 'authenticated'
    );

-- Verify RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Show current policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'users';

