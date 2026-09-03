-- Create a trigger to automatically sync auth.users to public.users table
-- This runs whenever a new user signs up via Supabase Auth

-- First, create the function that will be called by the trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_org_id UUID;
BEGIN
  -- Get the first organization (or create one if none exists)
  SELECT id INTO default_org_id FROM public.organizations LIMIT 1;
  
  -- If no organization exists, create a default one
  IF default_org_id IS NULL THEN
    INSERT INTO public.organizations (name, deployment_mode, license_tier, is_active)
    VALUES ('Default Organization', 'self-hosted', 'standard', true)
    RETURNING id INTO default_org_id;
  END IF;

  -- Create the user record in public.users
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
  VALUES (
    NEW.id,
    default_org_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), -- Use name from metadata or email
    'user', -- Default role is 'user', you can change to 'admin' if needed
    true,
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger that calls the function
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verify the trigger was created
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';

-- Test: Show current auth users and corresponding users table records
SELECT 
  au.id,
  au.email,
  au.created_at as auth_created_at,
  u.name,
  u.role,
  u.organization_id
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
ORDER BY au.created_at DESC
LIMIT 5;

