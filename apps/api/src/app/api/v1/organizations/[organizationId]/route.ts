import { NextRequest, NextResponse } from 'next/server';
import { OrganizationService } from '@/lib/organization/organization-service';
import { z } from 'zod';

// Initialize organization service (in a real app, this would be a singleton)
const organizationService = new OrganizationService();

// Request validation schema
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

export async function GET(
  request: NextRequest,
  { params }: { params: { organizationId: string } }
) {
  try {
    const { organizationId } = params;
    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get('include_stats') === 'true';

    const organization =
      await organizationService.getOrganization(organizationId);

    if (!organization) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Organization not found',
          error: 'Organization not found',
        },
        { status: 404 }
      );
    }

    const responseData: any = {
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
    };

    if (includeStats) {
      const stats = organizationService.getOrganizationStats(organizationId);
      const usageLimits = organizationService.checkUsageLimits(organizationId);

      responseData.statistics = stats;
      responseData.usage_limits_status = usageLimits;
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      message: 'Organization retrieved successfully',
    });
  } catch (error: any) {
    console.error('Organization retrieval error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve organization',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { organizationId: string } }
) {
  try {
    const { organizationId } = params;
    const body = await request.json();
    const validatedData = UpdateOrganizationSchema.parse(body);

    // Get user ID from auth context (mock for now)
    const updatedBy = 'admin-user-123';

    const organization = await organizationService.updateOrganization(
      organizationId,
      validatedData,
      updatedBy
    );

    if (!organization) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Organization not found',
          error: 'Organization not found',
        },
        { status: 404 }
      );
    }

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
        message: 'Organization update failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { organizationId: string } }
) {
  try {
    const { organizationId } = params;

    // Get user ID from auth context (mock for now)
    const deletedBy = 'admin-user-123';

    const deleted = await organizationService.deleteOrganization(
      organizationId,
      deletedBy
    );

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Organization not found',
          error: 'Organization not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        deleted_organization_id: organizationId,
      },
      message: 'Organization deleted successfully',
    });
  } catch (error: any) {
    console.error('Organization deletion error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Organization deletion failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
