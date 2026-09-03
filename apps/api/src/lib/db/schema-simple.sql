-- Node2AI PostgreSQL Database Schema (Simplified - without pgvector)
-- This schema replaces Supabase for license keys and application data
-- Authentication still uses Supabase

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- =============================================================================
-- CORE ENTITIES
-- =============================================================================

-- Organizations (single-tenant in self-hosted mode)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    deployment_mode VARCHAR(20) NOT NULL DEFAULT 'self-hosted' CHECK (deployment_mode IN ('self-hosted', 'airgap')),
    license_tier VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (license_tier IN ('standard', 'enterprise', 'airgap')),
    license_key TEXT, -- Encrypted license key
    license_expires_at TIMESTAMP WITH TIME ZONE,
    max_instances INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Users (customer's IT/business team) - references Supabase auth.users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'developer', 'viewer', 'user')),
    supabase_user_id UUID, -- Reference to Supabase auth.users.id
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

-- API Keys (for customer's applications to call gateway)
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE, -- SHA-256 hash of the actual key
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 1000,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Provider Keys (customer's BYOK - encrypted)
CREATE TABLE provider_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'perplexity', 'local')),
    encrypted_key TEXT NOT NULL, -- Encrypted using customer's encryption key
    environment TEXT DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development')),
    key_metadata JSONB, -- Additional provider-specific metadata
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, provider)
);

-- Usage Events (track every API call)
CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
    error_message TEXT,
    data_sanitized BOOLEAN NOT NULL DEFAULT false,
    sanitization_count INTEGER NOT NULL DEFAULT 0,
    request_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB
);

-- Token Mappings (for data sanitization - CRITICAL)
CREATE TABLE token_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    token_type VARCHAR(50) NOT NULL, -- PERSON, SSN, MRN, EMAIL, etc.
    token VARCHAR(255) NOT NULL, -- e.g., [PERSON_001]
    encrypted_original_value TEXT NOT NULL,
    confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.0, -- 0.00 to 1.00
    category VARCHAR(50) NOT NULL, -- PII, PHI, FINANCIAL, GOVERNMENT
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
    UNIQUE(organization_id, session_id, token)
);

-- Curated Sources (RAG/Knowledge base)
CREATE TABLE curated_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('pdf', 'docx', 'txt', 'html', 'markdown', 'json')),
    storage_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'ready', 'error')),
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Audit Logs (compliance - NEVER delete)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- API_CALL, CONFIG_CHANGE, LICENSE_CHECK, etc.
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Integrations (ServiceNow, Slack, etc.)
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('servicenow', 'slack', 'webhook', 'salesforce', 'teams')),
    name VARCHAR(255) NOT NULL,
    config JSONB NOT NULL, -- Encrypted credentials and settings
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Integration Events (track integration actions)
CREATE TABLE integration_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    details JSONB,
    error_message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Organization indexes
CREATE INDEX idx_organizations_deployment_mode ON organizations(deployment_mode);
CREATE INDEX idx_organizations_license_tier ON organizations(license_tier));
CREATE INDEX idx_organizations_active ON organizations(is_active);

-- User indexes
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_last_login ON users(last_login_at);
CREATE INDEX idx_users_supabase_user_id ON users(supabase_user_id);

-- API Key indexes
CREATE INDEX idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX idx_api_keys_last_used ON api_keys(last_used_at);

-- Provider Key indexes
CREATE INDEX idx_provider_keys_organization_id ON provider_keys(organization_id);
CREATE INDEX idx_provider_keys_provider ON provider_keys(provider);
CREATE INDEX idx_provider_keys_active ON provider_keys(is_active);

-- Usage Events indexes
CREATE INDEX idx_usage_events_organization_id ON usage_events(organization_id);
CREATE INDEX idx_usage_events_api_key_id ON usage_events(api_key_id);
CREATE INDEX idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX idx_usage_events_provider ON usage_events(provider);
CREATE INDEX idx_usage_events_model ON usage_events(model);
CREATE INDEX idx_usage_events_status ON usage_events(status);
CREATE INDEX idx_usage_events_timestamp ON usage_events(timestamp);
CREATE INDEX idx_usage_events_sanitized ON usage_events(data_sanitized);
CREATE INDEX idx_usage_events_cost ON usage_events(cost);

