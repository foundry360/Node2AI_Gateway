-- Node2AI PostgreSQL Database Schema
-- Self-hosted AI gateway with data sanitization and compliance features
-- Supports pgvector extension for RAG capabilities

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
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

-- Organization Settings (budget, preferences, etc.)
CREATE TABLE organization_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    monthly_budget DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id)
);

-- Users (customer's IT/business team)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'developer', 'viewer')),
    password_hash VARCHAR(255), -- For local auth
    sso_id VARCHAR(255), -- For SSO integration
    sso_provider VARCHAR(50), -- google, microsoft, okta, auth0
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
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'local')),
    encrypted_key TEXT NOT NULL, -- Encrypted using customer's encryption key
    environment TEXT DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development')),
    key_metadata JSONB, -- Additional provider-specific metadata
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, provider)
);

-- Usage Events (track every API call) - Partitioned by month
CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL,
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
) PARTITION BY RANGE (timestamp);

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

-- Vector Embeddings (for RAG - requires pgvector)
CREATE TABLE vector_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES curated_sources(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL, -- OpenAI ada-002 dimensions
    chunk_index INTEGER NOT NULL DEFAULT 0,
    metadata JSONB, -- page number, section, etc.
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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

-- Conversation Sessions (for AI interactions)
CREATE TABLE conversation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255),
    message_count INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE
);

-- =============================================================================
-- AI GOVERNANCE TABLES
-- =============================================================================

-- AI Models & Providers
CREATE TABLE ai_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    model_version VARCHAR(100),
    
    -- Model Characteristics
    capabilities JSONB,
    context_window INTEGER,
    max_output_tokens INTEGER,
    
    -- Governance Metadata
    approved_for_use BOOLEAN DEFAULT FALSE,
    approval_date TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(id),
    
    risk_classification VARCHAR(50),
    allowed_use_cases TEXT[],
    prohibited_use_cases TEXT[],
    
    -- Regulatory Info
    regulatory_status VARCHAR(50),
    fda_cleared BOOLEAN DEFAULT FALSE,
    ce_marked BOOLEAN DEFAULT FALSE,
    
    -- Training Data Governance
    training_data_cutoff DATE,
    training_data_sources TEXT[],
    known_biases JSONB,
    fairness_audit_date DATE,
    fairness_audit_results JSONB,
    
    -- Performance Metrics
    accuracy_rate DECIMAL(5, 4),
    hallucination_rate DECIMAL(5, 4),
    bias_score DECIMAL(5, 4),
    
    -- Cost & Usage
    cost_per_input_token DECIMAL(10, 8),
    cost_per_output_token DECIMAL(10, 8),
    
    -- Lifecycle
    status VARCHAR(50) DEFAULT 'active',
    sunset_date DATE,
    replacement_model_id UUID REFERENCES ai_models(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Governance Policies
CREATE TABLE ai_governance_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Policy Details
    policy_name VARCHAR(255) NOT NULL,
    policy_version VARCHAR(50) NOT NULL,
    policy_type VARCHAR(100) NOT NULL,
    
    policy_document TEXT,
    policy_document_url VARCHAR(500),
    
    -- Scope
    applies_to_roles TEXT[],
    applies_to_departments TEXT[],
    applies_to_models TEXT[],
    
    -- Enforcement
    enforcement_level VARCHAR(50),
    violation_action VARCHAR(100),
    
    -- Approval Chain
    created_by UUID REFERENCES users(id),
    approved_by UUID[] DEFAULT '{}',
    approval_required_from TEXT[],
    
    effective_date DATE NOT NULL,
    expiration_date DATE,
    review_frequency_days INTEGER,
    last_review_date DATE,
    next_review_date DATE,
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Interactions (Full Content for Operations)
CREATE TABLE ai_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Context
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL,
    
    -- Request Details (FULL CONTENT)
    user_prompt TEXT NOT NULL,
    sanitized_prompt TEXT,
    system_prompt TEXT,
    
    -- AI Response (FULL CONTENT)
    ai_response TEXT NOT NULL,
    
    -- Model Info
    ai_provider VARCHAR(50) NOT NULL,
    ai_model VARCHAR(255) NOT NULL,
    model_parameters JSONB,
    
    -- Governance Compliance
    policy_compliance_checks JSONB,
    governance_flags JSONB,
    human_review_required BOOLEAN DEFAULT FALSE,
    human_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id),
    review_notes TEXT,
    
    -- Content Analysis
    content_moderation_results JSONB,
    sentiment_analysis JSONB,
    toxicity_score DECIMAL(5, 4),
    
    -- Quality Metrics
    response_quality_score DECIMAL(5, 4),
    hallucination_detected BOOLEAN DEFAULT FALSE,
    factual_accuracy_verified BOOLEAN,
    
    -- Usage Metrics
    tokens_input INTEGER,
    tokens_output INTEGER,
    tokens_total INTEGER,
    cost_usd DECIMAL(10, 6),
    processing_time_ms INTEGER,
    
    -- Blockchain Link
    blockchain_tx_id VARCHAR(255),
    blockchain_verified BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Human Oversight & Review
