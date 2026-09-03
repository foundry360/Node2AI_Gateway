-- Add licenses table for comprehensive license management
-- This stores the full license information including features, limits, and validation

CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- License key and metadata
    license_key TEXT NOT NULL UNIQUE,
    organization_name TEXT NOT NULL,
    
    -- Capacity limits
    max_seats INTEGER NOT NULL DEFAULT 10,
    max_monthly_api_calls INTEGER,
    max_storage_gb DECIMAL(10, 2),
    
    -- Dates
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- License type
    tier VARCHAR(20) NOT NULL DEFAULT 'trial' 
        CHECK (tier IN ('trial', 'starter', 'professional', 'enterprise')),
    
    -- Features enabled for this license (stored as JSONB array)
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Validation
    signature TEXT NOT NULL,
    
    -- Status and tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked', 'suspended')),
    last_validated_at TIMESTAMP WITH TIME ZONE,
    validation_count INTEGER DEFAULT 0,
    
    -- Usage tracking
    current_seat_count INTEGER DEFAULT 0,
    current_monthly_api_calls INTEGER DEFAULT 0,
    current_storage_gb DECIMAL(10, 2) DEFAULT 0,
    
    -- Metadata
    notes TEXT,
    issued_by UUID, -- User who issued the license
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Indexes
    CONSTRAINT fk_organization FOREIGN KEY (organization_id) 
        REFERENCES organizations(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_licenses_organization ON licenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_tier ON licenses(tier);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_licenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER licenses_updated_at
    BEFORE UPDATE ON licenses
    FOR EACH ROW
    EXECUTE FUNCTION update_licenses_updated_at();

-- Function to automatically update organization license info when license changes
CREATE OR REPLACE FUNCTION sync_organization_license()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE organizations
    SET 
        license_key = NEW.license_key,
        license_expires_at = NEW.expires_at,
        license_tier = NEW.tier,
        updated_at = NOW()
    WHERE id = NEW.organization_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync license info to organizations table
CREATE TRIGGER sync_organization_license_trigger
    AFTER INSERT OR UPDATE ON licenses
    FOR EACH ROW
    EXECUTE FUNCTION sync_organization_license();

-- Create view for active licenses with summary
CREATE OR REPLACE VIEW active_licenses_summary AS
SELECT 
    l.id,
    l.license_key,
    l.organization_name,
    l.tier,
    l.status,
    l.max_seats,
    l.current_seat_count,
    l.max_monthly_api_calls,
    l.current_monthly_api_calls,
    l.issued_at,
    l.expires_at,
    l.last_validated_at,
    l.features,
    EXTRACT(DAY FROM (l.expires_at - NOW())) as days_until_expiry,
    CASE 
        WHEN l.expires_at < NOW() THEN 'expired'
        WHEN l.expires_at < NOW() + INTERVAL '30 days' THEN 'expiring_soon'
        WHEN l.current_seat_count >= l.max_seats * 0.9 THEN 'approaching_limit'
        ELSE 'healthy'
    END as health_status,
    o.name as organization_name_from_org,
    o.is_active as org_is_active
FROM licenses l
JOIN organizations o ON l.organization_id = o.id
WHERE l.status = 'active';

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON licenses TO node2api_user;
-- GRANT SELECT ON active_licenses_summary TO node2api_user;

COMMENT ON TABLE licenses IS 'Stores comprehensive license information including features, limits, and validation status';
COMMENT ON COLUMN licenses.features IS 'Array of enabled features (JSONB array of strings)';
COMMENT ON COLUMN licenses.signature IS 'HMAC signature for license validation';
COMMENT ON VIEW active_licenses_summary IS 'Summary view of all active licenses with health status';

