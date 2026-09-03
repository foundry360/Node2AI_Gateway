import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Mock authentication middleware
const authMiddleware = (
  request: NextRequest,
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, message: 'Authentication required' },
      { status: 401 }
    );
  }
  const token = authHeader.split(' ')[1];
  // Mock token validation
  if (!token || !token.startsWith('mock-token-')) {
    return NextResponse.json(
      { success: false, message: 'Invalid token' },
      { status: 401 }
    );
  }
  const authRequest = request as AuthenticatedRequest;
  authRequest.auth = {
    userId: 'user-mock',
    organizationId: 'org-mock',
    role: 'admin',
    authMethod: 'bearer_token',
  };
  return handler(authRequest);
};

interface AuthenticatedRequest extends NextRequest {
  auth?: {
    userId: string;
    organizationId: string;
    role: string;
    authMethod: string;
  };
}

// Mock audit log data
const mockAuditLogs = [
  {
    id: 'audit-1',
    timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    userId: 'user-1',
    userEmail: 'admin@node2ai.ai',
    action: 'LOGIN',
    resource: 'auth',
    resourceId: 'session-1',
    details: {
      ip_address: '192.168.1.100',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      success: true,
      method: 'POST',
      endpoint: '/api/v1/auth/login',
    },
    organizationId: 'org-1',
    severity: 'INFO',
    category: 'AUTHENTICATION',
  },
  {
    id: 'audit-2',
    timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    userId: 'user-2',
    userEmail: 'user@example.com',
    action: 'CREATE',
    resource: 'provider_key',
    resourceId: 'pk-123',
    details: {
      provider: 'openai',
      key_metadata: { model: 'gpt-4', environment: 'production' },
      success: true,
      method: 'POST',
      endpoint: '/api/v1/provider-keys',
    },
    organizationId: 'org-1',
    severity: 'INFO',
    category: 'PROVIDER_MANAGEMENT',
  },
  {
    id: 'audit-3',
    timestamp: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
    userId: 'user-1',
    userEmail: 'admin@node2ai.ai',
    action: 'SANITIZE',
    resource: 'text',
    resourceId: 'sanitize-456',
    details: {
      input_length: 1250,
      pii_detected: ['ssn', 'email', 'phone'],
      sanitization_level: 'standard',
      success: true,
      method: 'POST',
      endpoint: '/api/sanitization/sanitize',
    },
    organizationId: 'org-1',
    severity: 'INFO',
    category: 'DATA_PROCESSING',
  },
  {
    id: 'audit-4',
    timestamp: new Date(Date.now() - 14400000).toISOString(), // 4 hours ago
    userId: 'user-3',
    userEmail: 'viewer@example.com',
    action: 'ACCESS_DENIED',
    resource: 'admin_panel',
    resourceId: 'admin-789',
    details: {
      reason: 'Insufficient permissions',
      required_role: 'admin',
      user_role: 'viewer',
      success: false,
      method: 'GET',
      endpoint: '/api/v1/admin/users',
    },
    organizationId: 'org-1',
    severity: 'WARNING',
    category: 'AUTHORIZATION',
  },
  {
    id: 'audit-5',
    timestamp: new Date(Date.now() - 18000000).toISOString(), // 5 hours ago
    userId: 'user-1',
    userEmail: 'admin@node2ai.ai',
    action: 'CHAT_COMPLETION',
    resource: 'ai_request',
    resourceId: 'chat-789',
    details: {
      provider: 'openai',
      model: 'gpt-4',
      tokens_used: 150,
      cost: 0.08,
      latency: 1200,
      success: true,
      method: 'POST',
      endpoint: '/api/v1/chat/smart-protected',
    },
    organizationId: 'org-1',
    severity: 'INFO',
    category: 'AI_USAGE',
  },
  {
    id: 'audit-6',
    timestamp: new Date(Date.now() - 21600000).toISOString(), // 6 hours ago
    userId: 'user-2',
    userEmail: 'user@example.com',
    action: 'UPDATE',
    resource: 'provider_key',
    resourceId: 'pk-123',
    details: {
      changes: { isActive: false },
      reason: 'Key rotation',
      success: true,
      method: 'PUT',
      endpoint: '/api/v1/provider-keys/pk-123',
    },
    organizationId: 'org-1',
    severity: 'INFO',
    category: 'PROVIDER_MANAGEMENT',
  },
  {
    id: 'audit-7',
    timestamp: new Date(Date.now() - 25200000).toISOString(), // 7 hours ago
    userId: 'user-1',
    userEmail: 'admin@node2ai.ai',
    action: 'MULTI_PROVIDER_COMPARISON',
    resource: 'ai_request',
    resourceId: 'multi-101',
    details: {
      providers: ['openai', 'anthropic', 'google'],
      comparison_mode: 'parallel',
      total_cost: 0.15,
      best_provider: 'google',
      success: true,
      method: 'POST',
      endpoint: '/api/v1/chat/multi-provider',
    },
    organizationId: 'org-1',
    severity: 'INFO',
    category: 'AI_USAGE',
  },
  {
    id: 'audit-8',
    timestamp: new Date(Date.now() - 28800000).toISOString(), // 8 hours ago
    userId: 'user-4',
    userEmail: 'analyst@example.com',
    action: 'EXPORT_DATA',
    resource: 'analytics',
    resourceId: 'export-202',
    details: {
      data_type: 'usage_analytics',
      date_range: '2024-01-01 to 2024-01-31',
      record_count: 1500,
      success: true,
      method: 'GET',
      endpoint: '/api/v1/analytics/usage',
    },
    organizationId: 'org-1',
    severity: 'INFO',
    category: 'DATA_EXPORT',
  },
  {
    id: 'audit-9',
    timestamp: new Date(Date.now() - 32400000).toISOString(), // 9 hours ago
    userId: 'user-1',
    userEmail: 'admin@node2ai.ai',
    action: 'FAILED_LOGIN',
    resource: 'auth',
    resourceId: 'session-failed',
    details: {
      ip_address: '192.168.1.200',
      user_agent: 'curl/7.68.0',
      reason: 'Invalid credentials',
      success: false,
      method: 'POST',
      endpoint: '/api/v1/auth/login',
    },
    organizationId: 'org-1',
    severity: 'WARNING',
    category: 'AUTHENTICATION',
  },
  {
    id: 'audit-10',
    timestamp: new Date(Date.now() - 36000000).toISOString(), // 10 hours ago
    userId: 'user-2',
    userEmail: 'user@example.com',
    action: 'DELETE',
    resource: 'provider_key',
    resourceId: 'pk-old',
    details: {
      provider: 'perplexity',
      reason: 'Key compromised',
      success: true,
      method: 'DELETE',
      endpoint: '/api/v1/provider-keys/pk-old',
    },
    organizationId: 'org-1',
    severity: 'WARNING',
    category: 'PROVIDER_MANAGEMENT',
  },
];