CREATE TABLE ai_human_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interaction_id UUID NOT NULL REFERENCES ai_interactions(id) ON DELETE CASCADE,
    
    -- Review Details
    reviewer_id UUID NOT NULL REFERENCES users(id),
    reviewer_role VARCHAR(100),
    
    review_reason VARCHAR(100),
    review_type VARCHAR(50),
    
    -- Review Results
    approved BOOLEAN,
    concerns_raised BOOLEAN DEFAULT FALSE,
    concern_details TEXT,
    
    accuracy_rating INTEGER CHECK (accuracy_rating BETWEEN 1 AND 5),
    appropriateness_rating INTEGER CHECK (appropriateness_rating BETWEEN 1 AND 5),
    safety_rating INTEGER CHECK (safety_rating BETWEEN 1 AND 5),
    
    corrective_action_taken BOOLEAN DEFAULT FALSE,
    corrective_action_details TEXT,
    
    notes TEXT,
    
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Ethics & Bias Tracking
CREATE TABLE ai_bias_incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interaction_id UUID REFERENCES ai_interactions(id) ON DELETE SET NULL,
    
    -- Incident Details
    bias_type VARCHAR(100),
    severity VARCHAR(50),
    
    detected_by VARCHAR(100),
    detection_method VARCHAR(100),
    
    description TEXT,
    affected_population VARCHAR(255),
    
    -- Response
    mitigation_action TEXT,
    model_retrained BOOLEAN DEFAULT FALSE,
    prompt_engineering_updated BOOLEAN DEFAULT FALSE,
    
    status VARCHAR(50) DEFAULT 'open',
    
    reported_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Explainability & Transparency
CREATE TABLE ai_explanations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interaction_id UUID NOT NULL REFERENCES ai_interactions(id) ON DELETE CASCADE,
    
    -- Explainability Data
    explanation_method VARCHAR(100),
    
    reasoning_steps JSONB,
    confidence_scores JSONB,
    
    sources_cited JSONB,
    knowledge_cutoff DATE,
    
    alternative_responses JSONB,
    
    -- User Understanding
    user_requested_explanation BOOLEAN DEFAULT FALSE,
    user_understood BOOLEAN,
    user_feedback TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Governance Audits
CREATE TABLE ai_governance_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Audit Details
    audit_type VARCHAR(100),
    audit_scope VARCHAR(100),
    
    auditor_name VARCHAR(255),
    auditor_organization VARCHAR(255),
    
    audit_period_start DATE,
    audit_period_end DATE,
    
    -- Findings
    findings JSONB,
    
    compliance_score DECIMAL(5, 2),
    issues_identified INTEGER,
    critical_issues INTEGER,
    high_issues INTEGER,
    medium_issues INTEGER,
    low_issues INTEGER,
    
    -- Status
    status VARCHAR(50),
    passed BOOLEAN,
    
    report_url VARCHAR(500),
    
    conducted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- AI Model Performance Tracking
