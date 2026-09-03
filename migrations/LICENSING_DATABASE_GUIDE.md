# License Database Schema Guide

## Overview

The licenses table provides comprehensive license management for Node2AI, tracking everything from capacity limits to feature enablement and usage monitoring.

## Schema

### Licenses Table

```sql
CREATE TABLE licenses (
    -- Basic info
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    license_key TEXT NOT NULL UNIQUE,
    organization_name TEXT NOT NULL,

    -- Capacity
    max_seats INTEGER NOT NULL,
    max_monthly_api_calls INTEGER,
    max_storage_gb DECIMAL(10, 2),

    -- Dates
    issued_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,

    -- Type and features
    tier VARCHAR(20), -- trial, starter, professional, enterprise
    features JSONB,  -- Array of enabled features

    -- Validation
    signature TEXT,
    status VARCHAR(20), -- active, expired, revoked, suspended
    last_validated_at TIMESTAMP WITH TIME ZONE,
    validation_count INTEGER,

    -- Usage tracking
    current_seat_count INTEGER,
    current_monthly_api_calls INTEGER,
    current_storage_gb DECIMAL(10, 2),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);
```

## License Tiers

- **trial**: 30 days, basic features, limited seats
- **starter**: 1 year, core features, up to 25 seats
- **professional**: 1 year, advanced features, up to 500 seats
- **enterprise**: 1 year+, all features, unlimited seats

## Features

Features stored as JSONB array, e.g.:

```json
["multi_provider", "basic_analytics", "api_access", "audit_logs", "sso_saml"]
```

Available features:

- `multi_provider` - Support multiple AI providers
- `basic_analytics` - Basic usage analytics
- `advanced_analytics` - Advanced analytics and reporting
- `api_access` - API access enabled
- `audit_logs` - Audit log retention
- `sso_saml` - SSO/SAML authentication
- `custom_roles` - Custom role management
- `air_gapped` - Air-gapped deployment support
- `dedicated_support` - Dedicated support
- `custom_sla` - Custom SLA guarantees
- `white_label` - White-label branding
- `multi_tenant` - Multi-tenant support
- `advanced_security` - Advanced security features

## Usage

### Creating a License

```sql
INSERT INTO licenses (
    organization_id,
    license_key,
    organization_name,
    max_seats,
    tier,
    features,
    expires_at,
    signature
) VALUES (
    'org-uuid',
    'NODE2AI-PRO-2024-XXXX-XXXX',
    'My Company',
    100,
    'professional',
    '["multi_provider", "basic_analytics", "api_access", "audit_logs", "custom_roles"]'::jsonb,
    NOW() + INTERVAL '1 year',
    'hmac-signature-here'
);
```

### Querying Active Licenses

```sql
-- View health status
SELECT * FROM active_licenses_summary
WHERE health_status = 'expiring_soon';

-- Check specific license
SELECT * FROM licenses
WHERE license_key = 'NODE2AI-PRO-2024-XXXX-XXXX'
AND status = 'active';

-- Update usage
UPDATE licenses
SET
    current_seat_count = 45,
    current_monthly_api_calls = 15000,
    last_validated_at = NOW()
WHERE license_key = 'NODE2AI-PRO-2024-XXXX-XXXX';
```

## Health Status

The `active_licenses_summary` view automatically calculates:

- **healthy**: No issues, >30 days until expiry
- **expiring_soon**: Expires within 30 days
- **approaching_limit**: At 90%+ of seat capacity
- **expired**: Past expiration date

## Automatic Syncing

The schema includes a trigger that automatically syncs license info to the organizations table:

- Updates `license_key`
- Updates `license_expires_at`
- Updates `license_tier`

This keeps the organizations table in sync with the licenses table.

## Migration

```bash
# Run the migration
psql $DATABASE_URL -f migrations/add_licenses_table.sql

# Or for Supabase
psql "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT].supabase.co:5432/postgres" \
  -f migrations/add_licenses_table.sql
```

## Next Steps

1. Create the database table (run migration)
2. Update licensing package to read from database
3. Create API endpoints to manage licenses
4. Add middleware for license enforcement
5. Set up usage tracking jobs