/**
 * GET /api/v1/analytics/audit
 * Get audit logs with filtering and pagination
 */
export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { searchParams } = new URL(authRequest.url);

      // Parse query parameters
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');
      const severity = searchParams.get('severity');
      const category = searchParams.get('category');
      const action = searchParams.get('action');
      const userId = searchParams.get('userId');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const sortBy = searchParams.get('sortBy') || 'timestamp';
      const sortOrder = searchParams.get('sortOrder') || 'desc';

      // Filter logs based on query parameters
      let filteredLogs = [...mockAuditLogs];

      if (severity) {
        filteredLogs = filteredLogs.filter(
          log => log.severity.toLowerCase() === severity.toLowerCase()
        );
      }

      if (category) {
        filteredLogs = filteredLogs.filter(
          log => log.category.toLowerCase() === category.toLowerCase()
        );
      }

      if (action) {
        filteredLogs = filteredLogs.filter(
          log => log.action.toLowerCase() === action.toLowerCase()
        );
      }

      if (userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === userId);
      }

      if (startDate) {
        const start = new Date(startDate);
        filteredLogs = filteredLogs.filter(
          log => new Date(log.timestamp) >= start
        );
      }

      if (endDate) {
        const end = new Date(endDate);
        filteredLogs = filteredLogs.filter(
          log => new Date(log.timestamp) <= end
        );
      }

      // Sort logs
      filteredLogs.sort((a, b) => {
        const aValue = a[sortBy as keyof typeof a];
        const bValue = b[sortBy as keyof typeof b];

        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      // Apply pagination
      const totalCount = filteredLogs.length;
      const paginatedLogs = filteredLogs.slice(offset, offset + limit);

      // Calculate summary statistics
      const summary = {
        total_logs: totalCount,
        severity_distribution: {
          INFO: filteredLogs.filter(log => log.severity === 'INFO').length,
          WARNING: filteredLogs.filter(log => log.severity === 'WARNING')
            .length,
          ERROR: filteredLogs.filter(log => log.severity === 'ERROR').length,
          CRITICAL: filteredLogs.filter(log => log.severity === 'CRITICAL')
            .length,
        },
        category_distribution: filteredLogs.reduce(
          (acc, log) => {
            acc[log.category] = (acc[log.category] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        action_distribution: filteredLogs.reduce(
          (acc, log) => {
            acc[log.action] = (acc[log.action] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        recent_activity: {
          last_24h: filteredLogs.filter(
            log => new Date(log.timestamp) > new Date(Date.now() - 86400000)
          ).length,
          last_7d: filteredLogs.filter(
            log => new Date(log.timestamp) > new Date(Date.now() - 604800000)
          ).length,
        },
      };

      const response = {
        success: true,
        data: {
          audit_logs: paginatedLogs,
          pagination: {
            limit,
            offset,
            total_count: totalCount,
            has_more: offset + limit < totalCount,
            total_pages: Math.ceil(totalCount / limit),
            current_page: Math.floor(offset / limit) + 1,
          },
          summary,
          filters_applied: {
            severity,
            category,
            action,
            userId,
            startDate,
            endDate,
            sortBy,
            sortOrder,
          },
        },
        message: 'Audit logs retrieved successfully',
      };

      return NextResponse.json(response);
    } catch (error: any) {
      console.error('Audit logs retrieval error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve audit logs',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/analytics/audit
 * Create a new audit log entry (for testing purposes)
 */
export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await authRequest.json();

      const newAuditLog = {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: authRequest.auth?.userId || 'unknown',
        userEmail: 'test@example.com',
        action: body.action || 'TEST_ACTION',
        resource: body.resource || 'test_resource',
        resourceId: body.resourceId || `test-${Date.now()}`,
        details: {
          ...body.details,
          method: 'POST',
          endpoint: '/api/v1/analytics/audit',
          success: true,
        },
        organizationId: authRequest.auth?.organizationId || 'org-test',
        severity: body.severity || 'INFO',
        category: body.category || 'TESTING',
      };

      // Add to mock data (in a real system, this would be saved to database)
      mockAuditLogs.unshift(newAuditLog);

      return NextResponse.json(
        {
          success: true,
          data: {
            audit_log: newAuditLog,
          },
          message: 'Audit log created successfully',
        },
        { status: 201 }
      );
    } catch (error: any) {
      console.error('Audit log creation error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to create audit log',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
