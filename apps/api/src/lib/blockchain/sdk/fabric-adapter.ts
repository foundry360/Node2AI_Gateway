/**
 * Hyperledger Fabric Blockchain Adapter for Node2AI
 * Wraps the Fabric Network SDK for TypeScript
 */

import { Gateway, Wallets, Network } from 'fabric-network';
import * as path from 'path';
import * as fs from 'fs';
import * as FabricCAServices from 'fabric-ca-client';

export interface AIInteraction {
  // Transaction Metadata
  requestId: string;
  timestamp: string;
  organization: string;
  organizationId?: string; // Optional alias for organization
  userId: string;

  // Hashes & Proofs
  inputHash: string; // SHA256 of original user prompt
  sanitizedPromptHash: string; // SHA256 of sanitized prompt sent to AI
  sanitizedHash?: string; // Optional alias for sanitizedPromptHash
  aiResponseHash: string; // SHA256 of original AI response
  sanitizedResponseHash: string; // SHA256 of sanitized AI response
  desanitizedResponseHash: string; // SHA256 of desanitized response shown to user
  digitalSignature?: string; // Digital signature of transaction
  signatureAlgorithm?: string; // Algorithm used for signing
  signedBy?: string; // Identifier of signer
  publicKey?: string; // Public key used for verification
  merkleRoot?: string; // Merkle root of batch transactions

  // Compliance Data
  phiDetected: string[]; // Types: PERSON, MRN, DATE, etc.
  phiExposed: boolean; // Always false
  purpose?: string; // Purpose/category of request
  dataClassification?: string; // Classification level (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED)
  regulatoryContext?: string[]; // HIPAA, SOC2, GDPR, etc.
  approvalHash?: string; // Hash of approval/authorization

  // Provider & Model Info
  aiProvider: string; // openai, anthropic, google
  model: string; // gpt-4, claude-sonnet-4-5
  modelVersion?: string; // Model version/snapshot

  // Usage Metrics
  tokensUsed: number; // Total tokens
  tokensInput?: number; // Input tokens
  tokensOutput?: number; // Output tokens
  costUsd: number;
  processingTimeMs: number;
  success: boolean; // Success/failure status
  errorCode?: string; // Error code if failed

  // Configuration
  temperature?: number; // Temperature setting
  topP?: number; // Top-p setting
  systemPromptHash?: string; // Hash of system prompt
  featureFlags?: string[]; // Feature flags used

  // Compliance Flags
  hipaaCompliant: boolean;

  // Session Linking
  sessionId?: string; // Session ID for linking related interactions
  conversationId?: string; // Conversation ID
}

export interface BlockchainConfig {
  walletPath: string;
  connectionProfilePath: string;
  channelName: string;
  chaincodeName: string;
  organizationMSP: string;
  userId: string;
}

export class FabricBlockchainAdapter {
  private gateway: Gateway | null = null;
  private network: Network | null = null;
  private contract: any = null;
  private config: BlockchainConfig;
  private isConnected: boolean = false;

  constructor(config: BlockchainConfig) {
    this.config = config;
  }

  /**
   * Connect to the Hyperledger Fabric network
   */
  async connect(): Promise<void> {
    console.log('Connecting to Hyperledger Fabric network...');

    try {
      // Load connection profile
      const connectionProfilePath = this.config.connectionProfilePath;
      if (!fs.existsSync(connectionProfilePath)) {
        throw new Error(
          `Connection profile not found at: ${connectionProfilePath}`
        );
      }

      const connectionProfile = JSON.parse(
        fs.readFileSync(connectionProfilePath, 'utf8')
      );

      // Create a new gateway for connecting to peer nodes
      this.gateway = new Gateway();

      // Setup wallet
      const walletPath = this.config.walletPath;
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      // Check if user exists in wallet
      const userExists = await wallet.get(this.config.userId);
      if (!userExists) {
        console.error(`[FabricAdapter] Wallet contents:`, await wallet.list());
        throw new Error(
          `User identity ${this.config.userId} not found in wallet at ${walletPath}. Available identities: ${(await wallet.list()).join(', ') || 'none'}`
        );
      }

      console.log(
        `[FabricAdapter] Found identity ${this.config.userId} in wallet (type: ${userExists.type}, MSP: ${userExists.mspId})`
      );

      // Connect to gateway with discovery enabled for proper peer selection
      // Discovery mode ensures Fabric SDK can find all required endorsing peers
      // For localhost Docker: asLocalhost maps container hostnames to localhost
      await this.gateway.connect(connectionProfile, {
        wallet,
        identity: this.config.userId,
        discovery: { enabled: true, asLocalhost: true },
        eventHandlerOptions: {
          commitTimeout: 300,
          strategy: null, // Use default event handling strategy
        },
      });

      // Get network and contract
      this.network = await this.gateway.getNetwork(this.config.channelName);
      this.contract = this.network.getContract(this.config.chaincodeName);

      this.isConnected = true;
      console.log('Successfully connected to Fabric network');
    } catch (error) {
      console.error('Failed to connect to Fabric network:', error);
      throw error;
    }
  }

