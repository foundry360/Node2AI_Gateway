-- Fix infinite recursion in RLS policies
-- Drop ALL policies and create ONE clean, simple set

-- ============================================
-- STEP 1: Drop ALL policies on users table
-- ============================================
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'users'
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- ============================================
-- STEP 2: Create ONE simple, non-recursive policy
-- ============================================
-- This policy allows authenticated users to SELECT their own record
-- It's simple and doesn't cause recursion
CREATE POLICY "users_select_own_simple" ON public.users
    FOR SELECT
    USING (auth.uid()::text = id::text);

-- This policy allows authenticated users to UPDATE their own record
CREATE POLICY "users_update_own_simple" ON public.users
    FOR UPDATE
    USING (auth.uid()::text = id::text)
    WITH CHECK (auth.uid()::text = id::text);

-- ============================================
-- STEP 3: Ensure RLS is enabled
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 4: Grant necessary table-level permissions
-- ============================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.users TO authenticated;

-- ============================================
-- STEP 5: Fix organizations table
-- ============================================
-- Drop all policies on organizations
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'organizations'
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.organizations', pol.policyname);
        RAISE NOTICE 'Dropped org policy: %', pol.policyname;
    END LOOP;
END $$;

-- Create simple policy for organizations (allow all authenticated users to read)
CREATE POLICY "organizations_select_all" ON public.organizations
    FOR SELECT
    USING (true);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.organizations TO authenticated;

-- ============================================
-- STEP 6: Verify policies
-- ============================================
SELECT '=== FINAL POLICIES ===' as section;
SELECT 
    tablename,
    policyname,
    cmd,
    qual as using_expression
FROM pg_policies
WHERE tablename IN ('users', 'organizations')
ORDER BY tablename, policyname;

-- ============================================
-- STEP 7: Test that your user is accessible
-- ============================================
SELECT '=== YOUR USER DATA ===' as section;
SELECT 
    id,
    email,
    name,
    role,
    organization_id
FROM public.users
WHERE id = '7b617fd3-a2e3-4066-97f3-530c1bcc6ac0';

SELECT '✅ SUCCESS! Now hard refresh your browser (Cmd+Shift+R) at http://localhost:3000' as final_step;

