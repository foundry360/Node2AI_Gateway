# Audit Logging System

## Overview

The audit logging system provides comprehensive compliance tracking and audit trails for all AI interactions in Node2AI. It logs every AI request, sanitization event, and system action to ensure regulatory compliance (HIPAA, GDPR, PCI-DSS) and provide complete visibility into system usage.

## Key Features

- **Comprehensive Request Logging**: Tracks every AI request with full details including timing, tokens, costs, and errors
- **PII/PHI Tracking**: Detailed logs of all sensitive data detections and sanitizations
- **Conversation Tracking**: Multi-turn conversation session logging with message history
- **System Events**: Infrastructure and security event logging
- **Rate Limiting Logs**: Tracks rate limit violations
- **Compliance Reviews**: Manual audit review capabilities
- **Retention Policies**: Configurable data retention with legal hold support
- **Export Capabilities**: CSV and JSON export for compliance reporting

## Database Schema

### Tables

1. **ai_requests** - Primary audit log for every AI interaction
2. **sanitization_events** - Detailed PII/PHI tracking per request
3. **conversation_sessions** - Multi-turn conversation tracking
4. **conversation_messages** - Individual messages in sessions
5. **system_events** - Infrastructure and security events
6. **rate_limit_events** - Rate limiting tracking
7. **compliance_reviews** - Manual audit reviews
8. **audit_retention_policies** - Data retention rules

See `apps/api/src/lib/db/schema.prisma` for complete schema definitions.

## API Endpoints

### GET /api/v1/audit/requests

Query audit logs with filters.

**Query Parameters:**

- `organization_id` - Filter by organization
- `user_id` - Filter by user
- `start_date` / `end_date` - Date range
- `status` - success, error, timeout, etc.
- `provider` - OpenAI, Anthropic, etc.
- `contains_pii` / `contains_phi` - Filter by sensitive data
- `page` / `per_page` - Pagination

### GET /api/v1/audit/requests/:id

Get single audit log with full details including sanitization events.

### GET /api/v1/audit/stats

Get audit statistics for analytics dashboard.

### POST /api/v1/audit/export

Export audit logs as CSV or JSON.

### GET /api/v1/audit/system-events

Get system events (security, admin actions).

### POST /api/v1/audit/compliance-review

Create a compliance review.

## Usage

### Logging AI Requests

```typescript
import { AuditService } from '@/lib/audit/audit.service';

const auditService = new AuditService();

// Start of request
await auditService.logAIRequest({
  requestId: 'unique-request-id',
  organizationId: 'org-123',
  endpoint: '/api/v1/chat/completions',
  httpMethod: 'POST',
  provider: 'openai',
  model: 'gpt-4',
  sanitizationEnabled: true,
  status: 'pending',
});

// End of request
await auditService.updateAIRequest('unique-request-id', {
  status: 'success',
  costUsd: 0.0025,
  outputTokenCount: 150,
});
```

### Logging Sanitization Events

```typescript
await auditService.logSanitizationEvent({
  requestId: 'unique-request-id',
  entityType: 'EMAIL',
  entityCategory: 'PII',
  detectionMethod: 'regex',
  confidenceScore: 0.95,
  tokenId: '[EMAIL_001]',
  action: 'tokenized',
  originalLength: 25,
});
```

### Using Middleware

```typescript
import {
  initializeAuditLogging,
  completeAuditLogging,
} from '@/lib/middleware/audit-logging';

export async function POST(request: NextRequest) {
  // Initialize audit logging
  const requestId = await initializeAuditLogging(request, {
    endpoint: '/api/v1/chat/completions',
    organizationId: 'org-123',
    provider: 'openai',
    model: 'gpt-4',
    inputContent: request.body.content,
  });

  try {
    // Process request...
    const response = await processAIRequest();

    // Complete audit logging
    await completeAuditLogging(request, {
      status: 'success',
      costUsd: response.cost,
      outputTokens: response.tokens,
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

## Background Jobs

### Cleanup Expired Tokens

```bash
ts-node scripts/audit/cleanup-expired-tokens.ts
```

Runs hourly via cron to delete expired token mappings.

### Apply Retention Policies

```bash
ts-node scripts/audit/apply-retention-policies.ts
```

Runs daily to enforce data retention policies.

### Generate Compliance Reports

```bash
ts-node scripts/audit/generate-compliance-reports.ts
```

Generates weekly and monthly compliance reports.

## Dashboard Pages

Access audit logs via the web dashboard:

- `/audit/requests` - List all audit logs with filters
- `/audit/requests/[id]` - Detailed view of single request
- `/audit/conversations` - List conversation sessions
- `/audit/conversations/[sessionId]` - View conversation history
- `/audit/stats` - Analytics dashboard
- `/audit/sanitization` - Sanitization analytics
- `/audit/system-events` - System event log
- `/audit/compliance` - Compliance review dashboard

## Security & Compliance

- **No PII Storage**: Only hashes and metadata are stored, not actual PII
- **Encrypted**: Sensitive fields use encryption
- **Retention Policies**: Configurable data retention periods
- **Legal Hold**: Support for legal hold to prevent deletion
- **Audit Trail**: Complete audit trail of all access
- **Export**: CSV/JSON export for compliance reporting

## Performance

- **Indexed Queries**: Optimized with database indexes
- **Pagination**: Large result sets are paginated
- **Async Operations**: Non-blocking audit logging
- **Batch Operations**: Efficient batch inserts/updates

## Configuration

Set up cron jobs for background tasks:

```cron
# Run hourly
0 * * * * cd /path/to/node2 && ts-node scripts/audit/cleanup-expired-tokens.ts

# Run daily
0 0 * * * cd /path/to/node2 && ts-node scripts/audit/apply-retention-policies.ts

# Run weekly on Monday
0 0 * * 1 cd /path/to/node2 && ts-node scripts/audit/generate-compliance-reports.ts
```

## Troubleshooting

### Missing Audit Logs

Check that Prisma migrations have been run:

```bash
npx prisma migrate dev
```

### High Database Usage

Configure retention policies to automatically clean up old logs:

```typescript
await prisma.auditRetentionPolicy.create({
  data: {
    organizationId: 'org-123',
    policyName: 'Standard Retention',
    retentionPeriodDays: 90,
    appliesTo: 'ai_requests',
    autoDeleteEnabled: true,
  },
});
```

### Export Performance

For large exports, consider running background job or increasing timeout:

```typescript
// Increase timeout for large exports
export async function exportAuditLogs() {
  // ... set timeout
}
```
