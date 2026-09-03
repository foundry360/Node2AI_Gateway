import { NextRequest, NextResponse } from 'next/server';
import { ConfigurationService } from '../../../../../lib/config/config-service';
import { z } from 'zod';

// Initialize configuration service (in a real app, this would be a singleton)
const configService = new ConfigurationService();

// Request validation schema for system config updates
const SystemConfigUpdateSchema = z.object({
  deployment_mode: z.enum(['cloud', 'hybrid', 'airgap']).optional(),
  api: z
    .object({
      port: z.number().min(1).max(65535).optional(),
      host: z.string().optional(),
      cors_origins: z.array(z.string()).optional(),
      rate_limit_max_requests: z.number().min(1).optional(),
      request_timeout_ms: z.number().min(1000).optional(),
      max_request_size_mb: z.number().min(1).optional(),
    })
    .optional(),
  database: z
    .object({
      pool_size: z.number().min(1).max(100).optional(),
      connection_timeout_ms: z.number().min(1000).optional(),
      query_timeout_ms: z.number().min(1000).optional(),
    })
    .optional(),
  security: z
    .object({
      password_min_length: z.number().min(8).optional(),
      session_timeout: z.number().min(300).optional(),
      two_factor_required: z.boolean().optional(),
      sso_enabled: z.boolean().optional(),
      audit_log_retention_days: z.number().min(30).optional(),
    })
    .optional(),
  ai_models: z
    .object({
      default_provider: z
        .enum(['openai', 'anthropic', 'google', 'ollama'])
        .optional(),
      model_selection_strategy: z
        .enum(['cost', 'speed', 'quality', 'balanced'])
        .optional(),
      max_tokens_per_request: z.number().min(1).max(100000).optional(),
      temperature_default: z.number().min(0).max(2).optional(),
      timeout_per_request_ms: z.number().min(1000).optional(),
      retry_attempts: z.number().min(0).max(10).optional(),
    })
    .optional(),
  sanitization: z
    .object({
      enabled: z.boolean().optional(),
      auto_sanitize: z.boolean().optional(),
      pii_detection_enabled: z.boolean().optional(),
      phi_detection_enabled: z.boolean().optional(),
      audit_level: z.enum(['BASIC', 'DETAILED', 'COMPREHENSIVE']).optional(),
    })
    .optional(),
  compliance: z
    .object({
      gdpr_enabled: z.boolean().optional(),
      hipaa_enabled: z.boolean().optional(),
      sox_enabled: z.boolean().optional(),
      pci_enabled: z.boolean().optional(),
      encryption_at_rest: z.boolean().optional(),
      encryption_in_transit: z.boolean().optional(),
      data_retention_policy_days: z.number().min(30).optional(),
    })
    .optional(),
  monitoring: z
    .object({
      metrics_enabled: z.boolean().optional(),
      health_checks_enabled: z.boolean().optional(),
      log_level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
      log_retention_days: z.number().min(1).optional(),
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
      multi_tenant: z.boolean().optional(),
      offline_mode: z.boolean().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeSensitive = searchParams.get('include_sensitive') === 'true';

    const systemConfig = configService.getSystemConfig();

    // Remove sensitive information unless explicitly requested
    if (!includeSensitive) {
      delete systemConfig.security.jwt_secret;
      delete systemConfig.security.encryption_key;
      delete systemConfig.license_key;
    }

    return NextResponse.json({
      success: true,
      data: {
        system_config: systemConfig,
        last_updated: new Date().toISOString(),
        version: '1.0.0',
      },
      message: 'System configuration retrieved successfully',
    });
  } catch (error: any) {
    console.error('System config retrieval error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve system configuration',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = SystemConfigUpdateSchema.parse(body);

    // Get user ID from auth context (mock for now)
    const updatedBy = 'admin-user-123';
    const reason = body.reason || 'System configuration update';

    const validation = await configService.updateSystemConfig(
      validatedData,
      updatedBy,
      reason
    );

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          data: {
            validation,
          },
          message: 'Configuration validation failed',
          error: 'Invalid configuration data',
        },
        { status: 400 }
      );
    }

    const updatedConfig = configService.getSystemConfig();

    return NextResponse.json({
      success: true,
      data: {
        system_config: updatedConfig,
        validation,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      message: 'System configuration updated successfully',
    });
  } catch (error: any) {
    console.error('System config update error:', error);

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
        message: 'System configuration update failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
