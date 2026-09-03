# Setup Control Center Database Tables

The Control Center API endpoints are now ready to query real data from the database, but you need to create the tables first.

## Option 1: Apply the Full Schema

If you want the complete schema, run the `supabase-schema.sql` file against your PostgreSQL database:

```bash
psql "$DATABASE_URL" -f supabase-schema.sql
```

## Option 2: Create Minimal Tables for Control Center

If you only want the tables needed for the Control Center, run this SQL in PostgreSQL:

```sql
-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create users table (if not exists)
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

-- Create api_keys table (if not exists)
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

    -- Token usage
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,

    -- Cost and performance
    cost DECIMAL(10, 6) DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,

    -- Status and errors
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout', 'rate_limited')),
    error_message TEXT,

    -- Compliance fields
    data_sanitized BOOLEAN DEFAULT false,
    sanitization_count INTEGER DEFAULT 0,

    -- Request metadata
    request_id TEXT,

    -- Audit fields
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_events_org_timestamp ON usage_events(organization_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_status ON usage_events(status);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp DESC);

-- Insert a default organization
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security (optional, for multi-tenancy)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
```

## Verify the Setup

After running the SQL, verify the tables were created:

```sql
-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see:

- organizations
- users
- api_keys
- usage_events
- And any other tables from the full schema

## Add Test Data (Optional)

If you want to see the Control Center with some test data:

```sql
-- Insert a test usage event
INSERT INTO usage_events (
    organization_id,
    provider,
    model,
    tokens_input,
    tokens_output,
    cost,
    latency_ms,
    status,
    data_sanitized,
    sanitization_count,
    request_id
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'openai',
    'gpt-4',
    100,
    50,
    0.003,
    1200,
    'success',
    true,
    5,
    'test-req-001'
);

-- Add a few more test events
INSERT INTO usage_events (
    organization_id,
    provider,
    model,
    tokens_input,
    tokens_output,
    cost,
    latency_ms,
    status,
    request_id,
    timestamp
) VALUES
    ('00000000-0000-0000-0000-000000000001', 'openai', 'gpt-4', 150, 75, 0.0045, 1350, 'success', 'req-002', NOW() - INTERVAL '1 minute'),
    ('00000000-0000-0000-0000-000000000001', 'anthropic', 'claude-3', 200, 100, 0.006, 1100, 'success', 'req-003', NOW() - INTERVAL '2 minutes'),
    ('00000000-0000-0000-0000-000000000001', 'google', 'gemini', 80, 40, 0.002, 950, 'success', 'req-004', NOW() - INTERVAL '5 minutes'),
    ('00000000-0000-0000-0000-000000000001', 'openai', 'gpt-4', 120, 60, 0.0036, 1450, 'error', 'req-005', NOW() - INTERVAL '10 minutes')
;
```

## Next Steps

Once the tables are created:

1. The Control Center will automatically start showing real data
2. As you use the API, new entries will appear in `usage_events`
3. All metrics will be calculated from actual database data
4. The dashboard will update every 5 seconds with live data

## Troubleshooting

If you get "relation does not exist" errors:

1. Check that you're connected to the correct database
2. Verify the `usage_events` table exists: `\dt usage_events` (in psql)
3. Check that organization data exists: `SELECT * FROM organizations;`
4. Make sure the PostgreSQL connection string is set in your `.env` files (`DATABASE_URL`)
