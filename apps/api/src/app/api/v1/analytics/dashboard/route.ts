import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AnalyticsEngine } from '../../../../../lib/analytics/engine';

const analyticsEngine = new AnalyticsEngine();

// Request validation schema
const DashboardQuerySchema = z.object({
  organizationId: z.string().optional(),
  timeRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  widgets: z.array(z.string()).optional(),
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
    const widgets = url.searchParams.get('widgets')?.split(',') || [
      'overview',
      'usage',
      'costs',
      'performance',
      'sanitization',
    ];

    const timeRange = start && end ? { start, end } : undefined;

    // Get all analytics data
    const usageMetrics = analyticsEngine.getUsageMetrics(
      organizationId,
      timeRange
    );
    const costAnalysis = analyticsEngine.getCostAnalysis(
      organizationId,
      timeRange
    );
    const performanceMetrics = analyticsEngine.getPerformanceMetrics(
      organizationId,
      timeRange
    );
    const sanitizationAnalytics = analyticsEngine.getSanitizationAnalytics(
      organizationId,
      timeRange
    );
    const alerts = analyticsEngine.getAlerts(organizationId);

    // Generate dashboard data
    const dashboardData = generateDashboardData(
      {
        usage: usageMetrics,
        costs: costAnalysis,
        performance: performanceMetrics,
        sanitization: sanitizationAnalytics,
        alerts,
      },
      widgets
    );

    return NextResponse.json({
      success: true,
      data: {
        dashboard: dashboardData,
        widgets,
        timeRange: timeRange || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
      message: 'Dashboard data retrieved successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve dashboard data',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = DashboardQuerySchema.parse(body);

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

    // Get all analytics data
    const usageMetrics = analyticsEngine.getUsageMetrics(
      validatedData.organizationId,
      timeRange
    );
    const costAnalysis = analyticsEngine.getCostAnalysis(
      validatedData.organizationId,
      timeRange
    );
    const performanceMetrics = analyticsEngine.getPerformanceMetrics(
      validatedData.organizationId,
      timeRange
    );
    const sanitizationAnalytics = analyticsEngine.getSanitizationAnalytics(
      validatedData.organizationId,
      timeRange
    );
    const alerts = analyticsEngine.getAlerts(validatedData.organizationId);

    // Generate dashboard data
    const dashboardData = generateDashboardData(
      {
        usage: usageMetrics,
        costs: costAnalysis,
        performance: performanceMetrics,
        sanitization: sanitizationAnalytics,
        alerts,
      },
      validatedData.widgets || [
        'overview',
        'usage',
        'costs',
        'performance',
        'sanitization',
      ]
    );

    return NextResponse.json({
      success: true,
      data: {
        dashboard: dashboardData,
        widgets: validatedData.widgets || [
          'overview',
          'usage',
          'costs',
          'performance',
          'sanitization',
        ],
        timeRange: timeRange || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
      message: 'Dashboard data retrieved successfully',
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
        message: 'Failed to retrieve dashboard data',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function generateDashboardData(analytics: any, widgets: string[]): any {
  const dashboard: any = {};

  if (widgets.includes('overview')) {
    dashboard.overview = {
      totalRequests: analytics.usage.totalRequests,
      totalCost: analytics.costs.totalCost,
      averageLatency: analytics.performance.averageLatency,
      errorRate: analytics.performance.errorRate,
      uptime: analytics.performance.uptime,
      activeAlerts: analytics.alerts.filter((a: any) => !a.resolved).length,
      healthScore: calculateOverallHealthScore(analytics),
    };
  }

  if (widgets.includes('usage')) {
    dashboard.usage = {
      metrics: analytics.usage,
      trends: {
        requests:
          analytics.usage.totalRequests > 1000 ? 'increasing' : 'stable',
        users: analytics.usage.uniqueUsers > 10 ? 'increasing' : 'stable',
        tokens: analytics.usage.totalTokens > 50000 ? 'increasing' : 'stable',
      },
    };
  }

  if (widgets.includes('costs')) {
    dashboard.costs = {
      analysis: analytics.costs,
      insights: {
        topProvider:
          Object.entries(analytics.costs.costByProvider).sort(
            ([, a], [, b]) => (b as number) - (a as number)
          )[0]?.[0] || 'N/A',
        costEfficiency: calculateCostEfficiency(analytics.costs),
        recommendations: generateCostRecommendations(analytics.costs),
      },
    };
  }

  if (widgets.includes('performance')) {
    dashboard.performance = {
      metrics: analytics.performance,
      insights: {
        healthScore: calculateHealthScore(analytics.performance),
        bottlenecks: identifyBottlenecks(analytics.performance),
        recommendations: generatePerformanceRecommendations(
          analytics.performance
        ),
      },
    };
  }

  if (widgets.includes('sanitization')) {
    dashboard.sanitization = {
      analytics: analytics.sanitization,
      insights: {
        complianceScore: calculateComplianceScore(analytics.sanitization),
        riskAssessment: assessRiskLevel(analytics.sanitization),
        recommendations: generateSanitizationRecommendations(
          analytics.sanitization
        ),
      },
    };
  }

  if (widgets.includes('alerts')) {
    dashboard.alerts = {
      active: analytics.alerts.filter((a: any) => !a.resolved),
      resolved: analytics.alerts.filter((a: any) => a.resolved),
      summary: {
        total: analytics.alerts.length,
        critical: analytics.alerts.filter((a: any) => a.severity === 'critical')
          .length,
        high: analytics.alerts.filter((a: any) => a.severity === 'high').length,
        medium: analytics.alerts.filter((a: any) => a.severity === 'medium')
          .length,
        low: analytics.alerts.filter((a: any) => a.severity === 'low').length,
      },
    };
  }

  return dashboard;
}

function calculateOverallHealthScore(analytics: any): number {
  let score = 100;

  // Deduct for high error rate
  if (analytics.performance.errorRate > 0.05) score -= 20;
  else if (analytics.performance.errorRate > 0.01) score -= 10;

  // Deduct for high latency
  if (analytics.performance.averageLatency > 2000) score -= 15;
  else if (analytics.performance.averageLatency > 1000) score -= 5;

  // Deduct for low uptime
  if (analytics.performance.uptime < 99.5) score -= 25;
  else if (analytics.performance.uptime < 99.9) score -= 10;

  // Deduct for compliance violations
  if (analytics.sanitization.complianceViolations > 0)
    score -= analytics.sanitization.complianceViolations * 5;

  // Deduct for active alerts
  const activeAlerts = analytics.alerts.filter((a: any) => !a.resolved).length;
  if (activeAlerts > 0) score -= activeAlerts * 2;

  return Math.max(0, score);
}

function calculateCostEfficiency(costs: any): any {
  const totalCost = costs.totalCost;
  const providerCount = Object.keys(costs.costByProvider).length;

  return {
    averageCostPerProvider: totalCost / providerCount,
    costDistribution: Object.entries(costs.costByProvider)
      .map(([provider, cost]) => ({
        provider,
        cost,
        percentage: ((cost as number) / totalCost) * 100,
      }))
      .sort((a, b) => b.percentage - a.percentage),
  };
}

function generateCostRecommendations(costs: any): string[] {
  const recommendations: string[] = [];

  const topProvider = Object.entries(costs.costByProvider).sort(
    ([, a], [, b]) => (b as number) - (a as number)
  )[0];

  if (topProvider && (topProvider[1] as number) > costs.totalCost * 0.5) {
    recommendations.push(
      `Consider optimizing usage of ${topProvider[0]} as it accounts for ${(((topProvider[1] as number) / costs.totalCost) * 100).toFixed(1)}% of total costs`
    );
  }

  return recommendations;
}

function calculateHealthScore(performance: any): number {
  let score = 100;

  if (performance.averageLatency > 2000) score -= 20;
  else if (performance.averageLatency > 1000) score -= 10;

  if (performance.errorRate > 0.05) score -= 30;
  else if (performance.errorRate > 0.01) score -= 15;

  if (performance.uptime < 99.5) score -= 25;
  else if (performance.uptime < 99.9) score -= 10;

  return Math.max(0, score);
}

function identifyBottlenecks(performance: any): string[] {
  const bottlenecks: string[] = [];

  if (performance.averageLatency > 2000)
    bottlenecks.push('High average latency detected');
  if (performance.p99Latency > 10000)
    bottlenecks.push('High P99 latency indicates performance issues');
  if (performance.errorRate > 0.05)
    bottlenecks.push('High error rate detected');
  if (performance.throughput < 100) bottlenecks.push('Low throughput detected');

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

  return recommendations;
}

function calculateComplianceScore(analytics: any): number {
  let score = 100;

  if (analytics.complianceViolations > 0) {
    score -= analytics.complianceViolations * 10;
  }

  const criticalRisk = analytics.riskDistribution.CRITICAL || 0;
  const highRisk = analytics.riskDistribution.HIGH || 0;

  if (criticalRisk > 0) score -= criticalRisk * 20;
  if (highRisk > 0) score -= highRisk * 10;

  return Math.max(0, score);
}

function assessRiskLevel(analytics: any): any {
  const totalRisk = Object.values(analytics.riskDistribution).reduce(
    (sum: number, count: any) => sum + (count as number),
    0
  ) as number;

  return {
    totalRisk,
    riskBreakdown: analytics.riskDistribution,
    riskPercentages: Object.entries(analytics.riskDistribution).map(
      ([level, count]) => ({
        level,
        count,
        percentage: totalRisk > 0 ? ((count as number) / totalRisk) * 100 : 0,
      })
    ),
  };
}

function generateSanitizationRecommendations(analytics: any): string[] {
  const recommendations: string[] = [];

  if (analytics.complianceViolations > 0) {
    recommendations.push(
      'Review and update sanitization patterns to reduce compliance violations'
    );
  }

  const criticalRisk = analytics.riskDistribution.CRITICAL || 0;
  if (criticalRisk > 0) {
    recommendations.push(
      'Implement stricter data classification and handling procedures'
    );
  }

  return recommendations;
}
