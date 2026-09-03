-- Sync existing auth.users to public.users table
-- This handles users that were created before the trigger was set up

-- First, ensure we have at least one organization
INSERT INTO public.organizations (name, deployment_mode, license_tier, is_active)
VALUES ('Default Organization', 'self-hosted', 'standard', true)
ON CONFLICT DO NOTHING;

-- Now sync all auth.users that don't have a corresponding users record
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
  (SELECT id FROM public.organizations LIMIT 1), -- Use first organization
  au.email,
  COALESCE(au.raw_user_meta_data->>'name', au.email), -- Use name from metadata or email
  'admin', -- Give existing users admin role (change to 'user' if you prefer)
  true,
  au.created_at,
  NOW()
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE u.id IS NULL; -- Only insert if user doesn't already exist

-- Show the results
SELECT 
  au.id,
  au.email,
  au.created_at as auth_created_at,
  u.name,
  u.role,
  u.organization_id,
  o.name as organization_name
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
LEFT JOIN public.organizations o ON u.organization_id = o.id
ORDER BY au.created_at DESC;

