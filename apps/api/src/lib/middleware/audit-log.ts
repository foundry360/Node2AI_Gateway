import { NextRequest, NextResponse } from 'next/server';
import { AuthenticatedRequest } from './auth';

interface AuditLogEntry {
  id: string;
  organizationId: string;
  userId?: string;
  apiKeyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  status: 'success' | 'error';
  errorMessage?: string;
}

// In-memory audit log store (in production, use database)
const auditLogStore: AuditLogEntry[] = [];

/**
 * Audit logging middleware for compliance
 */
export async function auditLogMiddleware(
  request: AuthenticatedRequest,
  next: (request: AuthenticatedRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const startTime = Date.now();
  let response: NextResponse;
  let error: Error | null = null;

  try {
    response = await next(request);
  } catch (err) {
    error = err instanceof Error ? err : new Error('Unknown error');
    response = NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Internal server error',
        error: error.message,
      },
      { status: 500 }
    );
  }

  // Log the request
  await logAuditEntry(request, response, startTime, error);

  return response;
}

/**
 * Log audit entry
 */
async function logAuditEntry(
  request: AuthenticatedRequest,
  response: NextResponse,
  startTime: number,
  error: Error | null
): Promise<void> {
  try {
    const auth = request.auth;
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Extract action from path and method
    const action = extractAction(method, path);
    const resourceType = extractResourceType(path);
    const resourceId = extractResourceId(path);

    const auditEntry: AuditLogEntry = {
      id: generateId(),
      organizationId: auth?.organizationId || 'unknown',
      userId: auth?.userId,
      apiKeyId: auth?.apiKeyId,
      action,
      resourceType,
      resourceId,
      details: {
        method,
        path,
        query: Object.fromEntries(url.searchParams),
        statusCode: response.status,
        duration: Date.now() - startTime,
        headers: Object.fromEntries(request.headers.entries()),
        // Don't log sensitive data
        body: await getSafeRequestBody(request),
      },
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      timestamp: new Date(),
      status: response.status >= 400 ? 'error' : 'success',
      errorMessage: error?.message,
    };

    // Store audit entry
    auditLogStore.push(auditEntry);

    // TODO: In production, persist to database
    console.log('Audit logged:', {
      id: auditEntry.id,
      organizationId: auditEntry.organizationId,
      action: auditEntry.action,
      status: auditEntry.status,
      timestamp: auditEntry.timestamp,
    });
  } catch (logError) {
    console.error('Failed to log audit entry:', logError);
  }
}

/**
 * Extract action from request
 */
function extractAction(method: string, path: string): string {
  const pathParts = path.split('/').filter(Boolean);

  if (pathParts.includes('chat')) {
    return method === 'POST' ? 'chat.completion' : 'chat.read';
  }

  if (pathParts.includes('knowledge')) {
    if (pathParts.includes('ingest')) return 'knowledge.ingest';
    if (pathParts.includes('search')) return 'knowledge.search';
    return 'knowledge.read';
  }

  if (pathParts.includes('usage')) {
    return 'usage.read';
  }

  if (pathParts.includes('integrations')) {
    return method === 'POST' ? 'integration.create' : 'integration.read';
  }

  if (pathParts.includes('admin')) {
    return 'admin.read';
  }

  return `${method.toLowerCase()}.${pathParts[pathParts.length - 1] || 'unknown'}`;
}

/**
 * Extract resource type from path
 */
function extractResourceType(path: string): string {
  if (path.includes('/chat/')) return 'chat';
  if (path.includes('/knowledge/')) return 'knowledge';
  if (path.includes('/usage/')) return 'usage';
  if (path.includes('/integrations/')) return 'integration';
  if (path.includes('/admin/')) return 'admin';
  return 'api';
}

/**
 * Extract resource ID from path
 */
function extractResourceId(path: string): string | undefined {
  const pathParts = path.split('/').filter(Boolean);
  const idIndex = pathParts.findIndex(
    part => part === 'id' || part.match(/^[a-f0-9-]{36}$/)
  );
  return idIndex !== -1 ? pathParts[idIndex + 1] : undefined;
}

/**
 * Get safe request body (exclude sensitive data)
 */
async function getSafeRequestBody(request: NextRequest): Promise<any> {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }

    const body = await request.clone().json();

    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'token',
      'key',
      'secret',
      'ssn',
      'credit_card',
    ];
    const safeBody = { ...body };

    sensitiveFields.forEach(field => {
      if (safeBody[field]) {
        safeBody[field] = '[REDACTED]';
      }
    });

    return safeBody;
  } catch {
    return null;
  }
}

/**
 * Get client IP address
 */
function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    request.ip ||
    'unknown'
  );
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get audit logs for an organization
 */
export async function getAuditLogs(
  organizationId: string,
  limit: number = 100,
  offset: number = 0
): Promise<AuditLogEntry[]> {
  return auditLogStore
    .filter(entry => entry.organizationId === organizationId)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(offset, offset + limit);
}

/**
 * Search audit logs
 */
export async function searchAuditLogs(
  organizationId: string,
  filters: {
    action?: string;
    resourceType?: string;
    status?: 'success' | 'error';
    startDate?: Date;
    endDate?: Date;
  },
  limit: number = 100
): Promise<AuditLogEntry[]> {
  return auditLogStore
    .filter(entry => {
      if (entry.organizationId !== organizationId) return false;
      if (filters.action && !entry.action.includes(filters.action))
        return false;
      if (filters.resourceType && entry.resourceType !== filters.resourceType)
        return false;
      if (filters.status && entry.status !== filters.status) return false;
      if (filters.startDate && entry.timestamp < filters.startDate)
        return false;
      if (filters.endDate && entry.timestamp > filters.endDate) return false;
      return true;
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

/**
 * Helper function to log audit entry directly (for use outside middleware)
 */
export async function logAudit(
  request: NextRequest,
  options: {
    action: string;
    resource: string;
    details?: Record<string, any>;
    userId?: string;
    organizationId?: string;
    status?: 'success' | 'error';
  }
): Promise<void> {
  const auditEntry: AuditLogEntry = {
    id: generateId(),
    organizationId: options.organizationId || 'unknown',
    userId: options.userId,
    action: options.action,
    resourceType: options.resource,
    details: options.details || {},
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || 'unknown',
    timestamp: new Date(),
    status: options.status || 'success',
  };

  auditLogStore.push(auditEntry);

  console.log('Audit logged:', {
    id: auditEntry.id,
    organizationId: auditEntry.organizationId,
    action: auditEntry.action,
    status: auditEntry.status,
    timestamp: auditEntry.timestamp,
  });
}
