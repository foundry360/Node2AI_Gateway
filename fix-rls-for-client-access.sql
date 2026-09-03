-- Fix RLS policies to allow authenticated users to read from client
-- The current policies aren't working from the Supabase client

-- Step 1: Drop all existing policies on users table
DROP POLICY IF EXISTS "users_organization_data" ON public.users;
DROP POLICY IF EXISTS "users_read_own_data" ON public.users;
DROP POLICY IF EXISTS "users_update_own_data" ON public.users;
DROP POLICY IF EXISTS "service_role_all_users" ON public.users;

-- Step 2: Create a simple, permissive policy for authenticated users
-- Allow any authenticated user to SELECT their own user record
CREATE POLICY "authenticated_users_select_own" ON public.users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Allow any authenticated user to UPDATE their own user record
CREATE POLICY "authenticated_users_update_own" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Step 3: Make sure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 4: Grant necessary permissions to authenticated role
GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE ON public.users TO authenticated;

-- Also grant access to organizations table
DROP POLICY IF EXISTS "organizations_own_data" ON public.organizations;

CREATE POLICY "authenticated_read_organizations" ON public.organizations
    FOR SELECT
    TO authenticated
    USING (true);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.organizations TO authenticated;

-- Step 5: Verify policies are created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('users', 'organizations')
ORDER BY tablename, policyname;

-- Step 6: Verify your user exists and is accessible
SELECT 
    '✅ Your user record:' as status,
    u.id,
    u.email,
    u.name,
    u.role,
    u.organization_id
FROM public.users u
WHERE u.id = '7b617fd3-a2e3-4066-97f3-530c1bcc6ac0';

SELECT 'Now refresh your browser at http://localhost:3000 to see your name!' as next_step;

