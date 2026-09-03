-- =============================================================================
-- AUDIT LOGGING SYSTEM - COMPREHENSIVE COMPLIANCE TRACKING
-- =============================================================================
-- This migration adds comprehensive audit logging tables for Node2AI
-- Supports HIPAA, GDPR, PCI-DSS, and other compliance frameworks

-- =============================================================================
-- AUDIT TABLES
-- =============================================================================

-- AI Requests table (primary audit log for every AI interaction)
CREATE TABLE IF NOT EXISTS ai_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Customer Context
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    application_id UUID,

    -- Request Details
    endpoint VARCHAR(255) NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    ip_address INET,
    user_agent TEXT,

    -- AI Provider Details
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    deployment_mode VARCHAR(20) DEFAULT 'self-hosted',

    -- Input Metrics
    input_message_count INTEGER DEFAULT 0,
    input_token_count INTEGER DEFAULT 0,
    input_character_count INTEGER DEFAULT 0,
    input_hash VARCHAR(64),

    -- Sanitization Details (CRITICAL)
    sanitization_enabled BOOLEAN DEFAULT true,
    pii_detected_count INTEGER DEFAULT 0,
    phi_detected_count INTEGER DEFAULT 0,
    sanitization_types JSONB DEFAULT '{}',
    sanitization_duration_ms INTEGER,

    -- Output Metrics
    output_token_count INTEGER,
    output_character_count INTEGER,
    output_hash VARCHAR(64),
    finish_reason VARCHAR(50),

    -- Status & Error Handling
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('success', 'error', 'timeout', 'rate_limited', 'pending')),
    http_status_code INTEGER,
    error_type VARCHAR(100),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Cost Tracking
    cost_usd DECIMAL(10, 6),
    cost_input_usd DECIMAL(10, 6),
    cost_output_usd DECIMAL(10, 6),
    pricing_tier VARCHAR(50),

    -- Performance Metrics
    queue_time_ms INTEGER,
    ai_provider_time_ms INTEGER,
    desanitization_time_ms INTEGER,

    -- Compliance
    compliance_flags JSONB,
    retention_policy VARCHAR(50),
    audit_reviewed BOOLEAN DEFAULT false,
    audit_reviewed_by UUID REFERENCES users(id),
    audit_reviewed_at TIMESTAMPTZ,

    -- Metadata
    request_metadata JSONB,
    response_metadata JSONB,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Soft Delete
    deleted_at TIMESTAMPTZ
);

-- Sanitization Events table (detailed PII/PHI tracking)
CREATE TABLE IF NOT EXISTS sanitization_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Entity Details
    entity_type VARCHAR(50) NOT NULL,
    entity_category VARCHAR(50) NOT NULL CHECK (entity_category IN ('PII', 'PHI', 'PCI')),
    detection_method VARCHAR(50) NOT NULL,
    confidence_score DECIMAL(3, 2) NOT NULL DEFAULT 0.0,

    -- Location in Text
    position_start INTEGER NOT NULL,
    position_end INTEGER NOT NULL,
    context_before TEXT,
    context_after TEXT,

    -- Tokenization
    token_id VARCHAR(50) NOT NULL,
    token_expiry TIMESTAMPTZ,

    -- Actions
    action VARCHAR(20) NOT NULL CHECK (action IN ('tokenized', 'redacted', 'masked', 'encrypted')),
    original_length INTEGER NOT NULL,

    -- Metadata
    metadata JSONB
);

-- Conversation Sessions table (multi-turn conversation tracking)
CREATE TABLE IF NOT EXISTS conversation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,

    -- Conversation Details
    title TEXT,
    message_count INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_usd DECIMAL(10, 6) DEFAULT 0,

    -- Context
    context_metadata JSONB,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived'))
);

-- Conversation Messages table (individual messages in session)
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    request_id UUID REFERENCES ai_requests(id),
    message_order INTEGER NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Content (hashed, not stored verbatim)
    content_hash VARCHAR(64) NOT NULL,
    content_length INTEGER NOT NULL,
    token_count INTEGER NOT NULL,

    -- Sanitization
    contained_pii BOOLEAN DEFAULT false,
    pii_types JSONB,

    -- Metadata
    metadata JSONB
);

