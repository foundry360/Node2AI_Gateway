-- Complete debugging check to see what's configured
-- Run this and share ALL the output

-- 1. Check if user exists
SELECT '=== 1. USER DATA ===' as section;
SELECT 
    id,
    email,
    name,
    role,
    organization_id,
    is_active,
    avatar_url,
    phone,
    username
FROM public.users
WHERE id = '7b617fd3-a2e3-4066-97f3-530c1bcc6ac0';

-- 2. Check RLS status on users table
SELECT '=== 2. RLS STATUS ===' as section;
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('users', 'organizations');

-- 3. Check all policies on users table
SELECT '=== 3. POLICIES ON USERS TABLE ===' as section;
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_expression,
    with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- 4. Check grants on users table
SELECT '=== 4. GRANTS ON USERS TABLE ===' as section;
SELECT 
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
AND table_name = 'users'
ORDER BY grantee, privilege_type;

-- 5. Check if authenticated role exists
SELECT '=== 5. ROLES ===' as section;
SELECT rolname
FROM pg_roles
WHERE rolname IN ('authenticated', 'anon', 'service_role')
ORDER BY rolname;

-- 6. Test a simple SELECT as if you were the authenticated user
-- This won't work perfectly from SQL editor but shows the structure
SELECT '=== 6. CURRENT SESSION INFO ===' as section;
SELECT 
    current_user as current_database_user,
    session_user,
    inet_client_addr() as client_ip;