  /**
   * Record an audit event on the blockchain
   */
  async recordAuditEvent(event: AIInteraction): Promise<string> {
    if (!this.isConnected || !this.contract) {
      throw new Error('Not connected to blockchain network');
    }

    console.log('[Fabric Adapter] Recording to blockchain:', event.requestId);

    try {
      // Create interaction object matching chaincode AIInteraction struct
      // Chaincode expects: requestId, timestamp, organization, userId, inputHash, sanitizedHash,
      //                    phiDetected, phiExposed, aiProvider, model, tokensUsed, costUsd,
      //                    hipaaCompliant, processingTimeMs, createdAt
      // IMPORTANT: createdAt must be sent from client to ensure consensus (same timestamp on all peers)
      // Both timestamp and createdAt should use the same value for deterministic behavior
      const timestamp = event.timestamp || new Date().toISOString();
      const interactionForBlockchain = {
        requestId: event.requestId,
        timestamp: timestamp,
        organization: event.organization || event.organizationId || '',
        userId: event.userId || '',
        inputHash: event.inputHash || '',
        sanitizedHash: event.sanitizedPromptHash || event.sanitizedHash || '', // Map sanitizedPromptHash to sanitizedHash
        digitalSignature: event.digitalSignature || '',
        signatureAlgorithm: event.signatureAlgorithm || '',
        signedBy: event.signedBy || '',
        publicKey: event.publicKey || '',
        phiDetected: event.phiDetected || [],
        phiExposed: false, // Always false per HIPAA requirements (chaincode validates this)
        aiProvider: event.aiProvider || '',
        model: event.model || '',
        tokensUsed: event.tokensUsed || 0,
        costUsd: event.costUsd || 0,
        hipaaCompliant:
          event.hipaaCompliant !== undefined ? event.hipaaCompliant : true,
        processingTimeMs: event.processingTimeMs || 0,
        createdAt: timestamp, // ✅ REQUIRED: Send as RFC3339 string - chaincode will parse it to time.Time
      };

      // Log the createdAt field to verify it's being sent
      console.log(
        `[Fabric Adapter] Sending createdAt: ${interactionForBlockchain.createdAt} (matches timestamp: ${interactionForBlockchain.timestamp === interactionForBlockchain.createdAt})`
      );

      // Submit transaction to record the interaction
      // Chaincode function: RecordInteraction(ctx, requestId string, interactionJSON string)
      // Note: requestId is first parameter, then JSON string as second parameter
      const transactionResult = await this.contract.submitTransaction(
        'RecordInteraction',
        event.requestId,
        JSON.stringify(interactionForBlockchain)
      );

      // Extract transaction ID from the result if available
      // Fabric returns the transaction ID as part of the response
      let txId: string = event.requestId; // Default fallback to requestId

      // Try to extract transaction ID from the result
      if (transactionResult) {
        try {
          const resultStr = transactionResult.toString();
          // If the result contains JSON, parse it to get the transaction ID
          if (resultStr.startsWith('{')) {
            const resultObj = JSON.parse(resultStr);
            txId =
              resultObj.transactionId ||
              resultObj.txId ||
              resultObj.id ||
              event.requestId;
          } else if (resultStr.length > 0) {
            // If it's a direct transaction ID string
            txId = resultStr;
          }
        } catch (parseError) {
          // If parsing fails, use the requestId as fallback
          console.warn(
            '[FabricAdapter] Could not parse transaction result, using requestId:',
            parseError
          );
        }
      }

      console.log(
        '[Fabric Adapter] ✅ Successfully submitted to Fabric - Request ID:',
        event.requestId,
        'TX ID:',
        txId
      );
      return txId;
    } catch (error: any) {
      console.error(
        '[Fabric Adapter] ❌ Failed to submit:',
        error.message || error
      );
      throw new Error(
        `Failed to record to blockchain: ${error.message || error}`
      );
    }
  }

