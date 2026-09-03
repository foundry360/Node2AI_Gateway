/**
 * Base Provider Interface for Node2AI
 * Defines the contract that all AI providers must implement
 * Supports both streaming and non-streaming responses
 */

import {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '@/lib/types/providers';

/**
 * Abstract base class for all AI providers
 * Implements common functionality and defines the interface
 */
export abstract class Provider {
  /**
   * Provider name (e.g., 'openai', 'anthropic', 'google')
   */
  abstract readonly name: string;

  /**
   * List of models supported by this provider
   */
  abstract models: string[];

  /**
   * Provider configuration
   */
  protected config: any;

  /**
   * Initialize the provider with configuration
   */
  constructor(config: any) {
    this.config = config;
  }

  /**
   * Get a chat completion from the provider
   * @param messages Array of conversation messages
   * @param options Chat completion options
   * @returns Promise resolving to chat response
   */
  abstract chat(
    messages: Message[],
    options: ChatOptions
  ): Promise<ChatResponse>;

  /**
   * Get a streaming chat completion from the provider
   * @param messages Array of conversation messages
   * @param options Chat completion options
   * @returns Async iterator yielding chat chunks
   */
  abstract stream(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<ChatChunk>;

  /**
   * Calculate the cost for a given model and token usage
   * @param model Model name
   * @param tokensIn Number of input tokens
   * @param tokensOut Number of output tokens
   * @returns Cost in USD
   */
  protected abstract calculateCost(
    model: string,
    tokensIn: number,
    tokensOut: number
  ): number;

  /**
   * Get provider-specific model information
   * @param model Model name
   * @returns Model information or null if not found
   */
  abstract getModelInfo(model: string): any | null;

  /**
   * Check if a model is supported by this provider
   * @param model Model name
   * @returns True if model is supported
   */
  isModelSupported(model: string): boolean {
    return this.models.includes(model);
  }

  /**
   * Get the cost for a chat completion
   * @param model Model name
   * @param usage Token usage information
   * @returns Cost in USD
   */
  getCost(
    model: string,
    usage: { promptTokens: number; completionTokens: number }
  ): number {
    return this.calculateCost(
      model,
      usage.promptTokens,
      usage.completionTokens
    );
  }

  /**
   * Validate provider configuration
   * @returns True if configuration is valid
   */
  abstract validateConfig(): boolean;

  /**
   * Test provider connectivity
   * @returns Promise resolving to true if provider is accessible
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Fetch available models from the provider API (optional)
   * Returns empty array if provider doesn't support fetching models or key is invalid
   * @returns Promise resolving to array of model IDs
   */
  async fetchAvailableModels(): Promise<string[]> {
    return []; // Default: provider doesn't support fetching models
  }

  /**
   * Get provider health status
   * @returns Promise resolving to health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      const isHealthy = await this.testConnection();
      const latency = Date.now() - startTime;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latency,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get provider capabilities
   * @returns Provider capabilities
   */
  getCapabilities(): {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    embeddings: boolean;
    fineTuning: boolean;
  } {
    return {
      streaming: true,
      functionCalling: false,
      vision: false,
      embeddings: false,
      fineTuning: false,
    };
  }

  /**
   * Normalize provider response to standard format
   * @param response Raw provider response
   * @returns Normalized response
   */
  protected normalizeResponse(response: any): ChatResponse {
    return {
      content: response.content || '',
      usage: {
        prompt_tokens:
          response.usage?.promptTokens || response.usage?.prompt_tokens || 0,
        completion_tokens:
          response.usage?.completionTokens ||
          response.usage?.completion_tokens ||
          0,
        total_tokens:
          response.usage?.totalTokens || response.usage?.total_tokens || 0,
      },
      finishReason: response.finish_reason || 'stop',
    } as any;
  }

  /**
   * Handle provider-specific errors
   * @param error Raw error from provider
   * @returns Standardized error
   */
  protected handleError(error: any): Error {
    if (error.response) {
      // HTTP error response
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;

      switch (status) {
        case 401:
          return new Error(`Authentication failed: ${message}`);
        case 429:
          return new Error(`Rate limit exceeded: ${message}`);
        case 500:
          return new Error(`Provider server error: ${message}`);
        default:
          return new Error(`Provider error (${status}): ${message}`);
      }
    }

    return new Error(`Provider error: ${error.message}`);
  }

  /**
   * Get provider statistics
   * @returns Provider usage statistics
   */
  async getStatistics(): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    averageLatency: number;
    errorRate: number;
  }> {
    // TODO: Implement statistics collection
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      errorRate: 0,
    };
  }
}
