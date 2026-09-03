import { NextRequest, NextResponse } from 'next/server';
import { OrganizationService } from '@/lib/organization/organization-service';
import { z } from 'zod';

// Initialize organization service (in a real app, this would be a singleton)
const organizationService = new OrganizationService();

// Request validation schemas
const CreateOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  tier: z.enum(['developer', 'team', 'business', 'enterprise']),
  deployment_mode: z.enum(['cloud', 'hybrid', 'airgap']),
  license_key: z.string().optional(),
  usage_limits: z
    .object({
      requests_per_month: z.number().min(1).optional(),
      cost_limit_monthly: z.number().min(0).optional(),
      max_api_keys: z.number().min(1).optional(),
      max_users: z.number().min(1).optional(),
    })
    .optional(),
});

const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  tier: z.enum(['developer', 'team', 'business', 'enterprise']).optional(),
  deployment_mode: z.enum(['cloud', 'hybrid', 'airgap']).optional(),
  usage_limits: z
    .object({
      requests_per_month: z.number().min(1).optional(),
      cost_limit_monthly: z.number().min(0).optional(),
      max_api_keys: z.number().min(1).optional(),
      max_users: z.number().min(1).optional(),
    })
    .optional(),
  settings: z
    .object({
      allow_sso: z.boolean().optional(),
      require_2fa: z.boolean().optional(),
      data_retention_days: z.number().min(1).optional(),
      audit_log_retention_days: z.number().min(1).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CreateOrganizationSchema.parse(body);

    // Get user ID from auth context (mock for now)
    const createdBy = 'admin-user-123';

    const organization = await organizationService.createOrganization({
      ...validatedData,
      created_by: createdBy,
    });

    return NextResponse.json({
      success: true,
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          tier: organization.tier,
          deployment_mode: organization.deployment_mode,
          license_key: organization.license_key,
          license_expires_at: organization.license_expires_at,
          usage_limits: organization.usage_limits,
          settings: organization.settings,
          created_at: organization.created_at,
          updated_at: organization.updated_at,
          created_by: organization.created_by,
        },
      },
      message: 'Organization created successfully',
    });
  } catch (error: any) {
    console.error('Organization creation error:', error);

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
        message: 'Organization creation failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const organizations = await organizationService.listOrganizations();

    return NextResponse.json({
      success: true,
      data: {
        organizations: organizations.map(org => ({
          id: org.id,
          name: org.name,
          tier: org.tier,
          deployment_mode: org.deployment_mode,
          usage_limits: org.usage_limits,
          settings: org.settings,
          created_at: org.created_at,
          updated_at: org.updated_at,
          created_by: org.created_by,
        })),
        total_count: organizations.length,
      },
      message: 'Organizations retrieved successfully',
    });
  } catch (error: any) {
    console.error('Organization listing error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve organizations',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
