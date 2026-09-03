import { Message, ChatResponse } from '../types/providers';
import { OpenAIProvider } from '../providers/openai';
import { LocalProvider } from '../providers/local';

export interface ComparisonRequest {
  models: string[];
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  timeout?: number; // milliseconds
}

export interface ComparisonResult {
  model: string;
  content: string;
  cost: number;
  latency_ms: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  success: boolean;
  error?: string;
  provider: string;
  timestamp: Date;
}

export interface ComparisonResponse {
  results: ComparisonResult[];
  total_cost: number;
  total_latency: number;
  fastest_model: string;
  cheapest_model: string;
  best_quality_model: string; // Based on response length and coherence
  comparison_metadata: {
    total_models: number;
    successful_models: number;
    failed_models: number;
    average_latency: number;
    average_cost: number;
  };
}

export class ModelComparisonService {
  private providers: Map<string, any> = new Map();

  constructor() {
    // Initialize providers
    this.providers.set('gpt-3.5-turbo', new OpenAIProvider());
    this.providers.set('gpt-4', new OpenAIProvider());
    this.providers.set('gpt-4-turbo', new OpenAIProvider());
    this.providers.set('claude-3-haiku', new LocalProvider()); // Mock for now
    this.providers.set('claude-3-sonnet', new LocalProvider()); // Mock for now
    this.providers.set('claude-3-opus', new LocalProvider()); // Mock for now
    this.providers.set('gemini-pro', new LocalProvider()); // Mock for now
    this.providers.set('llama-3.1-8b', new LocalProvider());
    this.providers.set('llama-3.1-70b', new LocalProvider());
    this.providers.set('mistral-7b', new LocalProvider());
    this.providers.set('mixtral-8x7b', new LocalProvider());
  }

