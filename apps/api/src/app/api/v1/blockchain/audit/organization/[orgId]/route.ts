import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/lib/middleware';

/**
 * GET /api/v1/blockchain/audit/organization/:orgId
 * Get all audit records for a specific organization from blockchain
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  return authMiddleware(request, async () => {
    try {
      // Dynamic import to avoid module initialization errors
      const { blockchainService } = await import(
        '@/lib/blockchain/blockchain.service'
      );

      const orgId = params.orgId;

      if (!orgId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Organization ID is required',
          },
          { status: 400 }
        );
      }

      console.log(
        `Querying blockchain audit records for organization: ${orgId}`
      );

      // Query blockchain
      const interactions = await blockchainService.queryAuditEventsByOrg(orgId);

      return NextResponse.json({
        success: true,
        data: interactions,
        count: interactions.length,
        message: 'Audit records retrieved successfully',
      });
    } catch (error: any) {
      console.error('Error querying blockchain audit by organization:', error);
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
