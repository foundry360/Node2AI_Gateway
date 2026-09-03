-- Add profile fields to users table for General Settings
-- avatar_url: Base64 encoded image or URL
-- phone: Phone number

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Add index on phone for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

