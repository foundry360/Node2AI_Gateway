-- Verify Phone Update Setup
-- Run this in Supabase SQL Editor to check if phone updates should work

DO $$
DECLARE
    current_user_id UUID;
BEGIN
    RAISE NOTICE '=== Phone Update Verification ===';
    
    -- 1. Check if phone column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'phone'
    ) THEN
        RAISE NOTICE '✅ Phone column exists in users table';
    ELSE
        RAISE NOTICE '❌ Phone column MISSING in users table';
    END IF;
    
    -- 2. Check current user
    SELECT auth.uid() INTO current_user_id;
    IF current_user_id IS NULL THEN
        RAISE NOTICE '❌ No authenticated user';
    ELSE
        RAISE NOTICE '✅ Authenticated user ID: %', current_user_id;
    END IF;
    
    -- 3. Check RLS policies
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'users' 
        AND policyname LIKE '%update%'
    ) THEN
        RAISE NOTICE '✅ UPDATE policies exist on users table';
        
        -- Show the policies
        RAISE NOTICE '=== Users Table Policies ===';
        PERFORM policyname, cmd FROM pg_policies WHERE tablename = 'users' ORDER BY policyname;
    ELSE
        RAISE NOTICE '❌ No UPDATE policies found on users table';
    END IF;
    
    -- 4. Check current user's phone value
    IF current_user_id IS NOT NULL THEN
        RAISE NOTICE '=== Current User Data ===';
        PERFORM id, email, name, phone FROM users WHERE id = current_user_id;
    END IF;
    
    -- 5. Test if we can update (dry run - won't actually update)
    RAISE NOTICE '=== Checking UPDATE Permission ===';
    RAISE NOTICE 'If you see this message, the check completed.';
    
END $$;

