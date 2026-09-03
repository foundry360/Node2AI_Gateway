# Audit Logging & Compliance System - Implementation Summary

## Overview

A comprehensive audit logging and compliance tracking system has been implemented for Node2AI. This system provides complete visibility into all AI interactions, PII/PHI detections, costs, and system events for regulatory compliance (HIPAA, GDPR, PCI-DSS).

## What Was Created

### 1. Database Schema ✅

**File**: `apps/api/src/lib/db/schema.prisma`

Extended Prisma schema with 8 new audit tables:

- **AIRequest** - Primary audit log for every AI interaction
  - Tracks all request details, timing, tokens, costs, status
  - Links to organization, user, API key
  - Includes sanitization metrics (PII/PHI counts)
  - Compliance flags and audit review tracking
- **SanitizationEvent** - Detailed PII/PHI tracking
  - Entity type, category, detection method
  - Confidence scores and token mapping
  - Position in text and context
- **ConversationSession** - Multi-turn conversation tracking
  - Session metadata and message counts
  - Total tokens, costs per session
- **ConversationMessage** - Individual messages
  - Hashed content (no PII stored)
  - PII detection metadata
  - Links to AI requests
- **SystemEvent** - Infrastructure and security events
  - Admin actions, config changes
  - Authentication, authorization events
- **RateLimitEvent** - Rate limiting tracking
  - When limits are hit, who hit them
  - Action taken (blocked, throttled, warned)
- **ComplianceReview** - Manual audit reviews
  - Review findings and issues
  - Compliance status
  - Follow-up tracking
- **AuditRetentionPolicy** - Data retention rules
  - Configurable retention periods
  - Legal hold support
  - Auto-delete functionality

### 2. TypeScript Types & Utilities ✅

**Files**:

- `packages/shared/src/types/audit.types.ts`
- `packages/shared/src/utils/audit.utils.ts`
- `packages/shared/src/index.ts` (exports)

Types include:

- AI request status, entity types, detection methods
- Input/output interfaces for all audit operations
- Query filters and result types
- Cost breakdown and statistics types

Utilities include:

- `generateRequestId()` - UUID generation
- `hashContent()` - SHA-256 hashing for PII
- `calculateCost()` - Provider cost calculation
- `sanitizeErrorMessage()` - Remove PII from errors
- `formatAuditLogForExport()` - Export formatting
- Date parsing, duration formatting, etc.

### 3. Audit Service ✅

**File**: `apps/api/src/lib/audit/audit.service.ts`

Complete service with methods:

- `logAIRequest()` - Log initial request
- `updateAIRequest()` - Update on completion
- `logSanitizationEvent()` - Log PII/PHI detection
- `createConversationSession()` - Start session
- `addConversationMessage()` - Add message to session
- `logSystemEvent()` - Log infrastructure events
- `logRateLimitEvent()` - Log rate limit events
- `createComplianceReview()` - Create review
- `queryAuditLogs()` - Query with filters
- `getAuditLogById()` - Get single log
- `getAuditStatistics()` - Get statistics
- `getConversationHistory()` - Get conversation
- `exportAuditLogs()` - Export CSV/JSON

### 4. API Endpoints ✅

**Location**: `apps/api/src/app/api/v1/audit/`

- `GET /requests` - Query audit logs
- `GET /requests/:id` - Get single log
- `GET /conversations/:sessionId` - Get conversation
- `GET /sanitization/:requestId` - Get sanitization events
- `POST /export` - Export logs
- `GET /stats` - Get statistics
- `GET /system-events` - Get system events
- `POST /compliance-review` - Create review

### 5. Audit Logging Middleware ✅

**File**: `apps/api/src/lib/middleware/audit-logging.ts`

Middleware functions:

- `initializeAuditLogging()` - Start logging at request start
- `completeAuditLogging()` - Update on completion
- `logSanitizationEvent()` - Log PII detection
- `getAuditContext()` - Get context for request
- `withAuditLogging()` - Wrapper for routes

