# AWS RDS Schema Migration Documentation

## Overview

This document explains the complete PostgreSQL schema for Node2AI on AWS RDS, including all mismatches found between the application code, Prisma schema, and existing migrations.

## Migration File

**File:** `migrations/aws-rds-complete-schema.sql`

This migration is **idempotent** and can be run multiple times safely. It uses:

- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE ADD COLUMN IF NOT EXISTS` (implicitly handled)

## Critical Schema Mismatches Found

### 1. **users Table - Missing Columns**

#### Problem

The application code expects these columns that were missing from the base schema:

| Column             | Type             | Required | Source                                   | Issue                                   |
| ------------------ | ---------------- | -------- | ---------------------------------------- | --------------------------------------- |
| `phone`            | VARCHAR(20)      | No       | `migrations/add_user_profile_fields.sql` | Column not in Prisma schema             |
| `avatar_url`       | TEXT             | No       | `migrations/add_user_profile_fields.sql` | Column not in Prisma schema             |
| `display_name`     | VARCHAR(255)     | No       | `migrations/add_display_name_field.sql`  | Column not in Prisma schema             |
| `supabase_user_id` | UUID             | No       | Code references                          | Referenced in queries but not in Prisma |
| `external_id`      | VARCHAR(255)     | No       | Migration 005                            | Unified auth field                      |
| `auth_provider`    | VARCHAR(50)      | No       | Migration 005                            | Unified auth field                      |
| `user_type`        | user_type enum   | No       | Migration 005                            | Unified auth field                      |
| `customer_id`      | UUID             | No       | Migration 005                            | Unified auth field                      |
| `full_name`        | VARCHAR(255)     | No       | Migration 005                            | Unified auth field                      |
| `status`           | user_status enum | No       | Migration 005                            | Unified auth field                      |
| `deleted_at`       | TIMESTAMPTZ      | No       | Migration 005                            | Unified auth field                      |
| `department`       | VARCHAR(255)     | No       | Code references                          | Referenced in TypeScript types          |

#### Solution

All columns have been added to the migration with proper defaults and nullable constraints.

### 2. **audit_events Table - Missing customer_id Constraint**

#### Problem

The application code **REQUIRES** `customer_id` to be NOT NULL in `audit_events`:

```typescript
// apps/api/src/lib/services/unified-audit.service.ts
customer_id: event.customer_id, // Required, not nullable
```

But the migration 005 allows it to be nullable in some cases.

#### Solution

The migration ensures `customer_id` is `NOT NULL` with a foreign key constraint:

```sql
customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE
```

### 3. **sessions Table - Missing Table**

#### Problem

The application code expects a `sessions` table for unified auth:

```typescript
// apps/api/src/lib/services/unified-auth.service.ts
FROM sessions s
WHERE s.token_hash = $1 AND s.active = true AND s.expires_at > NOW()
```

But this table was only created in migration 005, which may not have been run.

#### Solution

The migration includes the complete `sessions` table with all required columns and indexes.

### 4. **customers Table - Missing Table**

#### Problem

The unified auth system requires a `customers` table that maps to `organizations`:

```typescript
// apps/api/src/lib/services/unified-auth.service.ts
customer_id: customerId, // References customers table
```

#### Solution

The migration creates the `customers` table and automatically migrates existing organizations.

### 5. **Prisma Schema vs Application Code Mismatch**

#### Problem

The Prisma schema (`apps/api/src/lib/db/schema.prisma`) does NOT include:

- `phone` column
- `avatar_url` column
- `display_name` column
- `supabase_user_id` column
- Unified auth fields (`external_id`, `auth_provider`, `user_type`, `customer_id`, etc.)

But the application code **actively queries and updates** these columns.

#### Solution

The migration includes ALL columns that the application code expects, regardless of Prisma schema.

## Complete Table Reference

### Core Tables

#### `organizations`

- **Purpose:** Customer organizations/tenants
- **Key Columns:** `id`, `name`, `license_tier`, `is_active`
- **Status:** ✅ Complete

#### `users`

- **Purpose:** All users (admins and end users)
- **Key Columns:**
  - Base: `id`, `organization_id`, `email`, `name`, `role`
  - Auth: `supabase_user_id`, `external_id`, `auth_provider`, `user_type`
  - Profile: `avatar_url`, `phone`, `display_name`, `full_name`, `department`
  - Status: `is_active`, `status`, `deleted_at`
  - Relations: `customer_id`
- **Status:** ✅ Complete with ALL expected columns

#### `customers`

- **Purpose:** Unified auth customer mapping (linked to organizations)
- **Key Columns:** `id`, `name`, `organization_id`, `status`
- **Status:** ✅ Complete

#### `sessions`

- **Purpose:** User session management for token validation
- **Key Columns:** `id`, `user_id`, `token_hash`, `expires_at`, `active`
- **Status:** ✅ Complete

### Audit & Compliance Tables

#### `audit_events`

- **Purpose:** Unified audit logging (CRITICAL)
- **Key Columns:**
  - **REQUIRED:** `customer_id` (NOT NULL)
  - Who: `user_id`, `actor_email`, `actor_name`
  - What: `event_type`, `event_category`, `severity`
  - Context: `resource_type`, `resource_id`, `action`, `method`, `endpoint`
  - AI: `ai_model`, `ai_provider`, `tokens_used`, `cost_usd`
- **Status:** ✅ Complete with NOT NULL customer_id

#### `audit_logs`

- **Purpose:** Legacy audit logging (kept for backward compatibility)
- **Status:** ✅ Complete

### API & Provider Tables

#### `api_keys`

- **Purpose:** API keys for customer applications
- **Key Columns:** `id`, `organization_id`, `key_hash`, `created_by`
- **Status:** ✅ Complete

#### `provider_keys`

- **Purpose:** Encrypted AI provider API keys (BYOK)
- **Key Columns:** `id`, `organization_id`, `provider`, `encrypted_key`, `environment`
- **Status:** ✅ Complete

#### `customer_api_keys`

- **Purpose:** API keys for unified auth customers
- **Status:** ✅ Complete

### Usage & Tracking Tables

#### `usage_events`

- **Purpose:** Track every API call
- **Status:** ✅ Complete

#### `token_mappings`

- **Purpose:** Data sanitization token mappings
- **Status:** ✅ Complete

#### `ai_requests`

- **Purpose:** Full AI request tracking for compliance
- **Status:** ✅ Complete

#### `conversation_sessions`

- **Purpose:** AI conversation sessions
- **Status:** ✅ Complete

## Column Reference by Table

### users Table - Complete Column List

```sql
-- Primary & Relations
id UUID PRIMARY KEY
organization_id UUID NOT NULL (FK to organizations)
customer_id UUID (FK to customers, nullable)

