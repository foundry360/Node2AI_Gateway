/**
 * Blockchain Service for Node2AI
 * Wraps FabricBlockchainAdapter and provides simplified API for recording AI interactions
 */

import {
  createHash,
  createSign,
  createVerify,
  createPublicKey,
  generateKeyPairSync,
} from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import blockchain adapters - PRODUCTION REQUIREMENT
import { FabricBlockchainAdapter, AIInteraction } from './sdk/fabric-adapter';

export interface AuditEvent {
  // Transaction Metadata
  requestId: string;
  organizationId: string;
  userId: string;

  // Input/Output Data (will be hashed before blockchain)
  originalInput: string;
  sanitizedPrompt: string;
  aiResponse: string;
  sanitizedResponse: string;
  desanitizedResponse: string;

  // Compliance Data
  phiDetected: string[];
  purpose?: string;
  dataClassification?: string;
  regulatoryContext?: string[];
  approvalHash?: string;

  // Provider & Model Info
  aiProvider: string;
  model: string;
  modelVersion?: string;

  // Usage Metrics
  tokensUsed: number;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd: number;
  processingTimeMs: number;
  success: boolean;
  errorCode?: string;

  // Configuration
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  featureFlags?: string[];

  // Session Linking
  sessionId?: string;
  conversationId?: string;
}

export class BlockchainService {
  private adapter: any = null;
  private isConnected: boolean = false;
  private enabled: boolean = true; // Can be controlled via env variable
  private connectionPromise: Promise<void> | null = null;
  private signingPrivateKey: string | null = null;
  private signingPublicKey: string | null = null;
  private signingKeyId: string | null = null;
  private kmsKeyId: string | null = null;