-- Token Mappings indexes
CREATE INDEX idx_token_mappings_organization_id ON token_mappings(organization_id);
CREATE INDEX idx_token_mappings_session_id ON token_mappings(session_id);
CREATE INDEX idx_token_mappings_token ON token_mappings(token);
CREATE INDEX idx_token_mappings_expires_at ON token_mappings(expires_at);
CREATE INDEX idx_token_mappings_type ON token_mappings(token_type);
CREATE INDEX idx_token_mappings_category ON token_mappings(category);

-- Curated Sources indexes
CREATE INDEX idx_curated_sources_organization_id ON curated_sources(organization_id);
CREATE INDEX idx_curated_sources_type ON curated_sources(source_type);
CREATE INDEX idx_curated_sources_status ON curated_sources(status);
CREATE INDEX idx_curated_sources_created_at ON curated_sources(created_at);

-- Audit Logs indexes
CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);

-- Integration indexes
CREATE INDEX idx_integrations_organization_id ON integrations(organization_id);
CREATE INDEX idx_integrations_type ON integrations(type);
CREATE INDEX idx_integrations_active ON integrations(is_active);
CREATE INDEX idx_integrations_sync_status ON integrations(sync_status);

-- Integration Events indexes
CREATE INDEX idx_integration_events_integration_id ON integration_events(integration_id);
CREATE INDEX idx_integration_events_type ON integration_events(event_type);
CREATE INDEX idx_integration_events_status ON integration_events(status);
CREATE INDEX idx_integration_events_timestamp ON integration_events(timestamp);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to clean up expired token mappings
CREATE OR REPLACE FUNCTION cleanup_expired_token_mappings()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM token_mappings 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update organization updated_at timestamp
CREATE OR REPLACE FUNCTION update_organization_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update user updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update provider key updated_at timestamp
CREATE OR REPLACE FUNCTION update_provider_key_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update curated source updated_at timestamp
CREATE OR REPLACE FUNCTION update_curated_source_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update integration updated_at timestamp
CREATE OR REPLACE FUNCTION update_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update timestamps
CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_organization_updated_at();

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_user_updated_at();

CREATE TRIGGER trigger_provider_keys_updated_at
    BEFORE UPDATE ON provider_keys
    FOR EACH ROW EXECUTE FUNCTION update_provider_key_updated_at();

CREATE TRIGGER trigger_curated_sources_updated_at
    BEFORE UPDATE ON curated_sources
    FOR EACH ROW EXECUTE FUNCTION update_curated_source_updated_at();

CREATE TRIGGER trigger_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION update_integration_updated_at();

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Create default organization for self-hosted deployment
INSERT INTO organizations (id, name, deployment_mode, license_tier, max_instances)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default Organization',
    'self-hosted',
    'enterprise',
    1
);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE organizations IS 'Organizations using Node2AI (single-tenant in self-hosted mode)';
COMMENT ON TABLE users IS 'Users within each organization - references Supabase auth.users';
COMMENT ON TABLE api_keys IS 'API keys for customer applications to call the gateway';
COMMENT ON TABLE provider_keys IS 'Customer BYOK (Bring Your Own Key) for AI providers';
COMMENT ON TABLE usage_events IS 'Track every API call for billing and analytics';
COMMENT ON TABLE token_mappings IS 'Critical: Maps sanitized tokens back to original values for data sanitization';
COMMENT ON TABLE curated_sources IS 'Documents uploaded for RAG/knowledge base';
COMMENT ON TABLE audit_logs IS 'Compliance audit trail (7-year retention, never delete)';
COMMENT ON TABLE integrations IS 'Third-party integrations (ServiceNow, Slack, etc.)';
COMMENT ON TABLE integration_events IS 'Track integration actions and sync status';

COMMENT ON COLUMN token_mappings.encrypted_original_value IS 'Original sensitive value encrypted with customer key';
COMMENT ON COLUMN token_mappings.expires_at IS 'Auto-expires after 1 hour for security';
COMMENT ON COLUMN users.supabase_user_id IS 'Reference to Supabase auth.users.id';
COMMENT ON COLUMN usage_events.data_sanitized IS 'Whether input/output data was sanitized';
COMMENT ON COLUMN usage_events.sanitization_count IS 'Number of PII/PHI elements detected and sanitized';
COMMENT ON COLUMN audit_logs.details IS 'JSONB containing detailed audit information';
COMMENT ON COLUMN integrations.config IS 'Encrypted credentials and configuration';