-- Basic Info
email VARCHAR(255) NOT NULL
name VARCHAR(255) NOT NULL
full_name VARCHAR(255) -- Unified auth
display_name VARCHAR(255) -- UI display name
role VARCHAR(20) NOT NULL DEFAULT 'viewer'

-- Authentication
password_hash VARCHAR(255)
sso_id VARCHAR(255)
sso_provider VARCHAR(50)
supabase_user_id UUID -- Supabase integration
external_id VARCHAR(255) -- Unified auth
auth_provider VARCHAR(50) DEFAULT 'supabase' -- Unified auth
user_type user_type DEFAULT 'admin' -- Unified auth enum

-- Profile
avatar_url TEXT
phone VARCHAR(20)
department VARCHAR(255)

-- Status
is_active BOOLEAN NOT NULL DEFAULT true
status user_status DEFAULT 'active' -- Unified auth enum
deleted_at TIMESTAMP WITH TIME ZONE

-- Timestamps
created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
last_login_at TIMESTAMP WITH TIME ZONE
```

### audit_events Table - Complete Column List

```sql
-- Primary
id UUID PRIMARY KEY

-- Who (REQUIRED)
customer_id UUID NOT NULL (FK to customers) -- CRITICAL: NOT NULL
user_id UUID (FK to users, nullable)
actor_email VARCHAR(255)
actor_name VARCHAR(255)