CREATE TABLE ai_model_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
    
    -- Time Period
    measurement_date DATE NOT NULL,
    measurement_period VARCHAR(50),
    
    -- Performance Metrics
    total_requests INTEGER,
    successful_requests INTEGER,
    failed_requests INTEGER,
    error_rate DECIMAL(5, 4),
    
    avg_response_time_ms INTEGER,
    p95_response_time_ms INTEGER,
    p99_response_time_ms INTEGER,
    
    -- Quality Metrics
    avg_quality_score DECIMAL(5, 4),
    hallucination_rate DECIMAL(5, 4),
    user_satisfaction_score DECIMAL(5, 4),
    
    human_override_rate DECIMAL(5, 4),
    
    -- Cost Metrics
    total_cost_usd DECIMAL(10, 2),
    avg_cost_per_request DECIMAL(10, 6),
    
    -- Drift Detection
    prediction_drift_score DECIMAL(5, 4),
    concept_drift_detected BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data Lineage & Provenance
CREATE TABLE ai_data_lineage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interaction_id UUID NOT NULL REFERENCES ai_interactions(id) ON DELETE CASCADE,
    
    -- Input Data Sources
    input_data_sources JSONB,
    external_data_accessed BOOLEAN DEFAULT FALSE,
    external_sources JSONB,
    
    -- Data Transformations
    transformations_applied JSONB,
    
    -- Output Destination
    output_destinations JSONB,
    
    -- Governance
    data_retention_policy_id UUID REFERENCES ai_governance_policies(id),
    retention_expiry_date DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- PARTITIONING FOR USAGE_EVENTS
-- =============================================================================

-- Create monthly partitions for usage_events
-- This will be managed by a function that creates partitions automatically

-- Example partition for current month (will be created by migration script)
CREATE TABLE usage_events_2024_01 PARTITION OF usage_events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Organization indexes
CREATE INDEX idx_organizations_deployment_mode ON organizations(deployment_mode);
CREATE INDEX idx_organizations_license_tier ON organizations(license_tier);
CREATE INDEX idx_organizations_active ON organizations(is_active);

-- User indexes
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_last_login ON users(last_login_at);

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

-- Usage Events indexes (on partitioned table)
CREATE INDEX idx_usage_events_organization_id ON usage_events(organization_id);
CREATE INDEX idx_usage_events_api_key_id ON usage_events(api_key_id);
CREATE INDEX idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX idx_usage_events_conversation_id ON usage_events(conversation_id);
CREATE INDEX idx_usage_events_provider ON usage_events(provider);
CREATE INDEX idx_usage_events_model ON usage_events(model);
CREATE INDEX idx_usage_events_conversation_model ON usage_events(conversation_id, model);
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

-- Vector Embeddings indexes
CREATE INDEX idx_vector_embeddings_source_id ON vector_embeddings(source_id);
CREATE INDEX idx_vector_embeddings_created_at ON vector_embeddings(created_at);

-- Vector similarity search index (IVFFlat)
CREATE INDEX idx_vector_embeddings_embedding_cosine ON vector_embeddings 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Alternative HNSW index for better performance (if supported)
-- CREATE INDEX idx_vector_embeddings_embedding_hnsw ON vector_embeddings 
--     USING hnsw (embedding vector_cosine_ops);

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

-- Conversation Sessions indexes
CREATE INDEX idx_conversation_sessions_organization_id ON conversation_sessions(organization_id);
CREATE INDEX idx_conversation_sessions_user_id ON conversation_sessions(user_id);
CREATE INDEX idx_conversation_sessions_session_id ON conversation_sessions(session_id);

-- AI Models indexes
CREATE INDEX idx_ai_models_provider ON ai_models(provider);
CREATE INDEX idx_ai_models_approved ON ai_models(approved_for_use);
CREATE INDEX idx_ai_models_status ON ai_models(status);
CREATE INDEX idx_ai_models_model_name ON ai_models(model_name);

