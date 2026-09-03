-- =============================================================================
-- Node2AI Complete PostgreSQL Schema for AWS RDS
-- =============================================================================
-- This migration creates a COMPLETE schema that matches what the application
-- code expects. It is idempotent and can be run multiple times safely.
-- 
-- Compatible with: AWS RDS PostgreSQL 15+
-- NOT compatible with: Supabase (no RLS, no auth.uid(), no Supabase-specific features)
-- =============================================================================

-- =============================================================================
-- ENABLE EXTENSIONS
-- =============================================================================

-- Note: pgvector may not be available on all RDS instances
-- The application will work without it, but RAG features will be disabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Try to enable pgvector (will fail gracefully if not available)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pgvector extension not available. RAG features will be disabled.';
END $$;

-- =============================================================================
-- CREATE ENUM TYPES
-- =============================================================================

DO $$ 
BEGIN
    -- User type enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_type') THEN
        CREATE TYPE user_type AS ENUM ('admin', 'end_user');
    END IF;
    
    -- User status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
    END IF;
    
    -- Audit severity enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_severity') THEN
        CREATE TYPE audit_severity AS ENUM ('info', 'warning', 'error', 'critical');
    END IF;
    
    -- Audit event type enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_event_type') THEN
        CREATE TYPE audit_event_type AS ENUM (
            -- AI Interactions
            'ai_chat_created',
            'ai_chat_message_sent',
            'ai_chat_message_received',
            'ai_model_switched',
            'ai_prompt_modified',
            -- User Management
            'user_created',
            'user_updated',
            'user_deleted',
            'user_suspended',
            'user_reactivated',
            'user_login',
            'user_logout',
            -- Configuration
            'api_key_created',
            'api_key_revoked',
            'settings_updated',
            'permissions_changed',
            -- Data Operations
            'conversation_exported',
            'conversation_deleted',
            'data_imported',
            'data_exported',
            -- System Events
            'budget_threshold_reached',
            'rate_limit_exceeded',
            'error_occurred'
        );
    END IF;
END $$;

-- =============================================================================
-- ORGANIZATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    deployment_mode VARCHAR(20) NOT NULL DEFAULT 'self-hosted' 
        CHECK (deployment_mode IN ('self-hosted', 'airgap')),
    license_tier VARCHAR(20) NOT NULL DEFAULT 'standard' 
        CHECK (license_tier IN ('standard', 'enterprise', 'airgap')),
    license_key TEXT,
    license_expires_at TIMESTAMP WITH TIME ZONE,
    max_instances INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_deployment_mode ON organizations(deployment_mode);
CREATE INDEX IF NOT EXISTS idx_organizations_license_tier ON organizations(license_tier);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);

-- =============================================================================
-- ORGANIZATION SETTINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    monthly_budget DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id)
);

-- =============================================================================
-- CUSTOMERS TABLE (for unified auth system)
-- =============================================================================

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    auth_config JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    subscription_tier VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_organization_id ON customers(organization_id);

-- Migrate existing organizations to customers if they don't exist
INSERT INTO customers (id, name, subscription_tier, status, organization_id, created_at, updated_at)
SELECT 
    id,
    name,
    license_tier,
    CASE WHEN is_active THEN 'active' ELSE 'suspended' END,
    id,
    created_at,
    updated_at
FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- =============================================================================
-- USERS TABLE (COMPLETE with all expected columns)
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Organization relationship (required)
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Basic user info (required)
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' 
        CHECK (role IN ('admin', 'developer', 'viewer', 'user')),
    
    -- Authentication fields
    password_hash VARCHAR(255),
    sso_id VARCHAR(255),
    sso_provider VARCHAR(50),
    supabase_user_id UUID, -- For Supabase integration (nullable)
    
    -- Unified auth fields (from migration 005)
    external_id VARCHAR(255), -- User ID from external auth system
    auth_provider VARCHAR(50) DEFAULT 'supabase', -- supabase, oauth, jwt, saml, etc
    user_type user_type DEFAULT 'admin',
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    full_name VARCHAR(255), -- Maps from name
    status user_status DEFAULT 'active',
    
    -- Profile fields (from migrations)
    avatar_url TEXT,
    phone VARCHAR(20),
    display_name VARCHAR(255),
    department VARCHAR(255),
    
    -- Status and timestamps
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    UNIQUE(organization_id, email),
    UNIQUE(external_id, auth_provider)
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id ON users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_external_id_auth_provider ON users(external_id, auth_provider);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- =============================================================================
-- API KEYS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 1000,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used_at ON api_keys(last_used_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys(created_by);

-- =============================================================================
-- PROVIDER KEYS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS provider_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    encrypted_key TEXT NOT NULL,
    environment VARCHAR(50) DEFAULT 'production',
    key_metadata JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, provider, environment)
);

