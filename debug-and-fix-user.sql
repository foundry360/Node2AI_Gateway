-- Debug and fix user sync issue
-- This script will show what's happening and fix it

-- Step 1: Check if auth.users has your user
SELECT 'Auth Users:' as step;
SELECT id, email, created_at, raw_user_meta_data
FROM auth.users
ORDER BY created_at DESC;

-- Step 2: Check if organizations exist
SELECT 'Organizations:' as step;
SELECT id, name, created_at
FROM public.organizations;

-- Step 3: Check if users table has records
SELECT 'Users Table:' as step;
SELECT id, email, name, role, organization_id
FROM public.users;

-- Step 4: Create organization if it doesn't exist (disable RLS temporarily)
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;
INSERT INTO public.organizations (id, name, deployment_mode, license_tier, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'self-hosted', 'standard', true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Step 5: Disable RLS on users table temporarily to insert
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Step 6: Insert/Update your user (using UPSERT)
INSERT INTO public.users (
  id,
  organization_id,
  email,
  name,
  role,
  is_active,
  created_at,
  updated_at
)
SELECT 
  au.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  au.email,
  COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  'admin',
  true,
  au.created_at,
  NOW()
FROM auth.users au
WHERE au.id = '7b617fd3-a2e3-4066-97f3-530c1bcc6ac0' -- YOUR USER ID
ON CONFLICT (id) 
DO UPDATE SET
  name = COALESCE(EXCLUDED.name, public.users.name),
  role = EXCLUDED.role,
  organization_id = EXCLUDED.organization_id,
  updated_at = NOW();

-- Step 7: Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 8: Verify the sync worked
SELECT 'Final Check - Auth + Users:' as step;
SELECT 
  au.id,
  au.email as auth_email,
  u.email as users_email,
  u.name,
  u.role,
  u.organization_id,
  o.name as organization_name
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
LEFT JOIN public.organizations o ON u.organization_id = o.id
WHERE au.id = '7b617fd3-a2e3-4066-97f3-530c1bcc6ac0';

