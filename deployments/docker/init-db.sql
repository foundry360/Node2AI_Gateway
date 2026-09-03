-- Node2AI Database Initialization Script
-- Creates all required tables, indexes, and default data

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- =============================================================================
-- CORE ENTITIES
-- =============================================================================

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    deployment_mode VARCHAR(50) DEFAULT 'self-hosted',
    license_tier VARCHAR(50) DEFAULT 'standard',
    license_key VARCHAR(255),
    license_expires_at TIMESTAMPTZ,
    max_instances INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'viewer',
    password_hash VARCHAR(255),
    sso_id VARCHAR(255),
    sso_provider VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    rate_limit_per_minute INTEGER DEFAULT 1000,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Provider Keys table
CREATE TABLE IF NOT EXISTS provider_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL,
    encrypted_key TEXT NOT NULL,
    environment TEXT DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development')),
    key_metadata JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, provider)
);

-- Usage Events table
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost DECIMAL(10,6) DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'success',
    error_message TEXT,
    data_sanitized BOOLEAN DEFAULT false,
    sanitization_count INTEGER DEFAULT 0,
    request_id VARCHAR(255),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- Token Mappings table
CREATE TABLE IF NOT EXISTS token_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    token_type VARCHAR(100) NOT NULL,
    token VARCHAR(255) NOT NULL,
    encrypted_original_value TEXT NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.0,
    category VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(organization_id, session_id, token)
);

-- Curated Sources table
CREATE TABLE IF NOT EXISTS curated_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector Embeddings table
CREATE TABLE IF NOT EXISTS vector_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES curated_sources(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536),
    chunk_index INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    severity VARCHAR(20) DEFAULT 'info',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Integrations table
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    sync_status VARCHAR(50) DEFAULT 'idle',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integration Events table
CREATE TABLE IF NOT EXISTS integration_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    details JSONB,
    error_message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Organizations indexes
CREATE INDEX IF NOT EXISTS idx_organizations_deployment_mode ON organizations(deployment_mode);
CREATE INDEX IF NOT EXISTS idx_organizations_license_tier ON organizations(license_tier);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

-- API Keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used_at ON api_keys(last_used_at);

-- Provider Keys indexes
CREATE INDEX IF NOT EXISTS idx_provider_keys_organization_id ON provider_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_provider_keys_provider ON provider_keys(provider);
CREATE INDEX IF NOT EXISTS idx_provider_keys_is_active ON provider_keys(is_active);

-- Usage Events indexes
CREATE INDEX IF NOT EXISTS idx_usage_events_organization_id ON usage_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_id ON usage_events(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events(provider);
CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events(model);
CREATE INDEX IF NOT EXISTS idx_usage_events_status ON usage_events(status);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_data_sanitized ON usage_events(data_sanitized);
CREATE INDEX IF NOT EXISTS idx_usage_events_cost ON usage_events(cost);

-- Token Mappings indexes
CREATE INDEX IF NOT EXISTS idx_token_mappings_organization_id ON token_mappings(organization_id);
CREATE INDEX IF NOT EXISTS idx_token_mappings_session_id ON token_mappings(session_id);
CREATE INDEX IF NOT EXISTS idx_token_mappings_token ON token_mappings(token);
CREATE INDEX IF NOT EXISTS idx_token_mappings_expires_at ON token_mappings(expires_at);
CREATE INDEX IF NOT EXISTS idx_token_mappings_token_type ON token_mappings(token_type);
CREATE INDEX IF NOT EXISTS idx_token_mappings_category ON token_mappings(category);

-- Curated Sources indexes
CREATE INDEX IF NOT EXISTS idx_curated_sources_organization_id ON curated_sources(organization_id);
CREATE INDEX IF NOT EXISTS idx_curated_sources_source_type ON curated_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_curated_sources_status ON curated_sources(status);
CREATE INDEX IF NOT EXISTS idx_curated_sources_created_at ON curated_sources(created_at);

-- Vector Embeddings indexes
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_source_id ON vector_embeddings(source_id);
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_created_at ON vector_embeddings(created_at);
-- Vector similarity search index
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_embedding ON vector_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Audit Logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- Integrations indexes
CREATE INDEX IF NOT EXISTS idx_integrations_organization_id ON integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);
CREATE INDEX IF NOT EXISTS idx_integrations_is_active ON integrations(is_active);
CREATE INDEX IF NOT EXISTS idx_integrations_sync_status ON integrations(sync_status);