CREATE INDEX IF NOT EXISTS idx_provider_keys_organization_id ON provider_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_provider_keys_provider ON provider_keys(provider);
CREATE INDEX IF NOT EXISTS idx_provider_keys_is_active ON provider_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_provider_keys_environment ON provider_keys(environment);

-- =============================================================================
-- USAGE EVENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'success' 
        CHECK (status IN ('success', 'error')),
    error_message TEXT,
    data_sanitized BOOLEAN NOT NULL DEFAULT false,
    sanitization_count INTEGER NOT NULL DEFAULT 0,
    request_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_usage_events_organization_id ON usage_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_id ON usage_events(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events(provider);
CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events(model);
CREATE INDEX IF NOT EXISTS idx_usage_events_status ON usage_events(status);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_data_sanitized ON usage_events(data_sanitized);
CREATE INDEX IF NOT EXISTS idx_usage_events_cost ON usage_events(cost);

-- =============================================================================
-- TOKEN MAPPINGS TABLE (for data sanitization)
-- =============================================================================

CREATE TABLE IF NOT EXISTS token_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    token_type VARCHAR(50) NOT NULL,
    token VARCHAR(255) NOT NULL,
    encrypted_original_value TEXT NOT NULL,
    confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.0,
    category VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
    UNIQUE(organization_id, session_id, token)
);

CREATE INDEX IF NOT EXISTS idx_token_mappings_organization_id ON token_mappings(organization_id);
CREATE INDEX IF NOT EXISTS idx_token_mappings_session_id ON token_mappings(session_id);
CREATE INDEX IF NOT EXISTS idx_token_mappings_token ON token_mappings(token);
CREATE INDEX IF NOT EXISTS idx_token_mappings_expires_at ON token_mappings(expires_at);
CREATE INDEX IF NOT EXISTS idx_token_mappings_token_type ON token_mappings(token_type);
CREATE INDEX IF NOT EXISTS idx_token_mappings_category ON token_mappings(category);

-- =============================================================================
-- SESSIONS TABLE (for unified auth)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    refresh_token_hash VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active) WHERE active = true;

