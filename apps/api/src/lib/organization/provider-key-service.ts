/**
 * Provider Key Service for Node2AI
 * Manages encrypted storage and validation of AI provider API keys
 */

import db from '@/lib/db/client';
import {
  encryptProviderKey,
  decryptProviderKey,
  generateEncryptionKey,
} from '@/lib/security/encryption';
import { OpenAIProvider } from '@/lib/providers/openai';
import { AnthropicProvider } from '@/lib/providers/anthropic';
import { GoogleProvider } from '@/lib/providers/google';
import { PerplexityProvider } from '@/lib/providers/perplexity';

export interface ProviderKey {
  id: string;
  organizationId: string;
  provider: string;
  encryptedKey: string;
  keyMetadata: {
    model?: string;
    region?: string;
    environment?: string;
    description?: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastTestedAt?: Date;
  lastTestStatus?: 'success' | 'failed';
  lastTestError?: string;
}

export interface CreateProviderKeyRequest {
  organizationId: string;
  provider: string;
  apiKey: string;
  keyMetadata?: {
    model?: string;
    region?: string;
    environment?: string;
    description?: string;
  };
}

export interface TestProviderKeyResult {
  success: boolean;
  latency?: number;
  error?: string;
  models?: string[];
  capabilities?: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    embeddings: boolean;
  };
}

export class ProviderKeyService {
  private encryptionKey: string;

  constructor() {
    // In production, this should come from environment variables
    this.encryptionKey =
      process.env.PROVIDER_KEY_ENCRYPTION_KEY || generateEncryptionKey();
  }

