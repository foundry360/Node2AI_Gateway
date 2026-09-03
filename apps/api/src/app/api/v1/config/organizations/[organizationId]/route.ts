import { NextRequest, NextResponse } from 'next/server';
import { ConfigurationService } from '../../../../../../lib/config/config-service';
import { z } from 'zod';

// Initialize configuration service (in a real app, this would be a singleton)
const configService = new ConfigurationService();

// Request validation schema for organization settings
const OrganizationSettingsSchema = z.object({
  profile: z
    .object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      industry: z.string().optional(),
      size: z
        .enum(['startup', 'small', 'medium', 'large', 'enterprise'])
        .optional(),
      region: z.string().optional(),
      timezone: z.string().optional(),
      currency: z.string().optional(),
    })
    .optional(),
  limits: z
    .object({
      requests_per_month: z.number().min(1).optional(),
      cost_limit_monthly: z.number().min(0).optional(),
      max_api_keys: z.number().min(1).optional(),
      max_users: z.number().min(1).optional(),
      max_file_uploads_per_day: z.number().min(1).optional(),
      max_storage_gb: z.number().min(1).optional(),
      max_concurrent_requests: z.number().min(1).optional(),
    })
    .optional(),
  security: z
    .object({
      password_policy: z
        .object({
          min_length: z.number().min(8).optional(),
          require_uppercase: z.boolean().optional(),
          require_lowercase: z.boolean().optional(),
          require_numbers: z.boolean().optional(),
          require_special_chars: z.boolean().optional(),
          max_age_days: z.number().min(30).optional(),
          prevent_reuse_count: z.number().min(1).optional(),
        })
        .optional(),
      session_settings: z
        .object({
          timeout_minutes: z.number().min(5).optional(),
          max_concurrent_sessions: z.number().min(1).optional(),
          require_reauth_for_sensitive_actions: z.boolean().optional(),
        })
        .optional(),
      ip_whitelist: z.array(z.string()).optional(),
      ip_blacklist: z.array(z.string()).optional(),
      geo_restrictions: z.array(z.string()).optional(),
      two_factor_required: z.boolean().optional(),
      sso_required: z.boolean().optional(),
    })
    .optional(),
  compliance: z
    .object({
      data_residency: z.array(z.string()).optional(),
      encryption_required: z.boolean().optional(),
      audit_logging_required: z.boolean().optional(),
      data_retention_policy_days: z.number().min(30).optional(),
      gdpr_compliance: z.boolean().optional(),
      hipaa_compliance: z.boolean().optional(),
      sox_compliance: z.boolean().optional(),
      pci_compliance: z.boolean().optional(),
    })
    .optional(),
  features: z
    .object({
      sanitization: z.boolean().optional(),
      rag: z.boolean().optional(),
      model_comparison: z.boolean().optional(),
      smart_routing: z.boolean().optional(),
      local_llm: z.boolean().optional(),
      analytics: z.boolean().optional(),
      audit_logs: z.boolean().optional(),
      compliance_reports: z.boolean().optional(),
      sso: z.boolean().optional(),
      api_access: z.boolean().optional(),
      web_dashboard: z.boolean().optional(),
    })
    .optional(),
  integrations: z
    .object({
      webhooks_enabled: z.boolean().optional(),
      slack_enabled: z.boolean().optional(),
      teams_enabled: z.boolean().optional(),
      email_enabled: z.boolean().optional(),
      custom_integrations: z.array(z.string()).optional(),
    })
    .optional(),
  custom: z.record(z.any()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { organizationId: string } }
) {
  try {
    const { organizationId } = params;

    const settings = configService.getOrganizationSettings(organizationId);

    if (!settings) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Organization settings not found',
          error: 'Organization settings not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        organization_settings: settings,
        organization_id: organizationId,
        last_updated: new Date().toISOString(),
      },
      message: 'Organization settings retrieved successfully',
    });
  } catch (error: any) {
    console.error('Organization settings retrieval error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve organization settings',
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
    const validatedData = OrganizationSettingsSchema.parse(body);

    // Get user ID from auth context (mock for now)
    const updatedBy = 'admin-user-123';

    const validation = await configService.updateOrganizationSettings(
      organizationId,
      validatedData,
      updatedBy
    );

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          data: {
            validation,
          },
          message: 'Organization settings validation failed',
          error: 'Invalid organization settings data',
        },
        { status: 400 }
      );
    }

    const updatedSettings =
      configService.getOrganizationSettings(organizationId);

    return NextResponse.json({
      success: true,
      data: {
        organization_settings: updatedSettings,
        validation,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      message: 'Organization settings updated successfully',
    });
  } catch (error: any) {
    console.error('Organization settings update error:', error);

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
        message: 'Organization settings update failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