-- AI Governance Policies indexes
CREATE INDEX idx_governance_policies_org ON ai_governance_policies(organization_id);
CREATE INDEX idx_governance_policies_type ON ai_governance_policies(policy_type);
CREATE INDEX idx_governance_policies_active ON ai_governance_policies(is_active);
CREATE INDEX idx_governance_policies_effective_date ON ai_governance_policies(effective_date);

-- AI Interactions indexes
CREATE INDEX idx_ai_interactions_user ON ai_interactions(user_id);
CREATE INDEX idx_ai_interactions_org ON ai_interactions(organization_id);
CREATE INDEX idx_ai_interactions_model ON ai_interactions(ai_provider, ai_model);
CREATE INDEX idx_ai_interactions_review ON ai_interactions(human_review_required);
CREATE INDEX idx_ai_interactions_blockchain ON ai_interactions(blockchain_tx_id);
CREATE INDEX idx_ai_interactions_request_id ON ai_interactions(request_id);
CREATE INDEX idx_ai_interactions_conversation ON ai_interactions(conversation_id);
CREATE INDEX idx_ai_interactions_created_at ON ai_interactions(created_at);

-- Human Reviews indexes
CREATE INDEX idx_human_reviews_interaction ON ai_human_reviews(interaction_id);
CREATE INDEX idx_human_reviews_reviewer ON ai_human_reviews(reviewer_id);
CREATE INDEX idx_human_reviews_approved ON ai_human_reviews(approved);
CREATE INDEX idx_human_reviews_reviewed_at ON ai_human_reviews(reviewed_at);

-- Bias Incidents indexes
CREATE INDEX idx_bias_incidents_type ON ai_bias_incidents(bias_type);
CREATE INDEX idx_bias_incidents_severity ON ai_bias_incidents(severity);
CREATE INDEX idx_bias_incidents_status ON ai_bias_incidents(status);
CREATE INDEX idx_bias_incidents_interaction ON ai_bias_incidents(interaction_id);

-- Explanations indexes
CREATE INDEX idx_explanations_interaction ON ai_explanations(interaction_id);

-- Governance Audits indexes
CREATE INDEX idx_governance_audits_org ON ai_governance_audits(organization_id);
CREATE INDEX idx_governance_audits_type ON ai_governance_audits(audit_type);
CREATE INDEX idx_governance_audits_status ON ai_governance_audits(status);
CREATE INDEX idx_governance_audits_period ON ai_governance_audits(audit_period_start, audit_period_end);

-- Model Performance indexes
CREATE INDEX idx_model_performance_model ON ai_model_performance(model_id);
CREATE INDEX idx_model_performance_date ON ai_model_performance(measurement_date DESC);

-- Data Lineage indexes
CREATE INDEX idx_data_lineage_interaction ON ai_data_lineage(interaction_id);

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
    
    -- Log cleanup activity
    INSERT INTO audit_logs (organization_id, action, resource_type, details)
    SELECT 
        organization_id,
        'TOKEN_CLEANUP',
        'token_mappings',
        jsonb_build_object('deleted_count', deleted_count)
    FROM token_mappings 
    WHERE expires_at < NOW()
    LIMIT 1;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to create monthly partitions for usage_events