### 6. Background Jobs ✅

**Location**: `scripts/audit/`

- `cleanup-expired-tokens.ts` - Delete expired token mappings (hourly)
- `apply-retention-policies.ts` - Enforce retention policies (daily)
- `generate-compliance-reports.ts` - Generate weekly/monthly reports

### 7. Admin Dashboard ✅

**Location**: `apps/web/src/app/audit/`

Created pages:

- `requests/page.tsx` - List all audit logs with filters
- `stats/page.tsx` - Analytics dashboard

Additional pages to create:

- `requests/[id]/page.tsx` - Detailed request view
- `conversations/page.tsx` - Conversation sessions list
- `conversations/[sessionId]/page.tsx` - Conversation history
- `sanitization/page.tsx` - Sanitization analytics
- `system-events/page.tsx` - System events log
- `compliance/page.tsx` - Compliance reviews

## Implementation Steps

### Step 1: Run Database Migration

```bash
# Navigate to the API app
cd apps/api

# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name add_audit_tables

# Run migration
npx prisma migrate deploy
```

### Step 2: Update Route Handlers

Integrate audit logging into existing chat completion endpoints:

```typescript
import {
  initializeAuditLogging,
  completeAuditLogging,
} from '@/lib/middleware/audit-logging';

export async function POST(request: NextRequest) {
  // Initialize audit logging
  const requestId = await initializeAuditLogging(request, {
    endpoint: request.nextUrl.pathname,
    organizationId: 'org-123',
    provider: 'openai',
    model: 'gpt-4',
    sanitizationEnabled: true,
  });

  try {
    // Process request
    const response = await processAIRequest();

    // Complete audit logging
    await completeAuditLogging(request, {
      status: 'success',
      costUsd: response.cost,
      outputTokens: response.outputTokens,
    });

    return NextResponse.json(response);
  } catch (error) {
    await completeAuditLogging(request, {
      status: 'error',
      errorMessage: error.message,
    });
    throw error;
  }
}
```

### Step 3: Log Sanitization Events

When PII/PHI is detected:

```typescript
import { logSanitizationEvent } from '@/lib/middleware/audit-logging';
import { AuditService } from '@/lib/audit/audit.service';

const auditService = new AuditService();

// Log each detection
await auditService.logSanitizationEvent({
  requestId,
  entityType: 'EMAIL',
  entityCategory: 'PII',
  detectionMethod: 'regex',
  confidenceScore: 0.95,
  tokenId: '[EMAIL_001]',
  action: 'tokenized',
  originalLength: 25,
});
```

### Step 4: Set Up Background Jobs

Add cron jobs for automated tasks:

```bash
# Add to crontab
0 * * * * cd /path/to/node2 && ts-node scripts/audit/cleanup-expired-tokens.ts
0 0 * * * cd /path/to/node2 && ts-node scripts/audit/apply-retention-policies.ts
0 0 * * 1 cd /path/to/node2 && ts-node scripts/audit/generate-compliance-reports.ts
```

### Step 5: Configure Retention Policies

```typescript
// Create retention policy for HIPAA compliance
await prisma.auditRetentionPolicy.create({
  data: {
    organizationId: 'org-123',
    policyName: 'HIPAA Compliance',
    retentionPeriodDays: 2555, // 7 years
    appliesTo: 'ai_requests',
    regulation: 'HIPAA',
    legalHold: false,
    autoDeleteEnabled: true,
  },
});
```

## Usage Examples

### Query Audit Logs

```bash
# Get all requests for an organization
curl "/api/v1/audit/requests?organization_id=org-123"

# Get requests with PII
curl "/api/v1/audit/requests?organization_id=org-123&contains_pii=true"

# Get requests by date range
curl "/api/v1/audit/requests?organization_id=org-123&start_date=2024-01-01&end_date=2024-12-31"

# Get statistics
curl "/api/v1/audit/stats?organization_id=org-123"
```