-- What
event_type audit_event_type NOT NULL
event_category VARCHAR(50) NOT NULL
severity audit_severity DEFAULT 'info'

-- Where
resource_type VARCHAR(100)
resource_id UUID

-- How
action VARCHAR(100) NOT NULL
method VARCHAR(10)
endpoint VARCHAR(255)

-- Context
description TEXT
changes JSONB
metadata JSONB DEFAULT '{}'

-- AI-Specific
ai_model VARCHAR(100)
ai_provider VARCHAR(50)
tokens_used INTEGER
cost_usd DECIMAL(10, 4)

-- Technical
ip_address INET
user_agent TEXT
session_id VARCHAR(255)
request_id VARCHAR(255)

-- Status
success BOOLEAN DEFAULT true
error_message TEXT

-- Timestamp
created_at TIMESTAMPTZ DEFAULT NOW()
```

## Indexes Created

All tables have appropriate indexes for:

- Foreign keys
- Common query patterns
- Performance optimization
- Unique constraints

## Running the Migration

### On AWS RDS PostgreSQL

```bash
# Connect to your RDS instance
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d node2ai

# Run the migration
\i migrations/aws-rds-complete-schema.sql
```

### Verification

After running the migration, verify all tables exist:

```sql
-- Check tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check users table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Check audit_events table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'audit_events'
ORDER BY ordinal_position;

-- Verify customer_id is NOT NULL in audit_events
SELECT
    column_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'audit_events'
AND column_name = 'customer_id';
```

## Common Errors Fixed

### Error: "column 'phone' does not exist"

**Fixed:** Added `phone VARCHAR(20)` to users table

### Error: "column 'avatar_url' does not exist"

**Fixed:** Added `avatar_url TEXT` to users table

### Error: "column 'supabase_user_id' does not exist"

**Fixed:** Added `supabase_user_id UUID` to users table

### Error: "column 'auth_provider' does not exist"

**Fixed:** Added `auth_provider VARCHAR(50)` to users table

### Error: "column 'customer_id' of relation 'audit_events' does not exist"

**Fixed:** Added `customer_id UUID NOT NULL` to audit_events table

### Error: "relation 'sessions' does not exist"

**Fixed:** Created complete `sessions` table

### Error: "null value in column 'id' of relation 'users' violates not-null constraint"

**Fixed:** Ensured `id` has `DEFAULT gen_random_uuid()` (or `uuid_generate_v4()`)

## Notes

1. **No Supabase Dependencies:** This schema is for AWS RDS only. It does NOT include:
   - Supabase RLS policies
   - `auth.uid()` functions
   - Supabase-specific triggers

2. **Unified Auth System:** The schema supports both:
   - Legacy Supabase auth (via `supabase_user_id`)
   - New unified auth (via `external_id` + `auth_provider`)

3. **Backward Compatibility:** The schema maintains:
   - `audit_logs` table (legacy)
   - `organizations` table (maps to `customers`)
   - All existing foreign key relationships

4. **Idempotent:** The migration can be run multiple times safely. It checks for existence before creating.

## Next Steps

1. Run the migration on your RDS instance
2. Verify all tables and columns exist
3. Update your application's `DATABASE_URL` environment variable
4. Test the application to ensure all queries work
5. Monitor for any remaining schema-related errors

## Support

If you encounter any issues after running this migration, check:

1. PostgreSQL version (requires 15+)
2. Extensions are enabled (uuid-ossp, pg_trgm, btree_gin)
3. All foreign key relationships are valid
4. All required columns have default values or are nullable
