import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AnalyticsEngine } from '../../../../../lib/analytics/engine';

const analyticsEngine = new AnalyticsEngine();

// Request validation schema
const SanitizationQuerySchema = z.object({
  organizationId: z.string().optional(),
  timeRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
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
    const riskLevel =
      (url.searchParams.get('riskLevel') as
        | 'LOW'
        | 'MEDIUM'
        | 'HIGH'
        | 'CRITICAL') || undefined;

    const timeRange = start && end ? { start, end } : undefined;

    // Get sanitization analytics
    const sanitizationAnalytics = analyticsEngine.getSanitizationAnalytics(
      organizationId,
      timeRange
    );

    // Generate sanitization insights
    const insights = generateSanitizationInsights(
      sanitizationAnalytics,
      riskLevel
    );

    return NextResponse.json({
      success: true,
      data: {
        sanitization: sanitizationAnalytics,
        insights,
        riskLevel,
        timeRange: timeRange || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
      message: 'Sanitization analytics retrieved successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve sanitization analytics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = SanitizationQuerySchema.parse(body);

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

    // Get sanitization analytics
    const sanitizationAnalytics = analyticsEngine.getSanitizationAnalytics(
      validatedData.organizationId,
      timeRange
    );

    // Generate sanitization insights
    const insights = generateSanitizationInsights(
      sanitizationAnalytics,
      validatedData.riskLevel
    );

    return NextResponse.json({
      success: true,
      data: {
        sanitization: sanitizationAnalytics,
        insights,
        riskLevel: validatedData.riskLevel,
        timeRange: timeRange || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
      message: 'Sanitization analytics retrieved successfully',
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
        message: 'Failed to retrieve sanitization analytics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function generateSanitizationInsights(analytics: any, riskLevel?: string): any {
  const insights = {
    complianceScore: calculateComplianceScore(analytics),
    riskAssessment: assessRiskLevel(analytics, riskLevel),
    recommendations: generateSanitizationRecommendations(analytics),
    trends: analyzeSanitizationTrends(analytics),
  };

  return insights;
}

function calculateComplianceScore(analytics: any): number {
  let score = 100;

  // Deduct points for compliance violations
  if (analytics.complianceViolations > 0) {
    score -= analytics.complianceViolations * 10;
  }

  // Deduct points for high risk distribution
  const criticalRisk = analytics.riskDistribution.CRITICAL || 0;
  const highRisk = analytics.riskDistribution.HIGH || 0;

  if (criticalRisk > 0) score -= criticalRisk * 20;
  if (highRisk > 0) score -= highRisk * 10;

  return Math.max(0, score);
}

function assessRiskLevel(analytics: any, filterRiskLevel?: string): any {
  const totalRisk = Object.values(analytics.riskDistribution).reduce(
    (sum: number, count: any) => sum + (count as number),
    0
  ) as number;

  const riskBreakdown = {
    critical: analytics.riskDistribution.CRITICAL || 0,
    high: analytics.riskDistribution.HIGH || 0,
    medium: analytics.riskDistribution.MEDIUM || 0,
    low: analytics.riskDistribution.LOW || 0,
  };

  const riskPercentages = {
    critical:
      totalRisk > 0
        ? ((riskBreakdown.critical as number) / totalRisk) * 100
        : 0,
    high:
      totalRisk > 0 ? ((riskBreakdown.high as number) / totalRisk) * 100 : 0,
    medium:
      totalRisk > 0 ? ((riskBreakdown.medium as number) / totalRisk) * 100 : 0,
    low: totalRisk > 0 ? ((riskBreakdown.low as number) / totalRisk) * 100 : 0,
  };

  return {
    totalRisk,
    riskBreakdown,
    riskPercentages,
    filtered: filterRiskLevel
      ? riskBreakdown[
          filterRiskLevel.toLowerCase() as keyof typeof riskBreakdown
        ]
      : undefined,
  };
}

function generateSanitizationRecommendations(analytics: any): string[] {
  const recommendations: string[] = [];

  if (analytics.complianceViolations > 0) {
    recommendations.push(
      'Review and update sanitization patterns to reduce compliance violations'
    );
    recommendations.push(
      'Implement additional training for data handling procedures'
    );
  }

  const criticalRisk = analytics.riskDistribution.CRITICAL || 0;
  if (criticalRisk > 0) {
    recommendations.push(
      'Implement stricter data classification and handling procedures'
    );
    recommendations.push('Consider additional encryption for critical data');
  }

  if (analytics.averageProcessingTime > 1000) {
    recommendations.push(
      'Optimize sanitization algorithms for better performance'
    );
    recommendations.push(
      'Consider implementing caching for frequently detected patterns'
    );
  }

  if (analytics.entitiesDetected > 1000) {
    recommendations.push(
      'Review data sources to identify high-risk data patterns'
    );
    recommendations.push('Implement proactive data minimization strategies');
  }

  return recommendations;
}

function analyzeSanitizationTrends(analytics: any): any {
  return {
    entityTrend: analytics.entitiesDetected > 500 ? 'increasing' : 'stable',
    riskTrend:
      (analytics.riskDistribution.CRITICAL || 0) > 0 ? 'increasing' : 'stable',
    complianceTrend:
      analytics.complianceViolations > 0 ? 'decreasing' : 'stable',
    processingTrend:
      analytics.averageProcessingTime > 1000 ? 'increasing' : 'stable',
  };
}