-- Integration Events indexes
CREATE INDEX IF NOT EXISTS idx_integration_events_integration_id ON integration_events(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_event_type ON integration_events(event_type);
CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status);
CREATE INDEX IF NOT EXISTS idx_integration_events_timestamp ON integration_events(timestamp);

-- =============================================================================
-- DEFAULT DATA
-- =============================================================================

-- Insert default organization
INSERT INTO organizations (id, name, deployment_mode, license_tier, is_active)
VALUES ('default-org', 'Default Organization', 'self-hosted', 'enterprise', true)
ON CONFLICT (id) DO NOTHING;

-- Insert default admin user
INSERT INTO users (id, organization_id, email, name, role, password_hash, is_active)
VALUES (
    'admin-user-123',
    'default-org',
    'admin@node2.ai',
    'Administrator',
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/8KzK8K2', -- 'admin123'
    true
)
ON CONFLICT (organization_id, email) DO NOTHING;

-- Insert default API key for testing
INSERT INTO api_keys (id, organization_id, name, key_hash, rate_limit_per_minute, is_active, created_by)
VALUES (
    'default-api-key-123',
    'default-org',
    'Default API Key',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/8KzK8K2', -- 'test-api-key-123'
    1000,
    true,
    'admin-user-123'
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_keys_updated_at BEFORE UPDATE ON provider_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_curated_sources_updated_at BEFORE UPDATE ON curated_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate API key hash
CREATE OR REPLACE FUNCTION generate_api_key_hash(api_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(api_key, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to validate API key
CREATE OR REPLACE FUNCTION validate_api_key(api_key TEXT, org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    key_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM api_keys 
        WHERE key_hash = generate_api_key_hash(api_key) 
        AND organization_id = org_id 
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO key_exists;
    
    RETURN key_exists;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Insert sample usage events for analytics
INSERT INTO usage_events (organization_id, api_key_id, user_id, provider, model, tokens_input, tokens_output, cost, latency_ms, status, data_sanitized, timestamp)
VALUES 
    ('default-org', 'default-api-key-123', 'admin-user-123', 'openai', 'gpt-4', 150, 200, 0.012, 1200, 'success', true, NOW() - INTERVAL '1 day'),
    ('default-org', 'default-api-key-123', 'admin-user-123', 'anthropic', 'claude-3-sonnet', 200, 180, 0.008, 950, 'success', true, NOW() - INTERVAL '2 days'),
    ('default-org', 'default-api-key-123', 'admin-user-123', 'openai', 'gpt-3.5-turbo', 100, 120, 0.003, 800, 'success', false, NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

-- Insert sample audit logs
INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, details, severity, timestamp)
VALUES 
    ('default-org', 'admin-user-123', 'login', 'user', 'admin-user-123', '{"ip": "127.0.0.1", "user_agent": "Node2AI/1.0"}', 'info', NOW()),
    ('default-org', 'admin-user-123', 'api_key_created', 'api_key', 'default-api-key-123', '{"name": "Default API Key"}', 'info', NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify tables were created
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('organizations', 'users', 'api_keys', 'provider_keys', 'usage_events', 'token_mappings', 'curated_sources', 'vector_embeddings', 'audit_logs', 'integrations', 'integration_events');
    
    IF table_count = 11 THEN
        RAISE NOTICE 'All tables created successfully';
    ELSE
        RAISE EXCEPTION 'Expected 11 tables, found %', table_count;
    END IF;
END $$;

-- Verify default data
DO $$
DECLARE
    org_count INTEGER;
    user_count INTEGER;
    api_key_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations WHERE id = 'default-org';
    SELECT COUNT(*) INTO user_count FROM users WHERE email = 'admin@node2.ai';
    SELECT COUNT(*) INTO api_key_count FROM api_keys WHERE organization_id = 'default-org';
    
    IF org_count = 1 AND user_count = 1 AND api_key_count = 1 THEN
        RAISE NOTICE 'Default data inserted successfully';
    ELSE
        RAISE EXCEPTION 'Default data insertion failed';
    END IF;
END $$;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Node2AI database initialization completed successfully!';
    RAISE NOTICE 'Default organization: default-org';
    RAISE NOTICE 'Default admin user: admin@node2.ai';
    RAISE NOTICE 'Default API key: test-api-key-123';
END $$;