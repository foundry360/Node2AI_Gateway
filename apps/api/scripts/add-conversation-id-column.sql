-- Migration script to add conversation_id column to usage_events table
-- This allows tracking costs per conversation per model

-- Add conversation_id column (nullable initially for backward compatibility)
-- Note: Foreign key constraint commented out until conversation_sessions table exists
ALTER TABLE usage_events 
ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- Create index for faster queries by conversation
CREATE INDEX IF NOT EXISTS idx_usage_events_conversation_id 
ON usage_events(conversation_id);

-- Create composite index for conversation + model queries
CREATE INDEX IF NOT EXISTS idx_usage_events_conversation_model 
ON usage_events(conversation_id, model) 
WHERE conversation_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN usage_events.conversation_id IS 'Links usage events to conversation sessions for per-conversation cost tracking';