-- =============================================================================
-- AUDIT LOGS TABLE (legacy, kept for backward compatibility)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    severity VARCHAR(20) DEFAULT 'info',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- =============================================================================
-- AUDIT EVENTS TABLE (unified audit system - CRITICAL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE, -- REQUIRED
    actor_email VARCHAR(255),
    actor_name VARCHAR(255),
    
    -- What
    event_type audit_event_type NOT NULL,
    event_category VARCHAR(50) NOT NULL,
    severity audit_severity DEFAULT 'info',
    
    -- Where
    resource_type VARCHAR(100),
    resource_id UUID,
    
    -- How
    action VARCHAR(100) NOT NULL,
    method VARCHAR(10),
    endpoint VARCHAR(255),
    
    -- Context
    description TEXT,
    changes JSONB,
    metadata JSONB DEFAULT '{}',
    
    -- AI-Specific
    ai_model VARCHAR(100),
    ai_provider VARCHAR(50),
    tokens_used INTEGER,
    cost_usd DECIMAL(10, 4),
    
    -- Technical
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    
    -- Status
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit_events (critical for performance)
CREATE INDEX IF NOT EXISTS idx_audit_events_customer_id ON audit_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_session ON audit_events(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_request ON audit_events(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events(severity);
CREATE INDEX IF NOT EXISTS idx_audit_events_success ON audit_events(success) WHERE success = false;

-- =============================================================================
-- AI REQUESTS TABLE (for compliance tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    application_id UUID,
    endpoint VARCHAR(255),
    http_method VARCHAR(10),
    ip_address INET,
    user_agent TEXT,
    provider VARCHAR(50),
    model VARCHAR(255),
    deployment_mode VARCHAR(50),
    input_message_count INTEGER DEFAULT 0,
    input_token_count INTEGER DEFAULT 0,
    input_character_count INTEGER DEFAULT 0,
    input_hash VARCHAR(64),
    sanitization_enabled BOOLEAN DEFAULT true,
    pii_detected_count INTEGER DEFAULT 0,
    phi_detected_count INTEGER DEFAULT 0,
    sanitization_types JSONB,
    sanitization_duration_ms INTEGER,
    output_token_count INTEGER,
    output_character_count INTEGER,
    output_hash VARCHAR(64),
    finish_reason VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    http_status_code INTEGER,
    error_type VARCHAR(50),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    cost_usd DECIMAL(10, 6),
    cost_input_usd DECIMAL(10, 6),
    cost_output_usd DECIMAL(10, 6),
    pricing_tier VARCHAR(50),
    queue_time_ms INTEGER,
    ai_provider_time_ms INTEGER,
    desanitization_time_ms INTEGER,
    compliance_flags JSONB,
    retention_policy VARCHAR(50),
    audit_reviewed BOOLEAN DEFAULT false,
    audit_reviewed_by UUID REFERENCES users(id),
    audit_reviewed_at TIMESTAMP WITH TIME ZONE,
    request_metadata JSONB,
    response_metadata JSONB,
    tags TEXT[],
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_organization_created ON ai_requests(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_created ON ai_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_status_created ON ai_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_provider_model_created ON ai_requests(provider, model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_sanitization ON ai_requests(sanitization_enabled, pii_detected_count);

-- =============================================================================
-- CONVERSATION SESSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    title TEXT,
    message_count INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_usd DECIMAL(10, 6) DEFAULT 0,
    context_metadata JSONB,
    tags TEXT[],
    status VARCHAR(50) DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_org_created ON conversation_sessions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_activity ON conversation_sessions(user_id, last_activity_at DESC);

-- =============================================================================
-- CUSTOMER API KEYS TABLE (for unified auth)
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    name VARCHAR(255),
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20),
    active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_api_keys_customer ON customer_api_keys(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_api_keys_hash ON customer_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_customer_api_keys_active ON customer_api_keys(active) WHERE active = true;

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_organizations_updated_at') THEN
        CREATE TRIGGER update_organizations_updated_at 
        BEFORE UPDATE ON organizations
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_provider_keys_updated_at') THEN
        CREATE TRIGGER update_provider_keys_updated_at 
        BEFORE UPDATE ON provider_keys
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_customers_updated_at') THEN
        CREATE TRIGGER update_customers_updated_at 
        BEFORE UPDATE ON customers
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversation_sessions_updated_at') THEN
        CREATE TRIGGER update_conversation_sessions_updated_at 
        BEFORE UPDATE ON conversation_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- =============================================================================
-- VERIFICATION & SUMMARY
-- =============================================================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE';
    
    SELECT COUNT(*) INTO index_count 
    FROM pg_indexes 
    WHERE schemaname = 'public';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Node2AI Schema Migration Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created: %', table_count;
    RAISE NOTICE 'Indexes created: %', index_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Key tables:';
    RAISE NOTICE '  - organizations';
    RAISE NOTICE '  - users (with all expected columns)';
    RAISE NOTICE '  - customers';
    RAISE NOTICE '  - sessions';
    RAISE NOTICE '  - audit_events (customer_id REQUIRED)';
    RAISE NOTICE '  - api_keys';
    RAISE NOTICE '  - provider_keys';
    RAISE NOTICE '';
    RAISE NOTICE 'Schema is ready for AWS RDS deployment!';
    RAISE NOTICE '========================================';
END $$;

