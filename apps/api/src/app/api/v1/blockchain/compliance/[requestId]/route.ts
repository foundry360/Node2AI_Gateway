import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/lib/middleware';

/**
 * GET /api/v1/blockchain/compliance/:requestId
 * Verify PHI compliance for a specific interaction from blockchain
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  return authMiddleware(request, async () => {
    try {
      // Dynamic import to avoid module initialization errors
      const { blockchainService } = await import(
        '@/lib/blockchain/blockchain.service'
      );

      const requestId = params.requestId;

      if (!requestId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Request ID is required',
          },
          { status: 400 }
        );
      }

      console.log(`Verifying PHI compliance for interaction: ${requestId}`);

      // Verify compliance
      const complianceResult =
        await blockchainService.verifyPHICompliance(requestId);

      return NextResponse.json({
        success: true,
        data: complianceResult,
        message: complianceResult.isCompliant
          ? 'PHI compliance verified'
          : 'PHI compliance check failed',
      });
    } catch (error: any) {
      console.error('Error verifying PHI compliance:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to verify PHI compliance',
        },
        { status: 500 }
      );
    }
  });
}