-- System Events table (infrastructure and security events)
CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Event Details
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL CHECK (event_category IN ('security', 'performance', 'compliance', 'admin')),
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),

    -- Actor (who did it)
    actor_type VARCHAR(50) NOT NULL CHECK (actor_type IN ('user', 'api_key', 'system', 'admin')),
    actor_id UUID,
    actor_ip INET,
    actor_user_agent TEXT,

    -- Target (what was affected)
    target_type VARCHAR(50),
    target_id UUID,

    -- Action
    action VARCHAR(100) NOT NULL,
    description TEXT,

    -- Before/After State
    changes JSONB,

    -- Context
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    request_id VARCHAR(255),

    -- Status
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failure', 'blocked')),
    error_message TEXT
);

-- Rate Limit Events table (rate limiting tracking)
CREATE TABLE IF NOT EXISTS rate_limit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Who
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    ip_address INET,

    -- Limit Details
    limit_type VARCHAR(50) NOT NULL,
    limit_value INTEGER NOT NULL,
    current_value INTEGER NOT NULL,
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,

    -- Action
    action VARCHAR(20) NOT NULL CHECK (action IN ('blocked', 'throttled', 'warned')),
    retry_after_seconds INTEGER
);

-- Compliance Reviews table (manual audit reviews)
CREATE TABLE IF NOT EXISTS compliance_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_type VARCHAR(50) NOT NULL CHECK (review_type IN ('random_sample', 'flagged_content', 'periodic_audit')),
    review_period_start TIMESTAMPTZ,
    review_period_end TIMESTAMPTZ,

    -- Reviewer
    reviewed_by UUID NOT NULL REFERENCES users(id),
    reviewed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Scope
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    request_ids UUID[] NOT NULL,
    sample_size INTEGER,

    -- Findings
    findings TEXT,
    issues_found INTEGER DEFAULT 0,
    compliance_status VARCHAR(20) NOT NULL CHECK (compliance_status IN ('compliant', 'non_compliant', 'needs_review')),

    -- Actions
    actions_required TEXT,
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date DATE,

    -- Metadata
    metadata JSONB
);

-- Audit Retention Policies table (data retention rules)
CREATE TABLE IF NOT EXISTS audit_retention_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Policy
    policy_name VARCHAR(100) NOT NULL,
    retention_period_days INTEGER NOT NULL,
    applies_to VARCHAR(50) NOT NULL,

    -- Conditions
    conditions JSONB,

    -- Legal
    regulation VARCHAR(100),
    legal_hold BOOLEAN DEFAULT false,

    -- Automation
    auto_delete_enabled BOOLEAN DEFAULT false,
    last_purge_at TIMESTAMPTZ,
    next_purge_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- AI Requests indexes
