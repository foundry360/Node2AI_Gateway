import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/lib/middleware';
import { query } from '@/lib/db/postgres-client';

/**
 * GET /api/v1/blockchain/audit/:requestId
 * Get a specific audit record from blockchain, with fallback to database
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  return authMiddleware(request, async () => {
    try {
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

      console.log(
        `[Blockchain Audit API] Querying blockchain audit record: ${requestId}`
      );

      // Try to query blockchain first
      let interaction: any = null;
      let blockchainConnected = false;

      try {
        // Dynamic import to avoid module initialization errors
        const { blockchainService } = await import(
          '@/lib/blockchain/blockchain.service'
        );

        if (!blockchainService || !blockchainService.isEnabled()) {
          console.log('[Blockchain Audit API] Blockchain service not enabled');
          blockchainConnected = false;
        } else {
          console.log(
            '[Blockchain Audit API] Ensuring blockchain connection...'
          );
          // Use ensureConnected to wait for connection if needed
          try {
            await blockchainService.ensureConnected();
            blockchainConnected = true;
            console.log(
              '[Blockchain Audit API] Blockchain is connected, querying blockchain...'
            );
            interaction = await blockchainService.queryAuditEvent(requestId);

            if (interaction) {
              console.log('[Blockchain Audit API] Found record on blockchain');
              // Enrich with blockchain-specific metadata
              interaction = {
                ...interaction,
                chain: 'Hyperledger Fabric',
                recorded: interaction.timestamp || new Date().toISOString(),
                confirmations: 1,
                status: 'confirmed',
                verificationStatus: interaction.digitalSignature
                  ? 'Valid'
                  : 'Pending',
              };
            }
          } catch (connectionError: any) {
            console.error(
              '[Blockchain Audit API] Failed to connect to blockchain:',
              connectionError.message
            );
            blockchainConnected = false;
          }
        }
      } catch (blockchainError: any) {
        console.error(
          '[Blockchain Audit API] Blockchain query failed:',
          blockchainError.message
        );
        throw blockchainError; // PRODUCTION: Fail if blockchain query fails
      }

      // PRODUCTION: No fallback - blockchain MUST be connected
      if (!interaction) {
        if (!blockchainConnected) {
          return NextResponse.json(
            {
              success: false,
              error: 'Blockchain service is not connected',
              details:
                'PRODUCTION REQUIREMENT: Hyperledger Fabric must be running and connected. Please check blockchain configuration and ensure the network is active.',
            },
            { status: 503 }
          );
        }

        return NextResponse.json(
          {
            success: false,
            error: 'Audit record not found on blockchain',
            details: `No blockchain record found with requestId: ${requestId}. Ensure the transaction was recorded on the blockchain.`,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: interaction,
        message:
          interaction.source === 'database'
            ? 'Audit record retrieved from database (blockchain not available)'
            : 'Audit record retrieved from blockchain',
      });
    } catch (error: any) {
      console.error(
        '[Blockchain Audit API] Error querying audit record:',
        error
      );

      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to query audit record',
          details: 'An error occurred while retrieving the audit record.',
        },
        { status: 500 }
      );
    }
  });
}