CREATE OR REPLACE FUNCTION create_usage_events_partition(partition_date DATE)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    start_date := DATE_TRUNC('month', partition_date);
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'usage_events_' || TO_CHAR(start_date, 'YYYY_MM');
    
    -- Check if partition already exists
    IF EXISTS (
        SELECT 1 FROM pg_class 
        WHERE relname = partition_name
    ) THEN
        RETURN 'Partition ' || partition_name || ' already exists';
    END IF;
    
    -- Create partition
    EXECUTE format('CREATE TABLE %I PARTITION OF usage_events FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date);
    
    -- Create indexes on the new partition
    EXECUTE format('CREATE INDEX %I ON %I (organization_id)', 
        'idx_' || partition_name || '_organization_id', partition_name);
    EXECUTE format('CREATE INDEX %I ON %I (timestamp)', 
        'idx_' || partition_name || '_timestamp', partition_name);
    EXECUTE format('CREATE INDEX %I ON %I (provider)', 
        'idx_' || partition_name || '_provider', partition_name);
    
    RETURN 'Created partition ' || partition_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get vector similarity search results
CREATE OR REPLACE FUNCTION search_similar_embeddings(
    query_embedding VECTOR(1536),
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    source_id UUID,
    chunk_text TEXT,
    similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ve.id,
        ve.source_id,
        ve.chunk_text,
        1 - (ve.embedding <=> query_embedding) AS similarity,
        ve.metadata
    FROM vector_embeddings ve
    WHERE 1 - (ve.embedding <=> query_embedding) > similarity_threshold
    ORDER BY ve.embedding <=> query_embedding
    LIMIT max_results;
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

-- Function to update conversation session updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update AI model updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_model_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update AI governance policy updated_at timestamp
CREATE OR REPLACE FUNCTION update_governance_policy_updated_at()
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

CREATE TRIGGER trigger_conversation_sessions_updated_at
    BEFORE UPDATE ON conversation_sessions
    FOR EACH ROW EXECUTE FUNCTION update_conversation_session_updated_at();

CREATE TRIGGER trigger_ai_models_updated_at
    BEFORE UPDATE ON ai_models
    FOR EACH ROW EXECUTE FUNCTION update_ai_model_updated_at();

CREATE TRIGGER trigger_governance_policies_updated_at
    BEFORE UPDATE ON ai_governance_policies
    FOR EACH ROW EXECUTE FUNCTION update_governance_policy_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE curated_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_governance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_human_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_bias_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_governance_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_data_lineage ENABLE ROW LEVEL SECURITY;

-- RLS Policies (single-tenant, but security best practice)
-- Organizations can only access their own data
CREATE POLICY "organizations_own_data" ON organizations
    FOR ALL USING (true); -- Single tenant, but good practice

CREATE POLICY "users_organization_data" ON users
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "api_keys_organization_data" ON api_keys
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "provider_keys_organization_data" ON provider_keys
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "usage_events_organization_data" ON usage_events
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "token_mappings_organization_data" ON token_mappings
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "curated_sources_organization_data" ON curated_sources
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "vector_embeddings_organization_data" ON vector_embeddings
    FOR ALL USING (
        source_id IN (
            SELECT id FROM curated_sources 
            WHERE organization_id = current_setting('app.current_organization_id')::UUID
        )
    );

CREATE POLICY "audit_logs_organization_data" ON audit_logs
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "integrations_organization_data" ON integrations
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "integration_events_organization_data" ON integration_events
    FOR ALL USING (
        integration_id IN (
            SELECT id FROM integrations 
            WHERE organization_id = current_setting('app.current_organization_id')::UUID
        )
    );

CREATE POLICY "conversation_sessions_organization_data" ON conversation_sessions
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "ai_models_organization_data" ON ai_models
    FOR ALL USING (true); -- Models may be shared across orgs, but filtered by application logic

CREATE POLICY "governance_policies_organization_data" ON ai_governance_policies
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "ai_interactions_organization_data" ON ai_interactions
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "ai_human_reviews_organization_data" ON ai_human_reviews
    FOR ALL USING (
        interaction_id IN (
            SELECT id FROM ai_interactions 
            WHERE organization_id = current_setting('app.current_organization_id')::UUID
        )
    );

CREATE POLICY "ai_bias_incidents_organization_data" ON ai_bias_incidents
    FOR ALL USING (
        interaction_id IS NULL OR interaction_id IN (
            SELECT id FROM ai_interactions 
            WHERE organization_id = current_setting('app.current_organization_id')::UUID
        )
    );

CREATE POLICY "ai_explanations_organization_data" ON ai_explanations
    FOR ALL USING (
        interaction_id IN (
            SELECT id FROM ai_interactions 
            WHERE organization_id = current_setting('app.current_organization_id')::UUID
        )
    );

CREATE POLICY "governance_audits_organization_data" ON ai_governance_audits
    FOR ALL USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY "ai_model_performance_organization_data" ON ai_model_performance
    FOR ALL USING (
        model_id IN (
            SELECT id FROM ai_models 
            -- Models filtered by application logic
        )
    );

CREATE POLICY "ai_data_lineage_organization_data" ON ai_data_lineage
    FOR ALL USING (
        interaction_id IN (
            SELECT id FROM ai_interactions 
            WHERE organization_id = current_setting('app.current_organization_id')::UUID
        )
    );

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

-- Create default admin user
INSERT INTO users (id, organization_id, email, name, role, password_hash)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'admin@node2.ai',
    'Administrator',
    'admin',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' -- password: password
);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE organizations IS 'Organizations using Node2AI (single-tenant in self-hosted mode)';
COMMENT ON TABLE users IS 'Users within each organization (IT/business team)';
COMMENT ON TABLE api_keys IS 'API keys for customer applications to call the gateway';
COMMENT ON TABLE provider_keys IS 'Customer BYOK (Bring Your Own Key) for AI providers';
COMMENT ON TABLE usage_events IS 'Track every API call for billing and analytics (partitioned by month)';
COMMENT ON TABLE token_mappings IS 'Critical: Maps sanitized tokens back to original values for data sanitization';
COMMENT ON TABLE curated_sources IS 'Documents uploaded for RAG/knowledge base';
COMMENT ON TABLE vector_embeddings IS 'Vector embeddings for semantic search (requires pgvector)';
COMMENT ON TABLE audit_logs IS 'Compliance audit trail (7-year retention, never delete)';
COMMENT ON TABLE integrations IS 'Third-party integrations (ServiceNow, Slack, etc.)';
COMMENT ON TABLE integration_events IS 'Track integration actions and sync status';
COMMENT ON TABLE conversation_sessions IS 'Conversation sessions for AI interactions';
COMMENT ON TABLE ai_models IS 'AI Models & Providers - Governance metadata and characteristics';
COMMENT ON TABLE ai_governance_policies IS 'AI Usage Policies - Acceptable use, data retention, ethical AI policies';
COMMENT ON TABLE ai_interactions IS 'AI Interactions - Full content for operations and governance';
COMMENT ON TABLE ai_human_reviews IS 'Human Oversight & Review - Mandatory reviews and quality checks';
COMMENT ON TABLE ai_bias_incidents IS 'AI Ethics & Bias Tracking - Bias detection and mitigation';
COMMENT ON TABLE ai_explanations IS 'Explainability & Transparency - Reasoning steps and confidence scores';
COMMENT ON TABLE ai_governance_audits IS 'AI Governance Audits - Internal, external, and regulatory audits';
COMMENT ON TABLE ai_model_performance IS 'AI Model Performance Tracking - Metrics, drift detection, quality scores';
COMMENT ON TABLE ai_data_lineage IS 'Data Lineage & Provenance - Track data sources and transformations';

COMMENT ON COLUMN token_mappings.encrypted_original_value IS 'Original sensitive value encrypted with customer key';
COMMENT ON COLUMN token_mappings.expires_at IS 'Auto-expires after 1 hour for security';
COMMENT ON COLUMN usage_events.data_sanitized IS 'Whether input/output data was sanitized';
COMMENT ON COLUMN usage_events.sanitization_count IS 'Number of PII/PHI elements detected and sanitized';
COMMENT ON COLUMN vector_embeddings.embedding IS '1536-dimensional vector for OpenAI ada-002 embeddings';
COMMENT ON COLUMN audit_logs.details IS 'JSONB containing detailed audit information';
COMMENT ON COLUMN integrations.config IS 'Encrypted credentials and configuration';
COMMENT ON COLUMN ai_interactions.user_prompt IS 'Original prompt with PHI/PII (encrypted)';
COMMENT ON COLUMN ai_interactions.sanitized_prompt IS 'Sanitized prompt sent to AI provider';
COMMENT ON COLUMN ai_interactions.ai_response IS 'Full AI response content';
COMMENT ON COLUMN ai_interactions.blockchain_tx_id IS 'Blockchain transaction ID for immutable audit trail';
