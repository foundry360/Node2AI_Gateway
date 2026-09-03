import { Provider } from '../providers/base';
import { OpenAIProvider } from '../providers/openai';
import { AnthropicProvider } from '../providers/anthropic';
import { GoogleProvider } from '../providers/google';
import { PerplexityProvider } from '../providers/perplexity';
import { LocalProvider } from '../providers/local';
import {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '../types/providers';
import { query } from '../db/postgres-client';
import {
  decryptProviderKey,
  generateEncryptionKey,
} from '../security/encryption';

export interface RoutingConfig {
  primary: string;
  fallback: string[];
  costOptimization: boolean;
  qualityThreshold: number;
  maxRetries: number;
}

export class SmartRouter {
  private providers: Map<string, Provider> = new Map();
  private config: RoutingConfig;

  constructor(config: RoutingConfig) {
    this.config = config;
    this.initializeProviders();
  }

  private async initializeProviders() {
    // Don't initialize local provider - only use providers with API keys
    // Providers will be loaded dynamically when needed based on available keys
  }

  private async loadAvailableProviders(organizationId?: string) {
    // Load all providers that have API keys configured
    const providersToLoad = ['openai', 'anthropic', 'google', 'perplexity'];

    for (const providerName of providersToLoad) {
      if (this.providers.has(providerName)) {
        continue; // Already loaded
      }

      try {
        const apiKey = await this.loadProviderKey(providerName, organizationId);
        if (apiKey) {
          let provider: Provider | null = null;

          switch (providerName) {
            case 'openai':
              provider = new OpenAIProvider(apiKey);
              break;
            case 'anthropic':
              provider = new AnthropicProvider(apiKey);
              break;
            case 'google':
              provider = new GoogleProvider(apiKey);
              break;
            case 'perplexity':
              provider = new PerplexityProvider(apiKey);
              break;
          }

          if (provider) {
            // Fetch actual available models from API for all providers
            if (typeof provider.fetchAvailableModels === 'function') {
              try {
                const availableModels = await provider.fetchAvailableModels();
                if (availableModels && availableModels.length > 0) {
                  // Override models array with fetched models
                  (provider as any).models = availableModels;
                  console.log(
                    `✓ ${providerName} loaded ${availableModels.length} models from API`
                  );
                }
              } catch (fetchError: any) {
                console.warn(
                  `[${providerName}] Could not fetch available models: ${fetchError.message}`
                );
              }
            }

            this.providers.set(providerName, provider);
            console.log(`✓ ${providerName} provider initialized`);
          }
        }
      } catch (error) {
        console.warn(`Could not load ${providerName} key:`, error);
      }
    }
  }

  private async loadProviderKey(
    provider: string,
    organizationId?: string
  ): Promise<string | null> {
    try {
      const encryptionKey =
        process.env.PROVIDER_KEY_ENCRYPTION_KEY || generateEncryptionKey();

      // Use default organization if not provided
      const orgId = organizationId || '00000000-0000-0000-0000-000000000001';

      const result = await query(
        `SELECT encrypted_key 
         FROM provider_keys 
         WHERE provider = $1 
           AND is_active = true 
           AND organization_id = $2
         LIMIT 1`,
        [provider, orgId]
      );

      if (result.rows.length === 0) {
        console.log(
          `No provider key found for ${provider}${organizationId ? ` (org: ${organizationId})` : ''}`
        );
        return null;
      }

      return decryptProviderKey(result.rows[0].encrypted_key, encryptionKey);
    } catch (error) {
      console.error(`Error loading provider key for ${provider}:`, error);
      return null;
    }
  }

  async routeRequest(
    messages: Message[],
    options: ChatOptions,
    organizationId?: string
  ): Promise<ChatResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const startTime = Date.now();

    // Use default organization if not provided
    const orgId = organizationId || '00000000-0000-0000-0000-000000000001';

    // Load all available providers that have API keys configured
    await this.loadAvailableProviders(orgId);

    // Get list of actually available providers (those with keys)
    const availableProviders = Array.from(this.providers.keys());

    if (availableProviders.length === 0) {
      throw new Error(
        `No provider API keys configured for organization ${orgId}. Please configure at least one provider key (OpenAI, Anthropic, Google, or Perplexity) in Settings > Provider Keys.`
      );
    }

    console.log(
      `✓ Loaded ${availableProviders.length} available provider(s) for org ${orgId}: ${availableProviders.join(', ')}`
    );

    // Determine the best provider based on prompt and available providers
    const providerChain = this.determineProviderChain(
      options,
      messages,
      availableProviders
    );

    console.log(`📋 Provider selection chain: ${providerChain.join(' → ')}`);
    console.log(
      `💰 Cost optimization: ${this.config.costOptimization ? 'ENABLED' : 'DISABLED'}`
    );

    let lastError: Error | null = null;
    let bestResponse: ChatResponse | null = null;
    let lowestCost = Infinity;

    for (const providerName of providerChain) {
      try {
        const provider = this.providers.get(providerName);
        if (!provider) {
          console.warn(`Provider ${providerName} not available`);
          continue;
        }

        console.log(`Attempting request with ${providerName} provider`);
        const response = await provider.chat(messages, options);

        // Track metrics
        const latency = Date.now() - startTime;
        console.log(
          `Provider ${providerName} (model: ${response.model}) completed in ${latency}ms, cost: $${response.cost.toFixed(6)}`
        );

        // If cost optimization is enabled, choose the cheapest valid response
        if (this.config.costOptimization) {
          if (response.cost < lowestCost) {
            bestResponse = response;
            lowestCost = response.cost;
            console.log(
              `💰 New cheapest: ${providerName} at $${response.cost.toFixed(6)}`
            );
          } else {
            console.log(
              `💰 ${providerName} is more expensive: $${response.cost.toFixed(6)} vs current best $${lowestCost.toFixed(6)}`
            );
          }
        } else {
          // Use first successful response
          return response;
        }
      } catch (error: any) {
        console.error(`❌ Provider ${providerName} failed:`, error.message);
        lastError = error;

        // If this is the last provider in the chain, we'll throw the error
        if (providerName === providerChain[providerChain.length - 1]) {
          break;
        }
      }
    }

    // Return the best response if cost optimization found one, otherwise throw error
    if (bestResponse) {
      console.log(
        `✅ Selected cheapest provider with cost: $${bestResponse.cost.toFixed(6)}`
      );
      return bestResponse;
    }

    // Provide detailed error message
    if (lastError) {
      console.error(
        `❌ All providers failed. Last error: ${lastError.message}`
      );
      throw new Error(
        `All available providers failed. Last error from ${providerChain[providerChain.length - 1]}: ${lastError.message}. Please check your Provider API keys are valid and the services are accessible.`
      );
    }

    throw new Error(
      'No providers available. Please configure at least one Provider API key in Settings > Provider Keys.'
    );
  }

  async *routeStream(
    messages: Message[],
    options: ChatOptions,
    organizationId?: string
  ): AsyncIterableIterator<ChatChunk> {
    // Load all available providers that have API keys configured
    await this.loadAvailableProviders(organizationId);

    // Get list of actually available providers
    const availableProviders = Array.from(this.providers.keys());

    if (availableProviders.length === 0) {
      throw new Error('No provider API keys configured');
    }

    const providerChain = this.determineProviderChain(
      options,
      messages,
      availableProviders
    );

    for (const providerName of providerChain) {
      try {
        const provider = this.providers.get(providerName);
        if (!provider) {
          console.warn(`Provider ${providerName} not available`);
          continue;
        }

        console.log(`Streaming with ${providerName} provider`);
        yield* provider.stream(messages, options);
        return; // Success, exit the loop
      } catch (error: any) {
        console.error(
          `Provider ${providerName} streaming failed:`,
          error.message
        );

        // If this is the last provider in the chain, we'll throw the error
        if (providerName === providerChain[providerChain.length - 1]) {
          throw error;
        }
      }
    }
  }

  private determineProviderChain(
    options: ChatOptions,
    messages: Message[],
    availableProviders: string[]
  ): string[] {
    const chain: string[] = [];

    // If a specific model is requested, infer provider from model name
    if (options.model) {
      const inferredProvider = this.inferProviderFromModel(options.model);
      if (availableProviders.includes(inferredProvider)) {
        chain.push(inferredProvider);
      }
    }

    // Intelligently select provider based on prompt content
    if (chain.length === 0) {
      const selectedProvider = this.selectProviderForPrompt(
        messages,
        availableProviders
      );
      chain.push(selectedProvider);
    }

    // Add remaining available providers as fallbacks (in cost order)
    const costOrder = ['google', 'perplexity', 'openai', 'anthropic'];
    const remainingProviders = availableProviders.filter(
      p => !chain.includes(p)
    );

    // Sort remaining providers by cost
    const sortedRemaining = remainingProviders.sort((a, b) => {
      const aIndex = costOrder.indexOf(a);
      const bIndex = costOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    chain.push(...sortedRemaining);

    return chain;
  }

  private inferProviderFromModel(modelName: string): string {
    const modelLower = modelName.toLowerCase();
    if (
      modelLower.includes('gpt') ||
      modelLower.includes('o1') ||
      modelLower.includes('dall-e')
    ) {
      return 'openai';
    }
    if (
      modelLower.includes('claude') ||
      modelLower.includes('sonnet') ||
      modelLower.includes('opus')
    ) {
      return 'anthropic';
    }
    if (modelLower.includes('gemini') || modelLower.includes('palm')) {
      return 'google';
    }
    if (
      modelLower.includes('sonar') ||
      modelLower.includes('llama-3.1-sonar')
    ) {
      return 'perplexity';
    }
    return 'openai'; // Default
  }

  private selectProviderForPrompt(
    messages: Message[],
    availableProviders: string[]
  ): string {
    if (availableProviders.length === 0) {
      return 'openai'; // Default fallback
    }

    const promptText = messages
      .map(m => m.content)
      .join(' ')
      .toLowerCase();

    // Perplexity for web/search-related queries
    if (
      availableProviders.includes('perplexity') &&
      (promptText.includes('current') ||
        promptText.includes('latest') ||
        promptText.includes('recent') ||
        promptText.includes('search') ||
        promptText.includes('find') ||
        promptText.includes('what is') ||
        promptText.includes('who is') ||
        promptText.includes('where is'))
    ) {
      return 'perplexity';
    }

    // Google Gemini for reasoning/analysis
    if (
      availableProviders.includes('google') &&
      (promptText.includes('analyze') ||
        promptText.includes('compare') ||
        promptText.includes('explain') ||
        promptText.length > 500) // Longer prompts
    ) {
      return 'google';
    }

    // Anthropic Claude for complex reasoning, coding, or creative tasks
    if (
      availableProviders.includes('anthropic') &&
      (promptText.includes('code') ||
        promptText.includes('function') ||
        promptText.includes('algorithm') ||
        promptText.includes('write') ||
        promptText.includes('create') ||
        promptText.includes('generate') ||
        promptText.includes('creative'))
    ) {
      return 'anthropic';
    }

    // Default to OpenAI (GPT) for general tasks
    if (availableProviders.includes('openai')) {
      return 'openai';
    }

    // Fallback to first available provider
    return availableProviders[0] || 'openai';
  }

  getProviderStatus(): {
    [provider: string]: { available: boolean; models: string[] };
  } {
    const status: {
      [provider: string]: { available: boolean; models: string[] };
    } = {};

    for (const [name, provider] of this.providers) {
      status[name] = {
        available: true, // In a real implementation, this would check actual availability
        models: provider.models,
      };
    }

    return status;
  }

  updateConfig(newConfig: Partial<RoutingConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): RoutingConfig {
    return { ...this.config };
  }
}
