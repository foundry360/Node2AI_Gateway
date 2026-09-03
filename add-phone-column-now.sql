-- Add phone column to users table (FORCE)
-- This will work even if the column already exists

-- Add phone column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- Add username column (while we're at it)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username VARCHAR(100);

-- Add avatar_url column (while we're at it)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create unique index on username if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'users' AND indexname = 'users_username_key'
    ) THEN
        CREATE UNIQUE INDEX users_username_key ON public.users(username) WHERE username IS NOT NULL;
    END IF;
END $$;

-- RELOAD SCHEMA CACHE (Very important!)
NOTIFY pgrst, 'reload schema';

-- Wait a moment
SELECT pg_sleep(2);

-- Verify all columns now exist
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('phone', 'username', 'avatar_url')
ORDER BY column_name;

-- Show success message
SELECT '✅ All profile columns added and schema reloaded!' as status;

