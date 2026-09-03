-- Check if user exists and create if needed
-- Replace the user_id and email with your actual values

-- First, let's see what's in the auth.users table (Supabase Auth)
SELECT id, email, raw_user_meta_data, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- Now check if there's a corresponding record in the users table
SELECT u.id, u.email, u.name, u.role, u.organization_id, u.avatar_url, u.phone, u.username
FROM users u
WHERE u.id IN (
    SELECT id FROM auth.users LIMIT 5
);

-- If your user doesn't exist in the users table, we need to create it
-- First, make sure there's an organization
INSERT INTO organizations (name, deployment_mode, license_tier, is_active)
VALUES ('Default Organization', 'self-hosted', 'standard', true)
ON CONFLICT DO NOTHING
RETURNING id;

-- Then create the user record
-- IMPORTANT: Replace '7b617fd3-a2e3-4066-97f3-530c1bcc6ac0' with your actual user ID
-- and 'your-email@example.com' with your actual email
INSERT INTO users (
    id,
    organization_id,
    email,
    name,
    role,
    is_active
)
SELECT 
    au.id,
    (SELECT id FROM organizations LIMIT 1), -- Gets the first organization
    au.email,
    COALESCE(au.raw_user_meta_data->>'name', au.email), -- Use name from metadata or email
    'admin', -- Give yourself admin role
    true
FROM auth.users au
WHERE au.id = '7b617fd3-a2e3-4066-97f3-530c1bcc6ac0' -- YOUR USER ID HERE
ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, users.name),
    role = EXCLUDED.role,
    updated_at = NOW();

-- Verify the user was created
SELECT u.id, u.email, u.name, u.role, u.organization_id
FROM users u
WHERE u.id = '7b617fd3-a2e3-4066-97f3-530c1bcc6ac0'; -- YOUR USER ID HERE

