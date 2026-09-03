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

// Mock users data (expanded from organization route)
const mockUsers = [
  {
    id: 'user-1',
    email: 'admin@node2ai.ai',
    name: 'Admin User',
    role: 'admin',
    status: 'active',
    permissions: ['*'],
    lastLoginAt: '2025-10-26T14:00:00Z',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2025-10-26T14:00:00Z',
    profile: {
      department: 'IT Administration',
      title: 'System Administrator',
      phone: '+1-555-0101',
      location: 'New York, NY',
    },
    usage: {
      totalRequests: 2500,
      requestsThisMonth: 150,
      lastActivityAt: '2025-10-26T14:00:00Z',
    },
  },
  {
    id: 'user-2',
    email: 'user@example.com',
    name: 'Regular User',
    role: 'user',
    status: 'active',
    permissions: ['read', 'write'],
    lastLoginAt: '2025-10-26T12:30:00Z',
    createdAt: '2024-02-01T09:15:00Z',
    updatedAt: '2025-10-26T12:30:00Z',
    profile: {
      department: 'Data Science',
      title: 'Data Analyst',
      phone: '+1-555-0102',
      location: 'San Francisco, CA',
    },
    usage: {
      totalRequests: 1200,
      requestsThisMonth: 85,
      lastActivityAt: '2025-10-26T12:30:00Z',
    },
  },
  {
    id: 'user-3',
    email: 'viewer@example.com',
    name: 'Viewer User',
    role: 'viewer',
    status: 'active',
    permissions: ['read'],
    lastLoginAt: '2025-10-25T16:45:00Z',
    createdAt: '2024-03-10T14:20:00Z',
    updatedAt: '2025-10-25T16:45:00Z',
    profile: {
      department: 'Compliance',
      title: 'Compliance Officer',
      phone: '+1-555-0103',
      location: 'Boston, MA',
    },
    usage: {
      totalRequests: 300,
      requestsThisMonth: 25,
      lastActivityAt: '2025-10-25T16:45:00Z',
    },
  },
  {
    id: 'user-4',
    email: 'analyst@example.com',
    name: 'Analytics User',
    role: 'user',
    status: 'active',
    permissions: ['read', 'write', 'analytics'],
    lastLoginAt: '2025-10-26T10:15:00Z',
    createdAt: '2024-04-05T11:30:00Z',
    updatedAt: '2025-10-26T10:15:00Z',
    profile: {
      department: 'Business Intelligence',
      title: 'Business Analyst',
      phone: '+1-555-0104',
      location: 'Chicago, IL',
    },
    usage: {
      totalRequests: 800,
      requestsThisMonth: 60,
      lastActivityAt: '2025-10-26T10:15:00Z',
    },
  },
  {
    id: 'user-5',
    email: 'inactive@example.com',
    name: 'Inactive User',
    role: 'user',
    status: 'inactive',
    permissions: ['read'],
    lastLoginAt: '2025-09-15T08:20:00Z',
    createdAt: '2024-05-20T13:45:00Z',
    updatedAt: '2025-09-15T08:20:00Z',
    profile: {
      department: 'Marketing',
      title: 'Marketing Specialist',
      phone: '+1-555-0105',
      location: 'Austin, TX',
    },
    usage: {
      totalRequests: 150,
      requestsThisMonth: 0,
      lastActivityAt: '2025-09-15T08:20:00Z',
    },
  },
];

// Request validation schemas
const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['admin', 'user', 'viewer']).default('user'),
  permissions: z.array(z.string()).optional(),
  profile: z
    .object({
      department: z.string().optional(),
      title: z.string().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
    })
    .optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  role: z.enum(['admin', 'user', 'viewer']).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  permissions: z.array(z.string()).optional(),
  profile: z
    .object({
      department: z.string().optional(),
      title: z.string().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
    })
    .optional(),
});

/**
 * GET /api/v1/organization/users
 * List organization users with filtering and pagination
 */
export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const { searchParams } = new URL(authRequest.url);

      // Parse query parameters
      const limit = parseInt(searchParams.get('limit') || '20');
      const offset = parseInt(searchParams.get('offset') || '0');
      const role = searchParams.get('role');
      const status = searchParams.get('status');
      const search = searchParams.get('search');
      const sortBy = searchParams.get('sortBy') || 'createdAt';
      const sortOrder = searchParams.get('sortOrder') || 'desc';

      // Filter users based on query parameters
      let filteredUsers = [...mockUsers];

      if (role) {
        filteredUsers = filteredUsers.filter(user => user.role === role);
      }

      if (status) {
        filteredUsers = filteredUsers.filter(user => user.status === status);
      }

      if (search) {
        const searchLower = search.toLowerCase();
        filteredUsers = filteredUsers.filter(
          user =>
            user.name.toLowerCase().includes(searchLower) ||
            user.email.toLowerCase().includes(searchLower) ||
            user.profile?.department?.toLowerCase().includes(searchLower) ||
            user.profile?.title?.toLowerCase().includes(searchLower)
        );
      }

      // Sort users
      filteredUsers.sort((a, b) => {
        const aValue = a[sortBy as keyof typeof a];
        const bValue = b[sortBy as keyof typeof b];

        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      // Apply pagination
      const totalCount = filteredUsers.length;
      const paginatedUsers = filteredUsers.slice(offset, offset + limit);

      // Calculate summary statistics
      const summary = {
        total_users: totalCount,
        active_users: filteredUsers.filter(user => user.status === 'active')
          .length,
        inactive_users: filteredUsers.filter(user => user.status === 'inactive')
          .length,
        role_distribution: {
          admin: filteredUsers.filter(user => user.role === 'admin').length,
          user: filteredUsers.filter(user => user.role === 'user').length,
          viewer: filteredUsers.filter(user => user.role === 'viewer').length,
        },
        recent_activity: {
          last_24h: filteredUsers.filter(
            user => new Date(user.lastLoginAt) > new Date(Date.now() - 86400000)
          ).length,
          last_7d: filteredUsers.filter(
            user =>
              new Date(user.lastLoginAt) > new Date(Date.now() - 604800000)
          ).length,
        },
      };

      const response = {
        success: true,
        data: {
          users: paginatedUsers,
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
            role,
            status,
            search,
            sortBy,
            sortOrder,
          },
        },
        message: 'Organization users retrieved successfully',
      };

      return NextResponse.json(response);
    } catch (error: any) {
      console.error('Organization users retrieval error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve organization users',
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
      const validatedData = CreateUserSchema.parse(body);

      // Check if user already exists
      const existingUser = mockUsers.find(
        user => user.email === validatedData.email
      );
      if (existingUser) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'User with this email already exists',
            error: 'USER_EXISTS',
          },
          { status: 409 }
        );
      }

      const newUser = {
        id: `user-${Date.now()}`,
        email: validatedData.email,
        name: validatedData.name,
        role: validatedData.role,
        status: 'active',
        permissions: validatedData.permissions || ['read'],
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        profile: {
          phone: validatedData.profile?.phone || '',
          title: validatedData.profile?.title || '',
          department: validatedData.profile?.department || '',
          location: validatedData.profile?.location || '',
        },
        usage: {
          totalRequests: 0,
          requestsThisMonth: 0,
          lastActivityAt: null,
        },
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
          message: 'Failed to add user to organization',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
