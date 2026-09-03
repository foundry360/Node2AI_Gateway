-- Add display_name field to users table
-- This is separate from 'name' field - display_name is what shows in the UI
-- while 'name' is the full name

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

-- Update existing rows to use name as display_name if display_name is null
UPDATE users 
SET display_name = name 
WHERE display_name IS NULL;