CREATE INDEX IF NOT EXISTS idx_requests_org_created ON ai_requests(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_user ON ai_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status ON ai_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_provider_model ON ai_requests(provider, model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_sanitization ON ai_requests(sanitization_enabled, pii_detected_count);
CREATE INDEX IF NOT EXISTS idx_requests_request_id ON ai_requests(request_id);

-- Sanitization Events indexes
CREATE INDEX IF NOT EXISTS idx_sanitization_request ON sanitization_events(request_id);
CREATE INDEX IF NOT EXISTS idx_sanitization_type ON sanitization_events(entity_type, created_at DESC);

-- Conversation Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_org ON conversation_sessions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON conversation_sessions(user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON conversation_sessions(session_id);

-- Conversation Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_session ON conversation_messages(session_id, message_order);
CREATE INDEX IF NOT EXISTS idx_messages_request ON conversation_messages(request_id);

-- System Events indexes
CREATE INDEX IF NOT EXISTS idx_events_type ON system_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_category ON system_events(event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_org ON system_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity ON system_events(severity, created_at DESC);

-- Rate Limit Events indexes
CREATE INDEX IF NOT EXISTS idx_rate_limit_org ON rate_limit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_type ON rate_limit_events(limit_type, created_at DESC);

-- Compliance Reviews indexes
CREATE INDEX IF NOT EXISTS idx_reviews_org ON compliance_reviews(organization_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON compliance_reviews(compliance_status, reviewed_at DESC);

-- Audit Retention Policies indexes
CREATE INDEX IF NOT EXISTS idx_retention_org ON audit_retention_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_retention_policy_name ON audit_retention_policies(policy_name);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all new audit tables
ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanitization_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_retention_policies ENABLE ROW LEVEL SECURITY;

-- AI Requests policies
CREATE POLICY "Users can view ai_requests in their organization" ON ai_requests
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    ));

-- Sanitization Events policies (inherit from ai_requests via JOIN)
CREATE POLICY "Users can view sanitization_events for their ai_requests" ON sanitization_events
    FOR SELECT USING (request_id IN (
        SELECT id FROM ai_requests WHERE organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    ));

-- Conversation Sessions policies
CREATE POLICY "Users can view conversation_sessions in their organization" ON conversation_sessions
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    ));

-- Conversation Messages policies (inherit from conversation_sessions)
CREATE POLICY "Users can view conversation_messages for their sessions" ON conversation_messages
    FOR SELECT USING (session_id IN (
        SELECT id FROM conversation_sessions WHERE organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    ));

-- System Events policies
CREATE POLICY "Users can view system_events in their organization" ON system_events
    FOR SELECT USING (
        organization_id IS NULL OR organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- Rate Limit Events policies
CREATE POLICY "Users can view rate_limit_events in their organization" ON rate_limit_events
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    ));

-- Compliance Reviews policies
CREATE POLICY "Users can view compliance_reviews in their organization" ON compliance_reviews
    FOR SELECT USING (
        organization_id IS NULL OR organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- Audit Retention Policies policies
CREATE POLICY "Users can view audit_retention_policies in their organization" ON audit_retention_policies
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    ));

-- =============================================================================
-- UPDATE TRIGGERS FOR AUDIT TABLES
-- =============================================================================

-- Set updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_sessions_updated_at
    BEFORE UPDATE ON conversation_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_retention_policies_updated_at
    BEFORE UPDATE ON audit_retention_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMPLIANCE VIEWS FOR AUDIT DATA
-- =============================================================================

-- View for audit statistics
CREATE VIEW audit_statistics AS
SELECT
    organization_id,
    DATE(created_at) as date,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE status = 'success') as success_count,
    COUNT(*) FILTER (WHERE status = 'error') as error_count,
    COUNT(*) FILTER (WHERE pii_detected_count > 0) as pii_detections,
    COUNT(*) FILTER (WHERE phi_detected_count > 0) as phi_detections,
    SUM(cost_usd) as total_cost,
    AVG(duration_ms) as avg_duration_ms
FROM ai_requests
WHERE deleted_at IS NULL
GROUP BY organization_id, DATE(created_at);

-- View for PII/PHI detection analytics
CREATE VIEW pii_detection_analytics AS
SELECT
    se.entity_type,
    se.entity_category,
    se.detection_method,
    COUNT(*) as detection_count,
    AVG(se.confidence_score) as avg_confidence,
    DATE(se.created_at) as date
FROM sanitization_events se
JOIN ai_requests ar ON se.request_id = ar.id
WHERE ar.deleted_at IS NULL
GROUP BY se.entity_type, se.entity_category, se.detection_method, DATE(se.created_at);

-- =============================================================================
-- FINAL SETUP
-- =============================================================================

-- Analyze new tables
ANALYZE ai_requests;
ANALYZE sanitization_events;
ANALYZE conversation_sessions;
ANALYZE conversation_messages;
ANALYZE system_events;
ANALYZE rate_limit_events;
ANALYZE compliance_reviews;
ANALYZE audit_retention_policies;

DO $$
BEGIN
    RAISE NOTICE 'Audit logging tables created successfully!';
    RAISE NOTICE 'Tables: ai_requests, sanitization_events, conversation_sessions, conversation_messages, system_events, rate_limit_events, compliance_reviews, audit_retention_policies';
    RAISE NOTICE 'Indexes created for performance optimization';
    RAISE NOTICE 'Row Level Security enabled on all audit tables';
    RAISE NOTICE 'Compliance views created for reporting';
END $$;

