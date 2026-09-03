import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AnalyticsEngine } from '../../../../../lib/analytics/engine';

const analyticsEngine = new AnalyticsEngine();

// Request validation schema
const CostQuerySchema = z.object({
  organizationId: z.string().optional(),
  timeRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
  breakdown: z.enum(['provider', 'model', 'organization', 'user']).optional(),
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
    const breakdown =
      (url.searchParams.get('breakdown') as
        | 'provider'
        | 'model'
        | 'organization'
        | 'user') || 'provider';

    const timeRange = start && end ? { start, end } : undefined;

    // Get cost analysis
    const costAnalysis = analyticsEngine.getCostAnalysis(
      organizationId,
      timeRange
    );

    // Generate cost insights
    const insights = generateCostInsights(costAnalysis);

    return NextResponse.json({
      success: true,
      data: {
        costs: costAnalysis,
        insights,
        breakdown,
        timeRange: timeRange || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
      message: 'Cost analytics retrieved successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve cost analytics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CostQuerySchema.parse(body);

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

    // Get cost analysis
    const costAnalysis = analyticsEngine.getCostAnalysis(
      validatedData.organizationId,
      timeRange
    );

    // Generate cost insights
    const insights = generateCostInsights(costAnalysis);

    return NextResponse.json({
      success: true,
      data: {
        costs: costAnalysis,
        insights,
        breakdown: validatedData.breakdown || 'provider',
        timeRange: timeRange || {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      },
      message: 'Cost analytics retrieved successfully',
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
        message: 'Failed to retrieve cost analytics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function generateCostInsights(costAnalysis: any): any {
  const insights = {
    totalCost: costAnalysis.totalCost,
    topProvider:
      Object.entries(costAnalysis.costByProvider).sort(
        ([, a], [, b]) => (b as number) - (a as number)
      )[0]?.[0] || 'N/A',
    topModel:
      Object.entries(costAnalysis.costByModel).sort(
        ([, a], [, b]) => (b as number) - (a as number)
      )[0]?.[0] || 'N/A',
    costEfficiency: calculateCostEfficiency(costAnalysis),
    recommendations: generateRecommendations(costAnalysis),
  };

  return insights;
}

function calculateCostEfficiency(costAnalysis: any): any {
  const totalCost = costAnalysis.totalCost;
  const providerCount = Object.keys(costAnalysis.costByProvider).length;

  return {
    averageCostPerProvider: totalCost / providerCount,
    costDistribution: Object.entries(costAnalysis.costByProvider)
      .map(([provider, cost]) => ({
        provider,
        cost,
        percentage: ((cost as number) / totalCost) * 100,
      }))
      .sort((a, b) => b.percentage - a.percentage),
  };
}

function generateRecommendations(costAnalysis: any): string[] {
  const recommendations: string[] = [];

  // Find the most expensive provider
  const topProvider = Object.entries(costAnalysis.costByProvider).sort(
    ([, a], [, b]) => (b as number) - (a as number)
  )[0];

  if (
    topProvider &&
    (topProvider[1] as number) > costAnalysis.totalCost * 0.5
  ) {
    recommendations.push(
      `Consider optimizing usage of ${topProvider[0]} as it accounts for ${(((topProvider[1] as number) / costAnalysis.totalCost) * 100).toFixed(1)}% of total costs`
    );
  }

  // Check for cost distribution
  const providerCount = Object.keys(costAnalysis.costByProvider).length;
  if (providerCount > 1) {
    recommendations.push(
      'Consider consolidating providers to reduce complexity and potentially lower costs'
    );
  }

  // Check for high daily costs
  const maxDailyCost = Math.max(
    ...costAnalysis.dailyCosts.map((d: any) => d.cost)
  );
  if (maxDailyCost > costAnalysis.totalCost * 0.1) {
    recommendations.push(
      'Monitor daily cost spikes to identify unusual usage patterns'
    );
  }

  return recommendations;
}
