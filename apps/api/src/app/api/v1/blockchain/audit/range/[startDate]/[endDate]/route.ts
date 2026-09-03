import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/lib/middleware';

/**
 * GET /api/v1/blockchain/audit/range/:startDate/:endDate
 * Get audit records within a date range from blockchain
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { startDate: string; endDate: string } }
) {
  return authMiddleware(request, async () => {
    try {
      // Dynamic import to avoid module initialization errors
      const { blockchainService } = await import(
        '@/lib/blockchain/blockchain.service'
      );

      const startDate = decodeURIComponent(params.startDate);
      const endDate = decodeURIComponent(params.endDate);

      if (!startDate || !endDate) {
        return NextResponse.json(
          {
            success: false,
            error: 'Start date and end date are required',
          },
          { status: 400 }
        );
      }

      console.log(
        `Querying blockchain audit records from ${startDate} to ${endDate}`
      );

      // Query blockchain
      const interactions = await blockchainService.queryAuditEventsByDateRange(
        startDate,
        endDate
      );

      return NextResponse.json({
        success: true,
        data: interactions,
        count: interactions.length,
        message: 'Audit records retrieved successfully',
      });
    } catch (error: any) {
      console.error('Error querying blockchain audit by date range:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to query blockchain audit records',
        },
        { status: 500 }
      );
    }
  });
}
