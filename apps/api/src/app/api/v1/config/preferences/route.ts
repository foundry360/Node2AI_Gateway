import { NextRequest, NextResponse } from 'next/server';
import { ConfigurationService } from '../../../../../lib/config/config-service';
import { z } from 'zod';

// Initialize configuration service (in a real app, this would be a singleton)
const configService = new ConfigurationService();

// Request validation schema for user preferences
const UserPreferencesSchema = z.object({
  ui: z
    .object({
      theme: z.enum(['light', 'dark', 'auto']).optional(),
      language: z.string().optional(),
      timezone: z.string().optional(),
      date_format: z.string().optional(),
      time_format: z.enum(['12h', '24h']).optional(),
      dashboard_layout: z
        .enum(['compact', 'comfortable', 'spacious'])
        .optional(),
      sidebar_collapsed: z.boolean().optional(),
      notifications_enabled: z.boolean().optional(),
    })
    .optional(),
  ai: z
    .object({
      default_model: z.string().optional(),
      default_temperature: z.number().min(0).max(2).optional(),
      default_max_tokens: z.number().min(1).max(100000).optional(),
      auto_sanitize: z.boolean().optional(),
      preferred_providers: z.array(z.string()).optional(),
      excluded_models: z.array(z.string()).optional(),
      optimization_strategy: z
        .enum(['cost', 'speed', 'quality', 'balanced'])
        .optional(),
      budget_limit: z.number().min(0).max(1).optional(),
      quality_threshold: z.number().min(0).max(1).optional(),
    })
    .optional(),
  notifications: z
    .object({
      email_notifications: z.boolean().optional(),
      push_notifications: z.boolean().optional(),
      slack_notifications: z.boolean().optional(),
      notification_frequency: z
        .enum(['immediate', 'hourly', 'daily', 'weekly'])
        .optional(),
      notification_types: z
        .object({
          system_alerts: z.boolean().optional(),
          usage_warnings: z.boolean().optional(),
          cost_alerts: z.boolean().optional(),
          security_alerts: z.boolean().optional(),
          maintenance_notices: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  privacy: z
    .object({
      data_sharing_enabled: z.boolean().optional(),
      analytics_enabled: z.boolean().optional(),
      error_reporting_enabled: z.boolean().optional(),
      usage_tracking_enabled: z.boolean().optional(),
      personalization_enabled: z.boolean().optional(),
    })
    .optional(),
  api: z
    .object({
      default_timeout: z.number().min(1000).optional(),
      retry_attempts: z.number().min(0).max(10).optional(),
      rate_limit_preference: z
        .enum(['conservative', 'moderate', 'aggressive'])
        .optional(),
      response_format: z.enum(['json', 'stream']).optional(),
      include_metadata: z.boolean().optional(),
      include_costs: z.boolean().optional(),
      include_performance_metrics: z.boolean().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'User ID is required',
          error: 'Missing user_id parameter',
        },
        { status: 400 }
      );
    }

    const preferences = configService.getUserPreferences(userId);

    if (!preferences) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'User preferences not found',
          error: 'User preferences not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        preferences,
        user_id: userId,
        last_updated: new Date().toISOString(),
      },
      message: 'User preferences retrieved successfully',
    });
  } catch (error: any) {
    console.error('User preferences retrieval error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve user preferences',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, organization_id, preferences } = body;

    if (!user_id || !organization_id) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'User ID and Organization ID are required',
          error: 'Missing required parameters',
        },
        { status: 400 }
      );
    }

    const validatedData = UserPreferencesSchema.parse(preferences);

    // Get user ID from auth context (mock for now)
    const updatedBy = 'user-123';

    const validation = await configService.updateUserPreferences(
      user_id,
      organization_id,
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
          message: 'Preferences validation failed',
          error: 'Invalid preferences data',
        },
        { status: 400 }
      );
    }

    const updatedPreferences = configService.getUserPreferences(user_id);

    return NextResponse.json({
      success: true,
      data: {
        preferences: updatedPreferences,
        validation,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      message: 'User preferences updated successfully',
    });
  } catch (error: any) {
    console.error('User preferences update error:', error);

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
        message: 'User preferences update failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
