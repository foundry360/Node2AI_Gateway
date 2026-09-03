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
  userId: string;

  // Hashes & Proofs
  inputHash: string; // SHA256 of original user prompt
  sanitizedPromptHash: string; // SHA256 of sanitized prompt sent to AI
  aiResponseHash: string; // SHA256 of original AI response
  sanitizedResponseHash: string; // SHA256 of sanitized AI response
  desanitizedResponseHash: string; // SHA256 of desanitized response shown to user
  digitalSignature?: string; // Digital signature of transaction
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
        throw new Error(
          `User identity ${this.config.userId} not found in wallet`
        );
      }

      // Connect to gateway with discovery enabled
      await this.gateway.connect(connectionProfile, {
        wallet,
        identity: this.config.userId,
        discovery: { enabled: true, asLocalhost: true },
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

    console.log(`Recording audit event: ${event.requestId}`);

    try {
      // Create interaction object with all fields for blockchain storage
      const interactionForBlockchain = {
        requestId: event.requestId,
        timestamp: event.timestamp,
        organization: event.organization,
        userId: event.userId,
        inputHash: event.inputHash,
        sanitizedPromptHash: event.sanitizedPromptHash,
        aiResponseHash: event.aiResponseHash,
        sanitizedResponseHash: event.sanitizedResponseHash,
        desanitizedResponseHash: event.desanitizedResponseHash,
        digitalSignature: event.digitalSignature,
        merkleRoot: event.merkleRoot,
        phiDetected: event.phiDetected,
        phiExposed: event.phiExposed,
        purpose: event.purpose,
        dataClassification: event.dataClassification,
        regulatoryContext: event.regulatoryContext,
        approvalHash: event.approvalHash,
        aiProvider: event.aiProvider,
        model: event.model,
        modelVersion: event.modelVersion,
        tokensUsed: event.tokensUsed,
        tokensInput: event.tokensInput,
        tokensOutput: event.tokensOutput,
        costUsd: event.costUsd,
        processingTimeMs: event.processingTimeMs,
        success: event.success,
        errorCode: event.errorCode,
        temperature: event.temperature,
        topP: event.topP,
        systemPromptHash: event.systemPromptHash,
        featureFlags: event.featureFlags,
        hipaaCompliant: event.hipaaCompliant,
        sessionId: event.sessionId,
        conversationId: event.conversationId,
      };

      // Submit transaction to record the interaction
      await this.contract.submitTransaction(
        'RecordInteraction',
        event.requestId,
        JSON.stringify(interactionForBlockchain)
      );

      console.log(`Successfully recorded audit event: ${event.requestId}`);
      return event.requestId;
    } catch (error) {
      console.error('Failed to record audit event:', error);
      throw error;
    }
  }

  /**
   * Query a specific audit event by requestId
   */
  async queryAuditEvent(requestId: string): Promise<AIInteraction> {
    if (!this.isConnected || !this.contract) {
      throw new Error('Not connected to blockchain network');
    }

    console.log(`Querying audit event: ${requestId}`);

    try {
      // Evaluate transaction to query the interaction
      const result = await this.contract.evaluateTransaction(
        'QueryInteraction',
        requestId
      );

      const interaction = JSON.parse(result.toString());
      console.log(`Successfully retrieved audit event: ${requestId}`);
      return interaction;
    } catch (error) {
      console.error('Failed to query audit event:', error);
      throw error;
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
