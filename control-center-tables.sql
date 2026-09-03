-- Minimal Control Center Tables Setup
-- Run this in Supabase SQL Editor to create tables needed for Control Center

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    rate_limit_per_minute INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- Create usage_events table (CRITICAL for Control Center)
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Request details
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    
    -- Token usage
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    
    -- Cost and performance
    cost DECIMAL(10, 6) DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    
    -- Status and errors
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'timeout', 'rate_limited')),
    error_message TEXT,
    error_code TEXT,
    
    -- Compliance fields
    data_sanitized BOOLEAN DEFAULT false,
    sanitization_count INTEGER DEFAULT 0,
    pii_detected BOOLEAN DEFAULT false,
    phi_detected BOOLEAN DEFAULT false,
    
    -- Request metadata
    request_id TEXT,
    ip_address INET,
    user_agent TEXT,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    
    -- Audit fields
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_events_org_timestamp ON usage_events(organization_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_status ON usage_events(status);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events(provider);

-- Insert a default organization
INSERT INTO organizations (id, name) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization')
ON CONFLICT DO NOTHING;

-- Insert test data to see the Control Center in action
INSERT INTO usage_events (
    organization_id,
    provider,
    model,
    endpoint,
    tokens_input,
    tokens_output,
    total_tokens,
    cost,
    latency_ms,
    status,
    data_sanitized,
    sanitization_count,
    pii_detected,
    phi_detected,
    request_id,
    timestamp
) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'openai', 'gpt-4', '/v1/chat/completions', 100, 50, 150, 0.003, 1200, 'success', true, 5, false, true, 'req-001', NOW()),
    ('00000000-0000-0000-0000-000000000001', 'openai', 'gpt-4', '/v1/chat/completions', 150, 75, 225, 0.0045, 1350, 'success', true, 3, true, false, 'req-002', NOW() - INTERVAL '1 minute'),
    ('00000000-0000-0000-0000-000000000001', 'anthropic', 'claude-3', '/v1/messages', 200, 100, 300, 0.006, 1100, 'success', false, 0, false, false, 'req-003', NOW() - INTERVAL '2 minutes'),
    ('00000000-0000-0000-0000-000000000001', 'google', 'gemini', '/v1/models/gemini-pro:generateContent', 80, 40, 120, 0.002, 950, 'success', true, 2, false, false, 'req-004', NOW() - INTERVAL '5 minutes'),
    ('00000000-0000-0000-0000-000000000001', 'openai', 'gpt-4', '/v1/chat/completions', 120, 60, 180, 0.0036, 1450, 'failed', false, 0, false, false, 'req-005', NOW() - INTERVAL '10 minutes')
ON CONFLICT DO NOTHING;

-- Grant permissions (if using RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Success message
SELECT 'Control Center tables created successfully! 🎉' as status;