  constructor() {
    // Check if blockchain is enabled
    this.enabled = process.env.BLOCKCHAIN_ENABLED !== 'false';

    if (!this.enabled) {
      console.log('[Blockchain Service] Blockchain audit trail is disabled');
      return;
    }

    // Get configuration from environment variables (production-ready)
    const connectionProfilePath =
      process.env.BLOCKCHAIN_CONNECTION_PROFILE ||
      process.env.FABRIC_CONNECTION_PROFILE ||
      path.join(
        os.homedir(),
        'hyperledger',
        'fabric-samples',
        'test-network',
        'organizations',
        'peerOrganizations',
        'org1.example.com',
        'connection-org1.json'
      );

    const walletPath =
      process.env.BLOCKCHAIN_WALLET_PATH ||
      path.resolve(process.cwd(), '..', '..', 'blockchain', 'wallet');

    const channelName = process.env.BLOCKCHAIN_CHANNEL_NAME || 'node2aichannel';

    const chaincodeName = process.env.BLOCKCHAIN_CHAINCODE_NAME || 'node2ai';

    const organizationMSP = process.env.BLOCKCHAIN_ORG_MSP || 'Org1MSP';

    const userId = process.env.BLOCKCHAIN_USER_ID || 'admin';

    // Log configuration (without sensitive paths)
    console.log('[Blockchain Service] Configuration:');
    console.log(`  Enabled: ${this.enabled}`);
    console.log(`  Channel: ${channelName}`);
    console.log(`  Chaincode: ${chaincodeName}`);
    console.log(`  Organization MSP: ${organizationMSP}`);
    console.log(`  User ID: ${userId}`);
    console.log(`  Wallet Path: ${walletPath}`);
    console.log(`  Connection Profile: ${connectionProfilePath}`);

    this.kmsKeyId = process.env.BLOCKCHAIN_KMS_KEY_ID || null;

    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const devKeysDir = path.join(repoRoot, 'blockchain', 'dev-keys');
    const defaultSigningKeyPath = path.join(devKeysDir, 'signing-key.pem');
    const defaultPublicKeyPath = path.join(devKeysDir, 'signing-key.pub.pem');

    let signingKeyPath =
      process.env.BLOCKCHAIN_SIGNING_KEY_PATH &&
      process.env.BLOCKCHAIN_SIGNING_KEY_PATH.trim().length > 0
        ? process.env.BLOCKCHAIN_SIGNING_KEY_PATH
        : undefined;
    const inlineSigningKey = process.env.BLOCKCHAIN_SIGNING_KEY;
    let signingKeyId = process.env.BLOCKCHAIN_SIGNING_KEY_ID || undefined;

    if (
      !inlineSigningKey &&
      !signingKeyPath &&
      fs.existsSync(defaultSigningKeyPath)
    ) {
      signingKeyPath = defaultSigningKeyPath;
      signingKeyId = signingKeyId || 'Node2AI Development Key';
    }

    if (!inlineSigningKey && !signingKeyPath && !this.kmsKeyId) {
      try {
        fs.mkdirSync(devKeysDir, { recursive: true });
        const { privateKey, publicKey } = generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        });
        fs.writeFileSync(defaultSigningKeyPath, privateKey, { mode: 0o600 });
        fs.writeFileSync(defaultPublicKeyPath, publicKey, { mode: 0o600 });
        signingKeyPath = defaultSigningKeyPath;
        signingKeyId = signingKeyId || 'Node2AI Development Key';
        console.log(
          `[Blockchain Service] Generated development signing key at ${defaultSigningKeyPath}`
        );
      } catch (generationError) {
        console.warn(
          '[Blockchain Service] Failed to generate development signing key:',
          generationError
        );
      }
    }

    if (inlineSigningKey || signingKeyPath) {
      try {
        this.signingPrivateKey =
          inlineSigningKey ||
          (signingKeyPath ? fs.readFileSync(signingKeyPath, 'utf8') : null);

        if (this.signingPrivateKey) {
          try {
            const publicKey = createPublicKey(this.signingPrivateKey).export({
              type: 'spki',
              format: 'pem',
            });
            this.signingPublicKey =
              typeof publicKey === 'string'
                ? publicKey
                : publicKey.toString('utf8');
            this.signingKeyId =
              signingKeyId || this.signingKeyId || 'Node2AI Service';
            console.log(
              `[Blockchain Service] Signing key loaded (${signingKeyPath ? 'file' : 'inline'})`
            );
          } catch (publicKeyError) {
            console.error(
              '[Blockchain Service] Failed to derive public key:',
              publicKeyError
            );
            this.signingPrivateKey = null;
          }
        }
      } catch (keyError) {
        console.error(
          '[Blockchain Service] Failed to load blockchain signing key:',
          keyError
        );
        this.signingPrivateKey = null;
      }
    } else if (this.kmsKeyId) {
      console.log(
        `[Blockchain Service] KMS key configured (${this.kmsKeyId}) — signing deferred to future implementation`
      );
    } else {
      console.log(
        '[Blockchain Service] No blockchain signing key configured — signatures will be omitted'
      );
    }
    if (!this.signingKeyId && signingKeyId) {
      this.signingKeyId = signingKeyId;
    }

    try {
      this.adapter = new FabricBlockchainAdapter({
        walletPath,
        connectionProfilePath,
        channelName,
        chaincodeName,
        organizationMSP,
        userId,
      });

      // Mark as initialized (connection will be established asynchronously)
      console.log('[Blockchain Service] ✅ Initialized with adapter');

      // Connect asynchronously (don't block startup)
      this.connectionPromise = this.connectAsync()
        .then(() => {
          this.isConnected = true;
          console.log(
            '[Blockchain Service] ✅ Connection established and ready'
          );
        })
        .catch(err => {
          this.isConnected = false;
          console.error(
            '[Blockchain Service] ❌ Failed to connect to blockchain on startup:',
            err
          );
          console.log(
            '[Blockchain Service] Connection will be retried on next operation'
          );
        });
    } catch (error) {
      console.error(
        '[Blockchain Service] ❌ Failed to initialize adapter:',
        error
      );
      this.adapter = null;
    }
  }

  /**
   * Connect to blockchain asynchronously
   */
  private async connectAsync(): Promise<void> {
    if (!this.adapter || !this.enabled) {
      return;
    }

    try {
      await this.adapter.connect();
      this.isConnected = true;
      console.log('Blockchain service connected successfully');
    } catch (error) {
      console.error('❌ CRITICAL: Blockchain connection failed:', error);
      this.isConnected = false;
      const reason =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      throw new Error(
        `Failed to connect to Hyperledger Fabric blockchain. System cannot start without blockchain connection. Details: ${reason}`
      );
    }
  }

  /**
   * Hash data using SHA256
   */
  hashData(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Generate digital signature for transaction
   */
  private signData(data: string): string | null {
    if (this.signingPrivateKey) {
      try {
        const sign = createSign('RSA-SHA256');
        sign.update(data);
        sign.end();
        return sign.sign(this.signingPrivateKey, 'base64');
      } catch (error) {
        console.warn('Failed to generate digital signature:', error);
        return null;
      }
    }

    if (this.kmsKeyId) {
      return this.signWithKMS(data);
    }

    return null;
  }

  /**
   * Placeholder for future KMS-based signing
   * Returns null for now while long-term solution is implemented.
   */
  private signWithKMS(_data: string): string | null {
    console.warn(
      '[Blockchain Service] KMS signing requested but not yet implemented; transaction recorded without digital signature.'
    );
    return null;
  }

  private createSignaturePayload(data: {
    requestId: string;
    timestamp: string;
    organization: string;
    userId: string;
    inputHash: string;
    sanitizedHash: string;
  }): string {
    const payload = {
      requestId: data.requestId,
      timestamp: data.timestamp,
      organization: data.organization,
      userId: data.userId,
      inputHash: data.inputHash || '',
      sanitizedHash: data.sanitizedHash || '',
    };

    return JSON.stringify(payload);
  }

  private verifySignature(interaction: any): {
    status: 'Valid' | 'Invalid' | 'Pending';
    signature?: string;
    signedBy?: string;
    publicKey?: string;
  } {
    const signature =
      interaction.digitalSignature || interaction.signature || null;

    if (!signature) {
      return { status: 'Pending' };
    }

    const payload = this.createSignaturePayload({
      requestId: interaction.requestId,
      timestamp: interaction.timestamp,
      organization:
        interaction.organization || interaction.organizationId || '',
      userId: interaction.userId || '',
      inputHash: interaction.inputHash || interaction.input_hash || '',
      sanitizedHash:
        interaction.sanitizedHash ||
        interaction.sanitizedPromptHash ||
        interaction.sanitized_hash ||
        '',
    });

    const recordPublicKey =
      interaction.publicKey || interaction.public_key || null;
    const availablePublicKey =
      recordPublicKey ||
      this.signingPublicKey ||
      process.env.BLOCKCHAIN_PUBLIC_KEY ||
      null;
    const signer =
      interaction.signedBy ||
      interaction.signed_by ||
      this.signingKeyId ||
      undefined;

    if (!availablePublicKey) {
      return {
        status: 'Pending',
        signature,
        signedBy: signer,
      };
    }

    try {
      const verify = createVerify('RSA-SHA256');
      verify.update(payload);
      verify.end();
      const isValid = verify.verify(availablePublicKey, signature, 'base64');

      return {
        status: isValid ? 'Valid' : 'Invalid',
        signature,
        signedBy: signer,
        publicKey: availablePublicKey,
      };
    } catch (error) {
      console.warn(
        '[Blockchain Service] Signature verification encountered an error:',
        error
      );
      return {
        status: 'Invalid',
        signature,
        signedBy: signer,
        publicKey: availablePublicKey,
      };
    }
  }

  /**
   * Calculate Merkle root for a batch of transactions
   */
  calculateMerkleRoot(transactionHashes: string[]): string {
    if (transactionHashes.length === 0) {
      return '';
    }
    if (transactionHashes.length === 1) {
      return transactionHashes[0];
    }

    // Recursive Merkle root calculation
    const nextLevel: string[] = [];
    for (let i = 0; i < transactionHashes.length; i += 2) {
      const left = transactionHashes[i];
      const right =
        i + 1 < transactionHashes.length ? transactionHashes[i + 1] : left;
      const combined = this.hashData(left + right);
      nextLevel.push(combined);
    }

    return this.calculateMerkleRoot(nextLevel);
  }

  /**
   * Record an audit event on the blockchain with retry logic
   */
  async recordAuditEvent(
    event: AuditEvent,
    maxRetries: number = 5
  ): Promise<string | null> {
    // PRODUCTION REQUIREMENT: Blockchain MUST be connected
    if (!this.enabled || !this.adapter) {
      throw new Error(
        'Blockchain is not available. All AI interactions must be recorded on blockchain for production compliance.'
      );
    }

    let lastError: Error | null = null;

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Ensure we're connected (will wait if connection is in progress)
        await this.ensureConnected();

        // Verify adapter is actually connected before attempting
        if (!this.adapter.isConnected) {
          console.warn(
            `[BlockchainService] Adapter reports not connected (attempt ${attempt}/${maxRetries}), reconnecting...`
          );
          this.isConnected = false;
          this.connectionPromise = null;
          await this.ensureConnected();
        }

        // Hash all versions of prompts and responses
        const inputHash = this.hashData(event.originalInput || '');
        const sanitizedHash = this.hashData(event.sanitizedPrompt || '');
        const aiResponseHash = this.hashData(event.aiResponse || '');
        const sanitizedResponseHash = this.hashData(
          event.sanitizedResponse || ''
        );
        const desanitizedResponseHash = this.hashData(
          event.desanitizedResponse || ''
        );
        const systemPromptHash = event.systemPrompt
          ? this.hashData(event.systemPrompt)
          : undefined;

        const timestamp = new Date().toISOString();

        // Create transaction data for digital signature
        const transactionData = this.createSignaturePayload({
          requestId: event.requestId,
          timestamp,
          organization: event.organizationId,
          userId: event.userId,
          inputHash,
          sanitizedHash,
        });

        // Generate digital signature (if configured)
        const digitalSignature = this.signData(transactionData);

        // Calculate Merkle root (for now, single transaction root)
        // In production, this would reference a batch ID
        const merkleRoot = this.calculateMerkleRoot([inputHash]);

        // Create comprehensive blockchain interaction record
        const interaction: any = {
          requestId: event.requestId,
          timestamp,
          organization: event.organizationId,
          userId: event.userId,
          inputHash,
          sanitizedHash,
          sanitizedPromptHash: sanitizedHash,
          aiResponseHash,
          sanitizedResponseHash,
          desanitizedResponseHash,
          merkleRoot,
          phiDetected: event.phiDetected,
          phiExposed: false, // Always false - PHI is never exposed
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
          systemPromptHash,
          featureFlags: event.featureFlags,
          hipaaCompliant: true, // Assume compliant if hashes differ
          sessionId: event.sessionId,
          conversationId: event.conversationId,
        };

        if (digitalSignature) {
          interaction.digitalSignature = digitalSignature;
          interaction.signatureAlgorithm = 'RSA-SHA256';
          interaction.signedBy =
            this.signingKeyId || 'Node2AI Service (unsigned)';
          if (this.signingPublicKey) {
            interaction.publicKey = this.signingPublicKey;
          }
        }

        // Record on blockchain
        const txId = await this.adapter.recordAuditEvent(interaction);
        console.log(
          `[BlockchainService] ✅ Blockchain audit event recorded - Request ID: ${event.requestId}, TX ID: ${txId || 'N/A'} (attempt ${attempt})`
        );

        // Return the actual blockchain transaction ID, fallback to requestId if txId is not available
        return txId || event.requestId;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isConnectionError =
          error?.message?.includes('not connected') ||
          error?.message?.includes('connection') ||
          error?.message?.includes('network') ||
          error?.message?.includes('No valid responses from any peers') ||
          error?.message?.includes('endorsement') ||
          error?.message?.includes('chaincode') ||
          error?.message?.includes('access denied') ||
          error?.message?.includes('creator org unknown') ||
          error?.message?.includes('creator is malformed') ||
          error?.code === 'ECONNREFUSED' ||
          error?.code === 'ETIMEDOUT' ||
          error?.code === 2 || // gRPC UNKNOWN error code
          error?.responses?.length === 0;

        console.warn(
          `[BlockchainService] ⚠️ Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`
        );

        // If this is a connection error and we have retries left, reset connection and retry
        if (isConnectionError && attempt < maxRetries) {
          console.log(
            `[BlockchainService] Connection error detected, resetting connection state...`
          );
          this.isConnected = false;
          this.connectionPromise = null;

          // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 2000ms
          const delayMs = Math.min(200 * Math.pow(2, attempt - 1), 2000);
          console.log(
            `[BlockchainService] Waiting ${delayMs}ms before retry...`
          );
          await new Promise(resolve => setTimeout(resolve, delayMs));

          // For peer/chaincode/identity errors, also try to reconnect the adapter
          if (
            error?.message?.includes('No valid responses from any peers') ||
            error?.message?.includes('endorsement') ||
            error?.message?.includes('chaincode') ||
            error?.message?.includes('access denied') ||
            error?.message?.includes('creator org unknown') ||
            error?.message?.includes('creator is malformed')
          ) {
            console.log(
              `[BlockchainService] Peer/chaincode/identity issue detected, reconnecting adapter...`
            );
            try {
              if (
                this.adapter &&
                typeof this.adapter.disconnect === 'function'
              ) {
                await this.adapter.disconnect();
              }
              this.isConnected = false;
              this.connectionPromise = null;
              // Wait a bit longer before reconnecting for identity/access issues
              await new Promise(resolve => setTimeout(resolve, 500));
              await this.ensureConnected();
            } catch (reconnectError) {
              console.warn(
                `[BlockchainService] Reconnection attempt failed:`,
                reconnectError
              );
            }
          }
          continue;
        }

        // If not a connection error or final attempt, throw immediately
        if (!isConnectionError || attempt === maxRetries) {
          break;
        }
      }
    }

    // All retries exhausted
    console.error(
      `[BlockchainService] ❌ Failed to record blockchain audit event after ${maxRetries} attempts:`,
      lastError?.message || 'Unknown error'
    );
    throw lastError || new Error('Blockchain recording failed after retries');
  }

  /**
   * Query an audit event by requestId
   */
  async queryAuditEvent(requestId: string): Promise<any | null> {
    // PRODUCTION REQUIREMENT: Blockchain MUST be connected
    await this.ensureConnected();

    if (!this.enabled || !this.adapter || !this.isConnected) {
      throw new Error(
        'Blockchain is not connected. Cannot query audit events without blockchain connection.'
      );
    }

    try {
      const interaction = await this.adapter.queryAuditEvent(requestId);

      // If not found, return null (adapter now returns null for not found)
      if (!interaction) {
        console.log(
          `[BlockchainService] No record found for requestId: ${requestId}`
        );
        return null;
      }

      const signatureInfo = this.verifySignature(interaction);

      // Enrich with blockchain-specific metadata if available from Fabric
      // Note: These fields come from Fabric transaction metadata
      const enriched = {
        ...interaction,
        // Blockchain metadata
        chain: 'Hyperledger Fabric',
        block: interaction.blockNumber || 'N/A',
        recorded: interaction.timestamp || new Date().toISOString(),
        confirmations: 1, // Fabric provides immutability after commit
        status: 'confirmed',

        // Response hash (already calculated during recordAuditEvent)
        responseHash:
          interaction.sanitizedResponseHash || interaction.aiResponseHash,

        // Cryptographic verification
        signature:
          signatureInfo.signature ||
          interaction.digitalSignature ||
          interaction.signature ||
          'N/A',
        signedBy:
          signatureInfo.signedBy ||
          interaction.signedBy ||
          (signatureInfo.status === 'Pending'
            ? 'Not configured'
            : this.signingKeyId || 'Node2AI Service'),
        publicKey:
          signatureInfo.publicKey ||
          interaction.publicKey ||
          this.signingPublicKey ||
          process.env.BLOCKCHAIN_PUBLIC_KEY ||
          'N/A',
        verificationStatus: signatureInfo.status,
      };

      return enriched;
    } catch (error: any) {
      console.error(
        `[BlockchainService] Failed to query audit event:`,
        error.message || error
      );
      throw error;
    }
  }

  /**
   * Query audit events by organization
   */
  async queryAuditEventsByOrg(orgId: string): Promise<any[]> {
    await this.ensureConnected();

    if (!this.enabled || !this.adapter || !this.isConnected) {
      throw new Error('Blockchain not available');
    }

    try {
      return await this.adapter.queryAuditEventsByOrg(orgId);
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
  ): Promise<any[]> {
    await this.ensureConnected();

    if (!this.enabled || !this.adapter || !this.isConnected) {
      throw new Error('Blockchain not available');
    }

    try {
      return await this.adapter.queryAuditEventsByDateRange(startDate, endDate);
    } catch (error) {
      console.error('Failed to query audit events by date range:', error);
      throw error;
    }
  }

  /**
   * Get interaction history
   */
  async getInteractionHistory(requestId: string): Promise<any[]> {
    await this.ensureConnected();

    if (!this.enabled || !this.adapter || !this.isConnected) {
      throw new Error('Blockchain not available');
    }

    try {
      return await this.adapter.getInteractionHistory(requestId);
    } catch (error) {
      console.error('Failed to get interaction history:', error);
      throw error;
    }
  }

  /**
   * Verify PHI compliance
   */
  async verifyPHICompliance(
    requestId: string
  ): Promise<{ isCompliant: boolean; message: string }> {
    await this.ensureConnected();

    if (!this.enabled || !this.adapter || !this.isConnected) {
      throw new Error('Blockchain not available');
    }

    try {
      return await this.adapter.verifyPHICompliance(requestId);
    } catch (error) {
      console.error('Failed to verify PHI compliance:', error);
      throw error;
    }
  }

  /**
   * Check if blockchain is connected
   * Simple check: if we have an adapter and it's enabled, we're connected
   * The adapter handles its own connection state internally
   */
  isBlockchainConnected(): boolean {
    return this.enabled && !!this.adapter;
  }

  /**
   * Ensure blockchain is connected, waiting if necessary
   */
  async ensureConnected(): Promise<void> {
    if (!this.enabled || !this.adapter) {
      throw new Error(
        'Blockchain service is not enabled or adapter not initialized'
      );
    }

    // If already connected, verify adapter is also connected
    if (this.isConnected) {
      // Double-check adapter is actually connected
      if (this.adapter.isConnected) {
        return;
      } else {
        // Adapter says not connected, reconnect
        console.log(
          '[Blockchain Service] Adapter reports not connected, reconnecting...'
        );
        this.isConnected = false;
        this.connectionPromise = null;
      }
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      console.log('[Blockchain Service] Connection in progress, waiting...');
      await this.connectionPromise;
      // Verify connection was successful
      if (this.adapter.isConnected) {
        this.isConnected = true;
        return;
      }
      // Connection promise completed but adapter still not connected
      this.connectionPromise = null;
    }

    // Start new connection
    console.log('[Blockchain Service] Establishing blockchain connection...');
    this.connectionPromise = this.connectAsync()
      .then(() => {
        // Verify adapter is actually connected
        if (this.adapter.isConnected) {
          this.isConnected = true;
          console.log('[Blockchain Service] ✅ Connection verified and ready');
        } else {
          throw new Error(
            'Adapter connection completed but isConnected flag is false'
          );
        }
      })
      .catch(err => {
        this.isConnected = false;
        this.connectionPromise = null;
        throw err;
      });

    await this.connectionPromise;
  }

  /**
   * Check if blockchain is enabled (regardless of connection status)
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Disconnect from blockchain
   */
  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const blockchainService = new BlockchainService();
