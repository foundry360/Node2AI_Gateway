import { NextRequest, NextResponse } from 'next/server';
import { DataSanitizer } from '../../../../../lib/security/sanitizer';

export async function GET(request: NextRequest) {
  try {
    const sanitizer = new DataSanitizer();
    const stats = sanitizer.getStats();

    return NextResponse.json({
      success: true,
      data: {
        statistics: stats,
        summary: {
          totalRequests: stats.totalRequests,
          entitiesDetected: stats.entitiesDetected,
          averageEntitiesPerRequest:
            stats.totalRequests > 0
              ? (stats.entitiesDetected / stats.totalRequests).toFixed(2)
              : 0,
          complianceViolations: stats.complianceViolations,
          averageProcessingTime: `${stats.averageProcessingTime.toFixed(2)}ms`,
          riskDistribution: stats.riskDistribution,
        },
        timestamp: new Date().toISOString(),
      },
      message: 'Sanitization statistics retrieved successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve statistics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sanitizer = new DataSanitizer();
    sanitizer.resetStats();

    return NextResponse.json({
      success: true,
      data: {
        message: 'Statistics reset successfully',
        timestamp: new Date().toISOString(),
      },
      message: 'Statistics reset',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to reset statistics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
