import { NextRequest, NextResponse } from 'next/server';
import { CostCalculator } from '../../../../../lib/core/cost-calculator';
import {
  authMiddleware,
  composeMiddleware,
} from '../../../../../lib/middleware';

// Initialize cost calculator (in a real app, this would be a singleton)
const costCalculator = new CostCalculator();

async function handler(request: NextRequest) {
  try {
    const authContext = (request as any).auth;
    const organizationId = authContext?.organizationId || 'default-org';

    // Get query parameters
    const url = new URL(request.url);
    const timeRange = url.searchParams.get('timeRange');
    const granularity = url.searchParams.get('granularity') || 'daily';

    let timeFilter: { start: Date; end: Date } | undefined;

    if (timeRange) {
      const now = new Date();
      switch (timeRange) {
        case 'today':
          timeFilter = {
            start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            end: now,
          };
          break;
        case 'week':
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - 7);
          timeFilter = { start: weekStart, end: now };
          break;
        case 'month':
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          timeFilter = { start: monthStart, end: now };
          break;
        case 'year':
          const yearStart = new Date(now.getFullYear(), 0, 1);
          timeFilter = { start: yearStart, end: now };
          break;
      }
    }

    // Get cost metrics
    const costMetrics = costCalculator.getCostMetrics(
      organizationId,
      timeFilter
    );
    const providerComparison = costCalculator.getProviderCostComparison();
    const modelComparison = costCalculator.getModelCostComparison();
    const costAlerts = costCalculator.getCostAlerts({
      daily: 100,
      weekly: 500,
      monthly: 2000,
    });

    return NextResponse.json({
      success: true,
      data: {
        metrics: costMetrics,
        providerComparison,
        modelComparison,
        alerts: costAlerts,
        timeRange: timeFilter
          ? {
              start: timeFilter.start.toISOString(),
              end: timeFilter.end.toISOString(),
            }
          : null,
        organizationId,
      },
      message: 'Cost metrics retrieved successfully',
    });
  } catch (error: any) {
    console.error('Cost tracking error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Internal server error',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export const GET = handler;