### Export Audit Logs

```typescript
const response = await fetch('/api/v1/audit/export', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filters: {
      organization_id: 'org-123',
      start_date: '2024-01-01',
    },
    format: 'csv',
  }),
});
```

### View in Dashboard

Navigate to:

- `/audit/requests` - View all audit logs
- `/audit/stats` - View analytics
- `/audit/requests/:id` - View detailed request

## Security Considerations

1. **No PII Storage**: Only hashes are stored, not actual PII
2. **Encrypted Fields**: Sensitive fields use encryption
3. **Access Control**: All endpoints require authentication
4. **Soft Delete**: Records are soft-deleted, not removed
5. **Retention Policies**: Configurable data retention
6. **Legal Hold**: Support for legal hold to prevent deletion

## Performance

- Indexed queries for fast lookups
- Pagination for large result sets
- Async audit logging (non-blocking)
- Batch operations where possible

## Compliance

- **HIPAA**: 7-year retention for PHI
- **GDPR**: Right to deletion support via soft delete
- **PCI-DSS**: Secure logging of all access
- **SOX**: Complete audit trail

## Troubleshooting

### Prisma Errors

If you see Prisma errors, run:

```bash
npx prisma generate
npx prisma migrate dev
```

### Missing Audit Logs

Ensure middleware is properly integrated in route handlers.

### High Database Usage

Configure retention policies to auto-delete old logs.

## Next Steps

1. **Complete Dashboard Pages**: Create remaining dashboard pages for full UI
2. **Integration**: Integrate audit logging into all API routes
3. **Testing**: Add tests for audit logging
4. **Monitoring**: Set up alerts for audit failures
5. **Documentation**: Complete API documentation

## Files Created

```
packages/shared/src/types/audit.types.ts          (New)
packages/shared/src/utils/audit.utils.ts          (New)
packages/shared/src/index.ts                      (Updated)

apps/api/src/lib/db/schema.prisma                 (Updated - added 8 new models)
apps/api/src/lib/audit/audit.service.ts           (New)
apps/api/src/lib/audit/README.md                 (New)
apps/api/src/lib/middleware/audit-logging.ts      (New)

apps/api/src/app/api/v1/audit/requests/route.ts                          (New)
apps/api/src/app/api/v1/audit/requests/[id]/route.ts                     (New)
apps/api/src/app/api/v1/audit/conversations/[sessionId]/route.ts         (New)
apps/api/src/app/api/v1/audit/sanitization/[requestId]/route.ts          (New)
apps/api/src/app/api/v1/audit/export/route.ts                            (New)
apps/api/src/app/api/v1/audit/stats/route.ts                              (New)
apps/api/src/app/api/v1/audit/system-events/route.ts                     (New)
apps/api/src/app/api/v1/audit/compliance-review/route.ts                 (New)

apps/web/src/app/audit/requests/page.tsx          (New)
apps/web/src/app/audit/stats/page.tsx             (New)

scripts/audit/cleanup-expired-tokens.ts           (New)
scripts/audit/apply-retention-policies.ts         (New)
scripts/audit/generate-compliance-reports.ts     (New)

AUDIT_LOGGING_SYSTEM.md                          (This file)
```

## Summary

✅ **Database Schema**: 8 new audit tables with relations
✅ **Types & Utilities**: Complete TypeScript types and helper functions
✅ **Audit Service**: Comprehensive service with 13+ methods
✅ **API Endpoints**: 8 new endpoints for audit access
✅ **Middleware**: Automatic audit logging middleware
✅ **Background Jobs**: 3 automated cleanup/reporting scripts
✅ **Dashboard**: 2 key dashboard pages created
✅ **Documentation**: Complete README and summary

The audit logging system is now ready for integration. Apply the database migration and start integrating audit logging into your route handlers.