  /**
   * Create a new provider key
   */
  async createProviderKey(
    request: CreateProviderKeyRequest
  ): Promise<ProviderKey> {
    try {
      // Encrypt the API key
      const encryptedKey = encryptProviderKey(
        request.apiKey,
        this.encryptionKey
      );

      // Create provider key record
      const providerKey = await db.providerKey.create({
        data: {
          organizationId: request.organizationId,
          provider: request.provider,
          encryptedKey,
          keyMetadata: request.keyMetadata || {},
          isActive: true,
        },
      });

      return {
        id: providerKey.id,
        organizationId: providerKey.organizationId,
        provider: providerKey.provider,
        encryptedKey: providerKey.encryptedKey,
        keyMetadata: providerKey.keyMetadata as any,
        isActive: providerKey.isActive,
        createdAt: providerKey.createdAt,
        updatedAt: providerKey.updatedAt,
        lastTestedAt: (providerKey as any).lastTestedAt,
        lastTestStatus: (providerKey as any).lastTestStatus,
        lastTestError: (providerKey as any).lastTestError,
      };
    } catch (error) {
      throw new Error(
        `Failed to create provider key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * List provider keys for an organization
   */
  async listProviderKeys(organizationId: string): Promise<ProviderKey[]> {
    try {
      const providerKeys = await db.providerKey.findMany({
        where: {
          organizationId,
          isActive: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return providerKeys.map(key => ({
        id: key.id,
        organizationId: key.organizationId,
        provider: key.provider,
        encryptedKey: key.encryptedKey,
        keyMetadata: key.keyMetadata as any,
        isActive: key.isActive,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        lastTestedAt: (key as any).lastTestedAt,
        lastTestStatus: (key as any).lastTestStatus,
        lastTestError: (key as any).lastTestError,
      }));
    } catch (error) {
      throw new Error(
        `Failed to list provider keys: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get a specific provider key
   */
  async getProviderKey(
    id: string,
    organizationId: string
  ): Promise<ProviderKey | null> {
    try {
      const providerKey = await db.providerKey.findUnique({
        where: {
          id,
        },
      });

      if (!providerKey) {
        return null;
      }

      return {
        id: providerKey.id,
        organizationId: providerKey.organizationId,
        provider: providerKey.provider,
        encryptedKey: providerKey.encryptedKey,
        keyMetadata: providerKey.keyMetadata as any,
        isActive: providerKey.isActive,
        createdAt: providerKey.createdAt,
        updatedAt: providerKey.updatedAt,
        lastTestedAt: (providerKey as any).lastTestedAt,
        lastTestStatus: (providerKey as any).lastTestStatus,
        lastTestError: (providerKey as any).lastTestError,
      };
    } catch (error) {
      throw new Error(
        `Failed to get provider key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update a provider key
   */
  async updateProviderKey(
    id: string,
    organizationId: string,
    updates: {
      apiKey?: string;
      keyMetadata?: any;
      isActive?: boolean;
    }
  ): Promise<ProviderKey> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (updates.apiKey) {
        updateData.encryptedKey = encryptProviderKey(
          updates.apiKey,
          this.encryptionKey
        );
      }

      if (updates.keyMetadata) {
        updateData.keyMetadata = updates.keyMetadata;
      }

      if (updates.isActive !== undefined) {
        updateData.isActive = updates.isActive;
      }

      const providerKey = await db.providerKey.update({
        where: {
          id,
          organizationId,
        },
        data: updateData,
      });

      return {
        id: providerKey.id,
        organizationId: providerKey.organizationId,
        provider: providerKey.provider,
        encryptedKey: providerKey.encryptedKey,
        keyMetadata: providerKey.keyMetadata as any,
        isActive: providerKey.isActive,
        createdAt: providerKey.createdAt,
        updatedAt: providerKey.updatedAt,
        lastTestedAt: providerKey.lastTestedAt,
        lastTestStatus: providerKey.lastTestStatus as any,
        lastTestError: providerKey.lastTestError,
      };
    } catch (error) {
      throw new Error(
        `Failed to update provider key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete a provider key
   */
  async deleteProviderKey(id: string, organizationId: string): Promise<void> {
    try {
      await db.providerKey.update({
        where: {
          id,
          organizationId,
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        } as any,
      });
    } catch (error) {
      throw new Error(
        `Failed to delete provider key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test a provider key connection
   */
  async testProviderKey(
    id: string,
    organizationId: string
  ): Promise<TestProviderKeyResult> {
    try {
      const providerKey = await this.getProviderKey(id, organizationId);
      if (!providerKey) {
        throw new Error('Provider key not found');
      }

      // Decrypt the API key
      const apiKey = decryptProviderKey(
        providerKey.encryptedKey,
        this.encryptionKey
      );

      // Create provider instance and test connection
      const provider = this.createProviderInstance(
        providerKey.provider,
        apiKey
      );
      const startTime = Date.now();

      try {
        const isHealthy = await provider.testConnection();
        const latency = Date.now() - startTime;

        if (isHealthy) {
          // Update last test status
          await db.providerKey.update({
            where: { id },
            data: {
              lastTestedAt: new Date(),
              lastTestStatus: 'success',
              lastTestError: null,
            } as any,
          });

          return {
            success: true,
            latency,
            models: provider.models,
            capabilities: provider.getCapabilities(),
          };
        } else {
          throw new Error('Connection test failed');
        }
      } catch (error) {
        // Update last test status with error
        await db.providerKey.update({
          where: { id },
          data: {
            lastTestedAt: new Date(),
            lastTestStatus: 'failed',
            lastTestError:
              error instanceof Error ? error.message : 'Unknown error',
          } as any,
        });

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    } catch (error) {
      throw new Error(
        `Failed to test provider key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get decrypted API key for internal use
   */
  async getDecryptedApiKey(
    id: string,
    organizationId: string
  ): Promise<string> {
    try {
      const providerKey = await this.getProviderKey(id, organizationId);
      if (!providerKey) {
        throw new Error('Provider key not found');
      }

      return decryptProviderKey(providerKey.encryptedKey, this.encryptionKey);
    } catch (error) {
      throw new Error(
        `Failed to get decrypted API key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create provider instance for testing
   */
  private createProviderInstance(provider: string, apiKey: string): any {
    switch (provider) {
      case 'openai':
        return new OpenAIProvider(apiKey);
      case 'anthropic':
        return new AnthropicProvider(apiKey);
      case 'google':
        return new GoogleProvider(apiKey);
      case 'perplexity':
        return new PerplexityProvider(apiKey);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get provider key statistics
   */
  async getProviderKeyStats(organizationId: string): Promise<{
    totalKeys: number;
    activeKeys: number;
    providers: Record<string, number>;
    lastTested: Date | null;
  }> {
    try {
      const keys = await db.providerKey.findMany({
        where: {
          organizationId,
          isActive: true,
        },
      });

      const providers: Record<string, number> = {};
      let lastTested: Date | null = null;

      keys.forEach(key => {
        providers[key.provider] = (providers[key.provider] || 0) + 1;
        if (
          key.lastTestedAt &&
          (!lastTested || key.lastTestedAt > lastTested)
        ) {
          lastTested = key.lastTestedAt;
        }
      });

      return {
        totalKeys: keys.length,
        activeKeys: keys.filter(k => k.isActive).length,
        providers,
        lastTested,
      };
    } catch (error) {
      throw new Error(
        `Failed to get provider key stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