  /**
   * Compare multiple models with the same prompt
   */
  async compareModels(request: ComparisonRequest): Promise<ComparisonResponse> {
    const {
      models,
      messages,
      temperature = 0.7,
      max_tokens,
      timeout = 30000,
    } = request;

    console.log(`Starting model comparison for ${models.length} models`);

    // Run all models in parallel
    const promises = models.map(model =>
      this.runModelComparison(model, messages, temperature, max_tokens, timeout)
    );

    const results = await Promise.allSettled(promises);

    // Process results
    const comparisonResults: ComparisonResult[] = [];
    let totalCost = 0;
    let totalLatency = 0;
    let successfulModels = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        comparisonResults.push(result.value);
        totalCost += result.value.cost;
        totalLatency += result.value.latency_ms;
        if (result.value.success) successfulModels++;
      } else {
        // Handle failed model
        comparisonResults.push({
          model: models[index],
          content: '',
          cost: 0,
          latency_ms: timeout,
          tokens: { input: 0, output: 0, total: 0 },
          success: false,
          error: result.reason?.message || 'Unknown error',
          provider: 'unknown',
          timestamp: new Date(),
        });
      }
    });

    // Find best performing models
    const successfulResults = comparisonResults.filter(r => r.success);
    const fastestModel =
      successfulResults.length > 0
        ? successfulResults.reduce((fastest, current) =>
            current.latency_ms < fastest.latency_ms ? current : fastest
          ).model
        : 'none';

    const cheapestModel =
      successfulResults.length > 0
        ? successfulResults.reduce((cheapest, current) =>
            current.cost < cheapest.cost ? current : cheapest
          ).model
        : 'none';

    const bestQualityModel = this.determineBestQuality(successfulResults);

    return {
      results: comparisonResults,
      total_cost: totalCost,
      total_latency: totalLatency,
      fastest_model: fastestModel,
      cheapest_model: cheapestModel,
      best_quality_model: bestQualityModel,
      comparison_metadata: {
        total_models: models.length,
        successful_models: successfulModels,
        failed_models: models.length - successfulModels,
        average_latency:
          successfulModels > 0 ? totalLatency / successfulModels : 0,
        average_cost: successfulModels > 0 ? totalCost / successfulModels : 0,
      },
    };
  }

  /**
   * Run a single model comparison
   */
  private async runModelComparison(
    model: string,
    messages: Message[],
    temperature: number,
    max_tokens?: number,
    timeout: number = 30000
  ): Promise<ComparisonResult> {
    const startTime = Date.now();

    try {
      const provider = this.providers.get(model);
      if (!provider) {
        throw new Error(`Provider not found for model: ${model}`);
      }

      // Set timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      const chatPromise = provider.chat(messages, {
        model,
        temperature,
        max_tokens,
        stream: false,
      });

      const response = await Promise.race([chatPromise, timeoutPromise]);
      const endTime = Date.now();
      const latency = endTime - startTime;

      return {
        model,
        content: response.choices[0].message.content,
        cost: response.cost,
        latency_ms: latency,
        tokens: {
          input: response.usage.prompt_tokens,
          output: response.usage.completion_tokens,
          total: response.usage.total_tokens,
        },
        success: true,
        provider: this.getProviderName(model),
        timestamp: new Date(),
      };
    } catch (error: any) {
      const endTime = Date.now();
      const latency = endTime - startTime;

      return {
        model,
        content: '',
        cost: 0,
        latency_ms: latency,
        tokens: { input: 0, output: 0, total: 0 },
        success: false,
        error: error.message,
        provider: this.getProviderName(model),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Determine the best quality model based on response characteristics
   */
  private determineBestQuality(results: ComparisonResult[]): string {
    if (results.length === 0) return 'none';

    // Simple quality scoring based on response length and coherence
    // In a real implementation, this would use more sophisticated metrics
    const scoredResults = results.map(result => {
      const responseLength = result.content.length;
      const coherenceScore = this.calculateCoherenceScore(result.content);
      const qualityScore = responseLength / 100 + coherenceScore * 10;

      return {
        model: result.model,
        qualityScore,
        responseLength,
        coherenceScore,
      };
    });

    const bestResult = scoredResults.reduce((best, current) =>
      current.qualityScore > best.qualityScore ? current : best
    );

    return bestResult.model;
  }

  /**
   * Calculate a simple coherence score
   */
  private calculateCoherenceScore(content: string): number {
    // Simple heuristics for coherence
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength =
      sentences.length > 0 ? content.length / sentences.length : 0;

    // Penalize very short or very long sentences
    let coherenceScore = 1.0;
    if (avgSentenceLength < 10) coherenceScore -= 0.3;
    if (avgSentenceLength > 100) coherenceScore -= 0.2;

    // Reward proper sentence structure
    const hasProperEnding = /[.!?]$/.test(content.trim());
    if (hasProperEnding) coherenceScore += 0.1;

    return Math.max(0, Math.min(1, coherenceScore));
  }

  /**
   * Get provider name for a model
   */
  private getProviderName(model: string): string {
    if (model.startsWith('gpt-')) return 'openai';
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('gemini-')) return 'google';
    if (
      model.startsWith('llama-') ||
      model.startsWith('mistral-') ||
      model.startsWith('mixtral-')
    )
      return 'ollama';
    return 'unknown';
  }

  /**
   * Get available models for comparison
   */
  getAvailableModels(): {
    openai: string[];
    anthropic: string[];
    google: string[];
    ollama: string[];
  } {
    return {
      openai: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
      anthropic: ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus'],
      google: ['gemini-pro'],
      ollama: ['llama-3.1-8b', 'llama-3.1-70b', 'mistral-7b', 'mixtral-8x7b'],
    };
  }

  /**
   * Get model capabilities and pricing
   */
  getModelInfo(): Record<
    string,
    {
      provider: string;
      max_tokens: number;
      cost_per_1k_tokens: number;
      capabilities: string[];
      description: string;
    }
  > {
    return {
      'gpt-3.5-turbo': {
        provider: 'openai',
        max_tokens: 4096,
        cost_per_1k_tokens: 0.002,
        capabilities: ['text', 'code', 'reasoning'],
        description: 'Fast and efficient for most tasks',
      },
      'gpt-4': {
        provider: 'openai',
        max_tokens: 8192,
        cost_per_1k_tokens: 0.03,
        capabilities: ['text', 'code', 'reasoning', 'analysis'],
        description: 'Most capable model for complex tasks',
      },
      'claude-3-haiku': {
        provider: 'anthropic',
        max_tokens: 200000,
        cost_per_1k_tokens: 0.00025,
        capabilities: ['text', 'analysis', 'long-context'],
        description: 'Fast and efficient with long context',
      },
      'claude-3-opus': {
        provider: 'anthropic',
        max_tokens: 200000,
        cost_per_1k_tokens: 0.015,
        capabilities: ['text', 'analysis', 'reasoning', 'long-context'],
        description: 'Most capable Claude model',
      },
      'llama-3.1-8b': {
        provider: 'ollama',
        max_tokens: 8192,
        cost_per_1k_tokens: 0, // Free when running locally
        capabilities: ['text', 'code', 'reasoning'],
        description: 'Efficient local model for most tasks',
      },
      'llama-3.1-70b': {
        provider: 'ollama',
        max_tokens: 8192,
        cost_per_1k_tokens: 0, // Free when running locally
        capabilities: ['text', 'code', 'reasoning', 'analysis'],
        description: 'High-quality local model',
      },
    };
  }
}
