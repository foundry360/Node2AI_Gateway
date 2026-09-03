import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AnalyticsEngine } from '../../../../../lib/analytics/engine';

const analyticsEngine = new AnalyticsEngine();

// Request validation schema
const PerformanceQuerySchema = z.object({
  organizationId: z.string().optional(),
  timeRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  metrics: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('organizationId') || undefined;
    const start = url.searchParams.get('start')
      ? new Date(url.searchParams.get('start')!)
      : undefined;
    const end = url.searchParams.get('end')
      ? new Date(url.searchParams.get('end')!)
      : undefined;
    const metrics = url.searchParams.get('metrics')?.split(',') || [
      'latency',
      'throughput',
      'error_rate',
    ];

    const timeRange = start && end ? { start, end } : undefined;

    // Get performance metrics
    const performanceMetrics = analyticsEngine.getPerformanceMetrics(
      organizationId,
      timeRange
    );

    // Generate performance insights
    const insights = generatePerformanceInsights(performanceMetrics);

    return NextResponse.json({
      success: true,
      data: {
        performance: performanceMetrics,
        insights,
        requestedMetrics: metrics,
        timeRange: timeRange || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
      message: 'Performance analytics retrieved successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve performance analytics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = PerformanceQuerySchema.parse(body);

    const timeRange = validatedData.timeRange
      ? {
          start: validatedData.timeRange.start
            ? new Date(validatedData.timeRange.start)
            : undefined,
          end: validatedData.timeRange.end
            ? new Date(validatedData.timeRange.end)
            : undefined,
        }
      : undefined;

    // Get performance metrics
    const performanceMetrics = analyticsEngine.getPerformanceMetrics(
      validatedData.organizationId,
      timeRange
    );

    // Generate performance insights
    const insights = generatePerformanceInsights(performanceMetrics);

    return NextResponse.json({
      success: true,
      data: {
        performance: performanceMetrics,
        insights,
        requestedMetrics: validatedData.metrics || [
          'latency',
          'throughput',
          'error_rate',
        ],
        timeRange: timeRange || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
      message: 'Performance analytics retrieved successfully',
    });
  } catch (error) {
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
        message: 'Failed to retrieve performance analytics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function generatePerformanceInsights(performance: any): any {
  const insights = {
    healthScore: calculateHealthScore(performance),
    bottlenecks: identifyBottlenecks(performance),
    recommendations: generatePerformanceRecommendations(performance),
    trends: analyzeTrends(performance),
  };

  return insights;
}

function calculateHealthScore(performance: any): number {
  let score = 100;

  // Deduct points for high latency
  if (performance.averageLatency > 2000) score -= 20;
  else if (performance.averageLatency > 1000) score -= 10;

  // Deduct points for high error rate
  if (performance.errorRate > 0.05) score -= 30;
  else if (performance.errorRate > 0.01) score -= 15;

  // Deduct points for low uptime
  if (performance.uptime < 99.5) score -= 25;
  else if (performance.uptime < 99.9) score -= 10;

  return Math.max(0, score);
}

function identifyBottlenecks(performance: any): string[] {
  const bottlenecks: string[] = [];

  if (performance.averageLatency > 2000) {
    bottlenecks.push('High average latency detected');
  }

  if (performance.p99Latency > 10000) {
    bottlenecks.push('High P99 latency indicates performance issues');
  }

  if (performance.errorRate > 0.05) {
    bottlenecks.push('High error rate detected');
  }

  if (performance.throughput < 100) {
    bottlenecks.push('Low throughput detected');
  }

  return bottlenecks;
}

function generatePerformanceRecommendations(performance: any): string[] {
  const recommendations: string[] = [];

  if (performance.averageLatency > 1000) {
    recommendations.push('Consider implementing caching to reduce latency');
    recommendations.push('Review provider selection for faster models');
  }

  if (performance.errorRate > 0.01) {
    recommendations.push('Implement retry logic with exponential backoff');
    recommendations.push('Add circuit breaker pattern for failing providers');
  }

  if (performance.throughput < 1000) {
    recommendations.push('Consider horizontal scaling');
    recommendations.push('Optimize database queries and connections');
  }

  if (performance.uptime < 99.9) {
    recommendations.push('Implement health checks and monitoring');
    recommendations.push('Add redundancy and failover mechanisms');
  }

  return recommendations;
}

function analyzeTrends(performance: any): any {
  return {
    latencyTrend: performance.averageLatency > 1000 ? 'increasing' : 'stable',
    errorTrend: performance.errorRate > 0.01 ? 'increasing' : 'stable',
    throughputTrend: performance.throughput > 1000 ? 'increasing' : 'stable',
    uptimeTrend: performance.uptime > 99.9 ? 'stable' : 'decreasing',
  };
}
