-- Simple script to reload Supabase schema cache and verify phone column

-- 1. RELOAD SCHEMA CACHE (This is the important part!)
NOTIFY pgrst, 'reload schema';

-- Give it a moment
SELECT pg_sleep(2);

-- 2. Verify phone column exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'phone'
        ) THEN '✅ Phone column exists'
        ELSE '❌ Phone column missing'
    END as phone_column_status;

-- 3. Show current user
SELECT 
    CASE 
        WHEN auth.uid() IS NULL THEN '❌ No authenticated user'
        ELSE '✅ User: ' || auth.uid()::text
    END as auth_status;

-- 4. Show RLS policies on users table
SELECT 
    '📋 RLS Policy: ' || policyname || ' (' || cmd || ')' as policy_info
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- 5. Show your current data
SELECT 
    id,
    email,
    name,
    phone,
    username,
    avatar_url
FROM users 
WHERE id = auth.uid();

SELECT '🎉 Schema reloaded! Now try updating your phone number in the app.' as final_message;

