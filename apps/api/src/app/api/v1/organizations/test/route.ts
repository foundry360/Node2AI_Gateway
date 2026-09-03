import { NextRequest, NextResponse } from 'next/server';
import { OrganizationService } from '@/lib/organization/organization-service';
import { ApiKeyService } from '@/lib/organization/api-key-service';

export async function GET(request: NextRequest) {
  try {
    const organizationService = new OrganizationService();
    const apiKeyService = new ApiKeyService();

    // Create a test organization
    const testOrg = await organizationService.createOrganization({
      name: 'Test Organization',
      tier: 'business',
      deployment_mode: 'cloud',
      created_by: 'test-admin',
    });

    // Create a test API key
    const testApiKey = await apiKeyService.createApiKey({
      organization_id: testOrg.id,
      name: 'Test API Key',
      description: 'Test API key for demonstration',
      scopes: ['read', 'write'],
      rate_limit: 100,
      created_by: 'test-admin',
    });

    // Get organization stats
    const orgStats = organizationService.getOrganizationStats(testOrg.id);
    const usageLimits = organizationService.checkUsageLimits(testOrg.id);

    // Get API key stats
    const apiKeyStats = apiKeyService.getApiKeyStats(testOrg.id);

    // Test API key validation
    const validation = apiKeyService.validateApiKey(testApiKey.key);
    const rateLimit = apiKeyService.checkRateLimit(testApiKey.id);

    return NextResponse.json({
      success: true,
      data: {
        organization: {
          id: testOrg.id,
          name: testOrg.name,
          tier: testOrg.tier,
          deployment_mode: testOrg.deployment_mode,
          usage_limits: testOrg.usage_limits,
          settings: testOrg.settings,
          created_at: testOrg.created_at,
        },
        api_key: {
          id: testApiKey.id,
          key: testApiKey.key.substring(0, 20) + '...', // Mask for security
          name: testApiKey.name,
          scopes: testApiKey.scopes,
          rate_limit: testApiKey.rate_limit,
          is_active: testApiKey.is_active,
          created_at: testApiKey.created_at,
        },
        organization_stats: orgStats,
        usage_limits_status: usageLimits,
        api_key_stats: apiKeyStats,
        validation_test: {
          valid: validation.valid,
          error: validation.error,
        },
        rate_limit_test: {
          requests_per_minute: rateLimit.requests_per_minute,
          requests_this_minute: rateLimit.requests_this_minute,
          is_limited: rateLimit.is_limited,
          reset_time: rateLimit.reset_time,
        },
      },
      message:
        'Organization and API key management test completed successfully',
    });
  } catch (error: any) {
    console.error('Organization test error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Organization test failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