  /**
   * Query a specific audit event by requestId
   */
  async queryAuditEvent(requestId: string): Promise<AIInteraction | null> {
    if (!this.isConnected || !this.contract) {
      throw new Error('Not connected to blockchain network');
    }

    console.log(`[FabricAdapter] Querying audit event: ${requestId}`);

    try {
      // Evaluate transaction to query the interaction
      // Chaincode function: QueryInteraction(ctx, requestId string)
      const result = await this.contract.evaluateTransaction(
        'QueryInteraction',
        requestId
      );

      // Check if result is empty
      if (!result || result.length === 0) {
        console.log(
          `[FabricAdapter] No blockchain record found for requestId: ${requestId}`
        );
        return null;
      }

      const resultStr = result.toString();
      if (!resultStr || resultStr === '') {
        console.log(`[FabricAdapter] Empty result for requestId: ${requestId}`);
        return null;
      }

      const interaction = JSON.parse(resultStr);
      console.log(
        `[FabricAdapter] Successfully retrieved audit event: ${requestId}`
      );
      return interaction;
    } catch (error: any) {
      console.error(
        `[FabricAdapter] Blockchain query failed:`,
        error.message || error
      );

      // Check if it's a "not found" error - return null instead of throwing
      if (
        error.message?.includes('not found') ||
        error.message?.includes('does not exist') ||
        error.message?.includes('Query failed')
      ) {
        console.log(
          `[FabricAdapter] Record not found on blockchain: ${requestId}`
        );
        return null;
      }

      // Real error - throw it with better context
      throw new Error(
        `Blockchain query failed for ${requestId}: ${error.message || error}`
      );
    }
  }

  /**
   * Query all audit events for an organization
   */
  async queryAuditEventsByOrg(orgId: string): Promise<AIInteraction[]> {
    if (!this.isConnected || !this.contract) {
      throw new Error('Not connected to blockchain network');
    }

    console.log(`Querying audit events for organization: ${orgId}`);

    try {
      // Evaluate transaction to query by organization
      // Chaincode function: QueryInteractionsByOrganization(ctx, orgId string)
      const result = await this.contract.evaluateTransaction(
        'QueryInteractionsByOrganization',
        orgId
      );

      const interactions = JSON.parse(result.toString());
      console.log(
        `Found ${interactions.length} interactions for organization ${orgId}`
      );
      return interactions;
    } catch (error) {
      console.error('Failed to query audit events by organization:', error);
      throw error;
    }
  }

  /**
   * Query audit events by date range
   */
  async queryAuditEventsByDateRange(
    startDate: string,
    endDate: string
  ): Promise<AIInteraction[]> {
    if (!this.isConnected || !this.contract) {
      throw new Error('Not connected to blockchain network');
    }

    console.log(`Querying audit events from ${startDate} to ${endDate}`);

    try {
      // Evaluate transaction to query by date range
      // Chaincode function: QueryInteractionsByDateRange(ctx, startDate string, endDate string)
      const result = await this.contract.evaluateTransaction(
        'QueryInteractionsByDateRange',
        startDate,
        endDate
      );

      const interactions = JSON.parse(result.toString());
      console.log(`Found ${interactions.length} interactions in date range`);
      return interactions;
    } catch (error) {
      console.error('Failed to query audit events by date range:', error);
      throw error;
    }
  }

  /**
   * Get history of changes to a specific interaction
   */
  async getInteractionHistory(requestId: string): Promise<any[]> {
    if (!this.isConnected || !this.contract) {
      throw new Error('Not connected to blockchain network');
    }

    console.log(`Getting history for interaction: ${requestId}`);

    try {
      // Evaluate transaction to get history
      // Chaincode function: GetInteractionHistory(ctx, requestId string)
      const result = await this.contract.evaluateTransaction(
        'GetInteractionHistory',
        requestId
      );

      const history = JSON.parse(result.toString());
      console.log(
        `Found ${history.length} history entries for interaction ${requestId}`
      );
      return history;
    } catch (error) {
      console.error('Failed to get interaction history:', error);
      throw error;
    }
  }

  /**
   * Verify PHI compliance for a specific interaction
   */
  async verifyPHICompliance(
    requestId: string
  ): Promise<{ isCompliant: boolean; message: string }> {
    if (!this.isConnected || !this.contract) {
      throw new Error('Not connected to blockchain network');
    }

    console.log(`Verifying PHI compliance for interaction: ${requestId}`);

    try {
      // Evaluate transaction to verify compliance
      const result = await this.contract.evaluateTransaction(
        'VerifyPHICompliance',
        requestId
      );

      const response = JSON.parse(result.toString());
      return response;
    } catch (error) {
      console.error('Failed to verify PHI compliance:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the blockchain network
   */
  async disconnect(): Promise<void> {
    if (this.gateway) {
      await this.gateway.disconnect();
      this.isConnected = false;
      this.contract = null;
      this.network = null;
      console.log('Disconnected from Fabric network');
    }
  }

  /**
   * Check if currently connected
   */
  isConnectedToNetwork(): boolean {
    return this.isConnected;
  }
}
