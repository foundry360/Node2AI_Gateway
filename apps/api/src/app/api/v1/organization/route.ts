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
    organizationId: 'org-1',
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

// Mock organization data
const mockOrganization = {
  id: 'org-1',
  name: 'Node2AI Enterprise',
  slug: 'node2ai-enterprise',
  description:
    'Enterprise AI orchestration platform for healthcare and compliance',
  domain: 'node2ai.ai',
  industry: 'Healthcare Technology',
  size: 'Enterprise',
  region: 'US-East',
  timezone: 'America/New_York',
  settings: {
    features: {
      multiProvider: true,
      piiSanitization: true,
      auditLogging: true,
      smartRouting: true,
      analytics: true,
      compliance: true,
    },
    limits: {
      maxUsers: 1000,
      maxProviderKeys: 50,
      maxRequestsPerMonth: 1000000,
      maxDataProcessingGB: 1000,
    },
    compliance: {
      hipaa: true,
      soc2: true,
      gdpr: true,
      iso27001: false,
    },
    security: {
      mfaRequired: true,
      sessionTimeout: 3600,
      passwordPolicy: 'strong',
      ipWhitelist: false,
    },
  },
  billing: {
    plan: 'Enterprise',
    status: 'active',
    monthlySpend: 2500.0,
    currency: 'USD',
    billingCycle: 'monthly',
    nextBillingDate: '2025-11-26T00:00:00Z',
  },
  statistics: {
    totalUsers: 45,
    activeUsers: 38,
    totalProviderKeys: 12,
    activeProviderKeys: 10,
    totalRequests: 125000,
    requestsThisMonth: 15000,
    dataProcessedGB: 250.5,
    averageLatency: 1200,
    uptime: 99.9,
  },
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2025-10-26T14:30:00Z',
  isActive: true,
};

// Mock users data
const mockUsers = [
  {
    id: 'user-1',
    email: 'admin@node2ai.ai',
    name: 'Admin User',
    role: 'admin',
    status: 'active',
    lastLoginAt: '2025-10-26T14:00:00Z',
    createdAt: '2024-01-15T10:30:00Z',
  },
  {
    id: 'user-2',
    email: 'user@example.com',
    name: 'Regular User',
    role: 'user',
    status: 'active',
    lastLoginAt: '2025-10-26T12:30:00Z',
    createdAt: '2024-02-01T09:15:00Z',
  },
  {
    id: 'user-3',
    email: 'viewer@example.com',
    name: 'Viewer User',
    role: 'viewer',
    status: 'active',
    lastLoginAt: '2025-10-25T16:45:00Z',
    createdAt: '2024-03-10T14:20:00Z',
  },
];

// Request validation schemas
const UpdateOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').optional(),
  description: z.string().optional(),
  industry: z.string().optional(),
  timezone: z.string().optional(),
  settings: z
    .object({
      features: z
        .object({
          multiProvider: z.boolean().optional(),
          piiSanitization: z.boolean().optional(),
          auditLogging: z.boolean().optional(),
          smartRouting: z.boolean().optional(),
          analytics: z.boolean().optional(),
          compliance: z.boolean().optional(),
        })
        .optional(),
      limits: z
        .object({
          maxUsers: z.number().positive().optional(),
          maxProviderKeys: z.number().positive().optional(),
          maxRequestsPerMonth: z.number().positive().optional(),
          maxDataProcessingGB: z.number().positive().optional(),
        })
        .optional(),
      security: z
        .object({
          mfaRequired: z.boolean().optional(),
          sessionTimeout: z.number().positive().optional(),
          passwordPolicy: z.enum(['basic', 'strong', 'enterprise']).optional(),
          ipWhitelist: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * GET /api/v1/organization
 * Get organization information
 */
export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const organizationId = authRequest.auth?.organizationId;

      // Return organization info with users
      const response = {
        success: true,
        data: {
          organization: {
            ...mockOrganization,
            id: organizationId,
          },
          users: mockUsers,
          summary: {
            totalUsers: mockUsers.length,
            activeUsers: mockUsers.filter(u => u.status === 'active').length,
            adminUsers: mockUsers.filter(u => u.role === 'admin').length,
            userUsers: mockUsers.filter(u => u.role === 'user').length,
            viewerUsers: mockUsers.filter(u => u.role === 'viewer').length,
          },
        },
        message: 'Organization information retrieved successfully',
      };

      return NextResponse.json(response);
    } catch (error: any) {
      console.error('Organization info retrieval error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve organization information',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/organization
 * Update organization information
 */
export async function PUT(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await authRequest.json();
      const validatedData = UpdateOrganizationSchema.parse(body);

      const organizationId = authRequest.auth?.organizationId;

      // Update organization data (in a real system, this would be saved to database)
      const updatedOrganization = {
        ...mockOrganization,
        id: organizationId,
        ...validatedData,
        settings: {
          ...mockOrganization.settings,
          ...validatedData.settings,
          features: {
            ...mockOrganization.settings.features,
            ...validatedData.settings?.features,
          },
          limits: {
            ...mockOrganization.settings.limits,
            ...validatedData.settings?.limits,
          },
          security: {
            ...mockOrganization.settings.security,
            ...validatedData.settings?.security,
          },
        },
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        data: {
          organization: updatedOrganization,
        },
        message: 'Organization updated successfully',
      });
    } catch (error: any) {
      console.error('Organization update error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Invalid request data',
            error: error.errors
              .map(e => `${e.path.join('.')}: ${e.message}`)
              .join(', '),
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to update organization',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/organization/users
 * Add a new user to the organization
 */
export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await authRequest.json();

      const newUser = {
        id: `user-${Date.now()}`,
        email: body.email || 'newuser@example.com',
        name: body.name || 'New User',
        role: body.role || 'user',
        status: 'active',
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
      };

      // Add to mock users (in a real system, this would be saved to database)
      mockUsers.push(newUser);

      return NextResponse.json(
        {
          success: true,
          data: {
            user: newUser,
          },
          message: 'User added to organization successfully',
        },
        { status: 201 }
      );
    } catch (error: any) {
      console.error('Add user error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to add user to organization',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
