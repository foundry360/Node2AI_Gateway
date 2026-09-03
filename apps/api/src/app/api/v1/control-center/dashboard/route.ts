import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { query } from '../../../../../lib/db/postgres-client';
import {
  getCache,
  setCache,
  getRedisStats,
  isRedisAvailable,
} from '../../../../../lib/cache/redis-client';

const CACHE_DURATION = 5; // 5 seconds (Redis TTL)
const CACHE_KEY_PREFIX = 'dashboard:';

async function getDashboardData(organizationId: string) {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  try {
    // Fetch usage statistics from the last hour
    const usageStats = await query(
      `SELECT 
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status = 'error') as error_count,
        AVG(latency_ms) as avg_latency,
        SUM(tokens_input + tokens_output) as total_tokens,
        SUM(cost) as total_cost
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= $2`,
      [organizationId, oneHourAgo]
    );

    // Fetch recent requests for request volume chart
    // Look at last 24 hours grouped by hour
    const requestVolume = await query(
      `WITH events AS (
         SELECT (timestamp AT TIME ZONE 'UTC') AS ts_utc
         FROM usage_events
         WHERE organization_id = $1
           AND timestamp >= NOW() - INTERVAL '24 hours'
       )
       SELECT 
         (date_trunc('hour', ts_utc) 
           + make_interval(mins => ((extract(minute from ts_utc)::int / 30) * 30))
         ) AS bucket_utc,
         COUNT(*) as count
       FROM events
       GROUP BY bucket_utc
       ORDER BY bucket_utc DESC`,
      [organizationId]
    );

    // Fetch all providers with API keys configured
    const providerKeysData = await query(
      `SELECT provider
      FROM provider_keys
      WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    const configuredProviders = providerKeysData.rows.map((row: any) =>
      row.provider.toLowerCase()
    );

    // Fetch provider statistics from usage events
    const providerStats = await query(
      `SELECT 
        provider,
        COUNT(*) as request_count,
        AVG(latency_ms) as avg_latency,
        COUNT(*) FILTER (WHERE status = 'error') as error_count
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= $2
      GROUP BY provider`,
      [organizationId, oneHourAgo]
    );

    // Create a map of provider stats from usage events
    const providerStatsMap = new Map<string, any>();
    providerStats.rows.forEach((row: any) => {
      providerStatsMap.set(row.provider.toLowerCase(), {
        requestCount: parseInt(row.request_count || '0'),
        avgLatency: parseFloat(row.avg_latency || '0'),
        errorCount: parseInt(row.error_count || '0'),
      });
    });

    // Fetch sanitization stats
    const sanitizationStats = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE data_sanitized = true) as sanitized_count,
        SUM(sanitization_count) as total_sanitizations
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= $2`,
      [organizationId, oneHourAgo]
    );

    // Fetch recent errors
    const recentErrors = await query(
      `SELECT 
        timestamp,
        error_message as message,
        provider
      FROM usage_events
      WHERE organization_id = $1 
        AND status = 'error'
        AND error_message IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 5`,
      [organizationId]
    );

    // Count active API keys
    const apiKeysCount = await query(
      `SELECT COUNT(*) as count
      FROM api_keys
      WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    // Count active users
    const usersCount = await query(
      `SELECT COUNT(*) as count
      FROM users
      WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    // Count active provider keys
    const providerKeysCount = await query(
      `SELECT COUNT(*) as count
      FROM provider_keys
      WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    // Get active requests (requests in the last 5 minutes)
    const activeRequestsData = await query(
      `SELECT COUNT(*) as count
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= NOW() - INTERVAL '5 minutes'`,
      [organizationId]
    );

    // Get previous period count for change calculation
    const prevPeriodRequests = await query(
      `SELECT COUNT(*) as count
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= NOW() - INTERVAL '10 minutes'
        AND timestamp < NOW() - INTERVAL '5 minutes'`,
      [organizationId]
    );

    const currentRequests = parseInt(activeRequestsData.rows[0]?.count || '0');
    const prevRequests = parseInt(prevPeriodRequests.rows[0]?.count || '0');
    const requestChange = currentRequests - prevRequests;

    // Calculate error rate
    const totalRequests = parseInt(usageStats.rows[0]?.total_requests || '0');
    const errorCount = parseInt(usageStats.rows[0]?.error_count || '0');
    const errorRate =
      totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    // Calculate previous error rate for trend
    const prevErrorStats = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'error') as errors
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= $2
        AND timestamp < $3`,
      [organizationId, new Date(now - 2 * 60 * 60 * 1000), oneHourAgo]
    );
    const prevTotal = parseInt(prevErrorStats.rows[0]?.total || '0');
    const prevErrors = parseInt(prevErrorStats.rows[0]?.errors || '0');
    const prevErrorRate = prevTotal > 0 ? (prevErrors / prevTotal) * 100 : 0;
    const errorTrend = errorRate <= prevErrorRate ? 'down' : 'up';

    // Calculate Queue Depth
    // Estimate in-flight requests based on requests in the last 30 seconds
    // (requests that likely started but haven't completed yet)
    const queueDepthData = await query(
      `SELECT COUNT(*) as count
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= NOW() - INTERVAL '30 seconds'`,
      [organizationId]
    );
    const queueDepth = parseInt(queueDepthData.rows[0]?.count || '0');
    let queueStatus: 'normal' | 'high' | 'critical' = 'normal';
    if (queueDepth > 100) {
      queueStatus = 'critical';
    } else if (queueDepth > 50) {
      queueStatus = 'high';
    }

    // Calculate Rate Limits warnings
    // Check which API keys are approaching or exceeding their rate limits
    const rateLimitCheck = await query(
      `SELECT 
        ak.id,
        ak.name,
        ak.rate_limit_per_minute,
        COUNT(ue.id) as requests_last_minute,
        CASE 
          WHEN COUNT(ue.id) >= ak.rate_limit_per_minute THEN 'exceeded'
          WHEN COUNT(ue.id) >= ak.rate_limit_per_minute * 0.8 THEN 'warning'
          ELSE 'ok'
        END as status
      FROM api_keys ak
      LEFT JOIN usage_events ue ON ue.api_key_id = ak.id
        AND ue.timestamp >= NOW() - INTERVAL '1 minute'
      WHERE ak.organization_id = $1 
        AND ak.is_active = true
      GROUP BY ak.id, ak.name, ak.rate_limit_per_minute
      HAVING COUNT(ue.id) >= ak.rate_limit_per_minute * 0.8`,
      [organizationId]
    );
    const rateLimitWarnings = rateLimitCheck.rows.length;

    // Provider display name mapping
    const providerDisplayNames: { [key: string]: string } = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      perplexity: 'Perplexity',
      local: 'Local',
    };

    // Map all providers with API keys, merging with usage stats if available
    const providers = configuredProviders.map((provider: string) => {
      const stats = providerStatsMap.get(provider) || {
        requestCount: 0,
        avgLatency: 0,
        errorCount: 0,
      };

      const avgLatency = stats.avgLatency;
      const errors = stats.errorCount;
      const requests = stats.requestCount;

      let status: 'healthy' | 'slow' | 'down' = 'healthy';

      // If there are errors and requests, determine status
      if (requests > 0) {
        if (errors > requests * 0.1) {
          status = 'down';
        } else if (avgLatency > 3000) {
          status = 'slow';
        }
      }
      // If no usage yet (0 latency), default to healthy (they have keys configured)

      return {
        name:
          providerDisplayNames[provider] ||
          provider.charAt(0).toUpperCase() + provider.slice(1),
        status,
        latency: requests > 0 ? Math.round(avgLatency) : 0, // 0 if no usage yet
      };
    });

    // Format request volume data
    const volumeData = requestVolume.rows.map((row: any) => ({
      // normalize to ms since epoch for the start of the 30-min bucket (UTC)
      bucketMs: new Date(row.bucket_utc + 'Z').getTime(),
      count: parseInt(row.count || '0'),
    }));

    // Fill in missing time slots with 0
    // Always show 24 hours worth of hourly data points (last 24 hours)
    const filledVolumeData: Array<{ time: string; count: number }> = [];
    const nowUtcMs = Date.now();
    // Align to current 30-min bucket start in UTC
    const currentBucketUtcMs =
      Math.floor(nowUtcMs / (30 * 60 * 1000)) * (30 * 60 * 1000);
    const dataMap = new Map(volumeData.map(v => [v.bucketMs, v.count]));

    // Generate 24 hours worth of 30-minute data points (48 buckets)
    for (let i = 47; i >= 0; i--) {
      const bucketStartMs = currentBucketUtcMs - i * 30 * 60 * 1000;
      const bucketCount = dataMap.get(bucketStartMs) || 0;
      filledVolumeData.push({
        time: new Date(bucketStartMs).toISOString(),
        count: bucketCount,
      });
    }

    // Format recent errors
    const errorsList = recentErrors.rows.map((row: any) => ({
      timestamp: new Date(row.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      severity: 'error' as const,
      message:
        row.message || `Error from ${row.provider || 'unknown'} provider`,
    }));

    // Get database connection stats and performance
    const dbStats = await query(
      `SELECT 
        count(*) as active_connections
      FROM pg_stat_activity
      WHERE datname = current_database() AND state = 'active'`,
      []
    );

    // Get database query performance (average from recent queries in usage_events)
    const dbPerformance = await query(
      `SELECT 
        AVG(latency_ms) as avg_query_time_ms,
        COUNT(*) as total_queries
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= $2`,
      [organizationId, oneHourAgo]
    );

    // Define all available models for each provider
    const allModels: { [provider: string]: string[] } = {
      openai: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo'],
      anthropic: [
        'claude-3-opus',
        'claude-3-sonnet',
        'claude-3-haiku',
        'claude-3.5-sonnet',
        'claude-3.5-haiku',
      ],
      google: ['gemini-pro', 'gemini-1.5-pro'],
      perplexity: [
        'sonar',
        'sonar-pro',
        'llama-3.1-sonar-small-128k-chat',
        'llama-3.1-sonar-large-128k-chat',
      ],
    };

    // Get all models from configured providers
    const allConfiguredModels: Array<{ provider: string; model: string }> = [];
    configuredProviders.forEach((provider: string) => {
      const providerModels = allModels[provider] || [];
      providerModels.forEach((model: string) => {
        allConfiguredModels.push({ provider, model });
      });
    });

    // Get model statistics for AI Models cards (requests, tokens, cost)
    const modelStats = await query(
      `SELECT 
        model,
        provider,
        COUNT(*) as request_count,
        SUM(tokens_input + tokens_output) as total_tokens,
        SUM(cost) as total_cost,
        AVG(latency_ms) as avg_latency,
        COUNT(*) FILTER (WHERE status = 'error') as error_count,
        MAX(timestamp) as last_used
      FROM usage_events
      WHERE organization_id = $1 
        AND timestamp >= $2
      GROUP BY model, provider`,
      [organizationId, oneDayAgo]
    );

    // Calculate system status based on error rate and response time
    // If no requests, default to healthy (system is available but idle)
    let systemStatus: 'healthy' | 'degraded' | 'down' = 'healthy';

    if (totalRequests > 0) {
      // Only evaluate status if there's actual usage data
      const errorRatePercent = (errorCount / totalRequests) * 100;
      const avgLatencyMs = parseFloat(usageStats.rows[0]?.avg_latency || '0');

      // Status is primarily based on error rate, latency is secondary
      // System is "down" only if there are significant errors
      if (errorRatePercent > 10) {
        systemStatus = 'down';
      } else if (
        errorRatePercent > 5 ||
        (avgLatencyMs > 10000 && errorRatePercent > 0)
      ) {
        // Degraded if moderate errors OR very slow with any errors
        systemStatus = 'degraded';
      } else if (avgLatencyMs > 8000) {
        // Slow latency alone (without errors) is still "healthy" but could be monitored
        // Keep as healthy for now - high latency without errors might be due to model processing
        systemStatus = 'healthy';
      }
    }

    // Calculate uptime percentage (based on successful requests)
    const successCount = totalRequests - errorCount;
    const uptimePercent =
      totalRequests > 0 ? (successCount / totalRequests) * 100 : 100;

    // Create a map of model stats from usage_events - use exact model names from database
    const modelStatsMap = new Map<string, any>();

    modelStats.rows.forEach((row: any) => {
      const provider = row.provider.toLowerCase();
      const modelKey = row.model.toLowerCase();
      const key = `${provider}:${modelKey}`;

      modelStatsMap.set(key, {
        requestCount: parseInt(row.request_count || '0'),
        totalTokens: parseInt(row.total_tokens || '0'),
        totalCost: parseFloat(row.total_cost || '0'),
        avgLatency: parseFloat(row.avg_latency || '0'),
        errorCount: parseInt(row.error_count || '0'),
        lastUsed: row.last_used,
        actualModelName: row.model, // Keep original case/variant name
      });
    });

    // Create a combined list of models to display:
    // 1. All configured models (for providers with API keys)
    // 2. All actual models from database (even if not in configured list)
    const modelsToDisplay = new Map<
      string,
      { provider: string; model: string }
    >();

    // Add configured models
    allConfiguredModels.forEach(({ provider, model }) => {
      const key = `${provider}:${model.toLowerCase()}`;
      modelsToDisplay.set(key, { provider, model });
    });

    // Add actual models from database that aren't in configured list
    modelStats.rows.forEach((row: any) => {
      const provider = row.provider.toLowerCase();
      const model = row.model; // Keep original name (e.g., "gpt-4-0613")
      const key = `${provider}:${model.toLowerCase()}`;

      if (!modelsToDisplay.has(key)) {
        modelsToDisplay.set(key, { provider, model });
      }
    });

    // Create model cards for all models (configured + actual used)
    const modelsData = Array.from(modelsToDisplay.values()).map(
      ({ provider, model }) => {
        const key = `${provider}:${model.toLowerCase()}`;
        const stats = modelStatsMap.get(key) || {
          requestCount: 0,
          totalTokens: 0,
          totalCost: 0,
          errorCount: 0,
          lastUsed: null,
        };

        const status =
          stats.requestCount > 0 && stats.errorCount > stats.requestCount * 0.1
            ? 'error'
            : 'healthy';

        return {
          name: stats.actualModelName || model, // Use actual model name if available, otherwise configured name
          provider: provider,
          requestCount: stats.requestCount,
          totalTokens: stats.totalTokens,
          totalCost: stats.totalCost,
          avgLatency: stats.avgLatency || 0,
          status: status as 'healthy' | 'error',
          lastUsed: stats.lastUsed,
        };
      }
    );

    return {
      systemStatus: {
        status: systemStatus,
        uptime: parseFloat(uptimePercent.toFixed(2)),
        version: '1.0.0',
      },
      models: modelsData,
      activeRequests: {
        current: currentRequests,
        change: requestChange,
      },
      errorRate: {
        rate: parseFloat(errorRate.toFixed(1)),
        trend: errorTrend as 'up' | 'down',
      },
      responseTime: {
        current: parseFloat(usageStats.rows[0]?.avg_latency || '0') / 1000, // Convert ms to seconds
        avg: parseFloat(usageStats.rows[0]?.avg_latency || '0') / 1000,
      },
      queueDepth: {
        depth: queueDepth,
        status: queueStatus,
      },
      rateLimits: {
        warnings: rateLimitWarnings,
      },
      requestVolume: filledVolumeData,
      providers: providers.length > 0 ? providers : [],
      providerStats: providers.map((provider, providerIndex) => {
        // Get the original provider key (lowercase) from configuredProviders
        const providerKey = configuredProviders[providerIndex];
        // Get all models for this provider and aggregate stats
        const providerModels = modelsData.filter(
          m => m.provider.toLowerCase() === providerKey.toLowerCase()
        );
        const totalRequests = providerModels.reduce(
          (sum, m) => sum + m.requestCount,
          0
        );
        const totalTokens = providerModels.reduce(
          (sum, m) => sum + m.totalTokens,
          0
        );
        const totalCost = providerModels.reduce(
          (sum, m) => sum + m.totalCost,
          0
        );
        const modelCount = providerModels.length;

        return {
          name: provider.name,
          status: provider.status,
          latency: provider.latency,
          totalRequests,
          totalTokens,
          totalCost,
          modelCount,
          models: providerModels.map(m => ({
            name: m.name,
            requestCount: m.requestCount,
            totalTokens: m.totalTokens,
            totalCost: m.totalCost,
            avgLatency: (m as any).avgLatency || 0,
            status: m.status,
          })),
        };
      }), // Show empty if no provider keys configured
      sanitization: {
        phi: parseInt(sanitizationStats.rows[0]?.total_sanitizations || '0'),
        pii: parseInt(sanitizationStats.rows[0]?.total_sanitizations || '0'),
      },
      recentErrors: errorsList,
      database: {
        connections: {
          active: parseInt(dbStats.rows[0]?.active_connections || '0'),
          max: 100,
        },
        avgQueryTime: Math.round(
          parseFloat(dbPerformance.rows[0]?.avg_query_time_ms || '0')
        ),
        status:
          parseInt(dbStats.rows[0]?.active_connections || '0') > 80
            ? 'warning'
            : 'healthy',
      },
      cache: await getRedisStats(),
      activeSessions: [
        {
          organizationName: 'Current Organization',
          activeRequests: currentRequests,
          totalToday: parseInt(
            (
              await query(
                `SELECT COUNT(*) as count
                FROM usage_events
                WHERE organization_id = $1 
                  AND timestamp >= $2`,
                [organizationId, oneDayAgo]
              )
            ).rows[0]?.count || '0'
          ),
        },
      ],
    };
  } catch (error) {
    console.error('Error fetching dashboard data from Postgres:', error);
    // Return default data if query fails
    return await getDefaultDashboardData();
  }
}

async function getDefaultDashboardData() {
  return {
    systemStatus: {
      status: 'healthy' as const,
      uptime: 99.98,
      version: '1.0.0',
    },
    activeRequests: {
      current: 0,
      change: 0,
    },
    errorRate: {
      rate: 0,
      trend: 'down' as const,
    },
    responseTime: {
      current: 0,
      avg: 0,
    },
    queueDepth: {
      depth: 0,
      status: 'normal' as const,
    },
    rateLimits: {
      warnings: 0,
    },
    requestVolume: Array.from({ length: 10 }, (_, i) => ({
      time: new Date(Date.now() - (9 - i) * 60 * 1000)
        .toTimeString()
        .slice(0, 5),
      count: 0,
    })),
    providers: [
      { name: 'OpenAI', status: 'healthy', latency: 0 },
      { name: 'Anthropic', status: 'healthy', latency: 0 },
      { name: 'Google', status: 'healthy', latency: 0 },
      { name: 'Perplexity', status: 'healthy', latency: 0 },
    ],
    sanitization: {
      phi: 0,
      pii: 0,
    },
    recentErrors: [],
    database: {
      connections: { active: 0, max: 100 },
      avgQueryTime: 45,
      status: 'healthy',
    },
    cache: await getRedisStats(),
    activeSessions: [
      {
        organizationName: 'Current Organization',
        activeRequests: 0,
        totalToday: 0,
      },
    ],
    models: [],
  };
}

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const organizationId =
        authRequest.auth?.organizationId ||
        '00000000-0000-0000-0000-000000000001'; // Default org

      const cacheKey = `${CACHE_KEY_PREFIX}${organizationId}`;
      const redisAvailable = await isRedisAvailable();

      // Try to get from Redis cache first
      if (redisAvailable) {
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
          try {
            const parsedData = JSON.parse(cachedData);
            return NextResponse.json({
              success: true,
              data: parsedData,
              message: 'Dashboard data retrieved from cache',
            });
          } catch (error) {
            console.error('Redis: Failed to parse cached data:', error);
            // Fall through to fetch fresh data
          }
        }
      }

      // Fetch real data from Postgres database
      const dashboardData = await getDashboardData(organizationId);

      // Store in Redis cache (async, don't wait)
      if (redisAvailable) {
        setCache(cacheKey, JSON.stringify(dashboardData), CACHE_DURATION).catch(
          error => {
            console.error('Redis: Failed to cache dashboard data:', error);
          }
        );
      }

      return NextResponse.json({
        success: true,
        data: dashboardData,
        message: 'Dashboard data retrieved successfully',
      });
    } catch (error: any) {
      console.error('Dashboard data error:', error);
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to retrieve dashboard data',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
