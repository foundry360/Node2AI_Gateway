import { Message, ChatResponse } from '../types/providers';
import { ModelComparisonService } from '../comparison/model-comparison';

export type OptimizationStrategy = 'cost' | 'speed' | 'quality' | 'balanced';

export interface SmartRoutingRequest {
  messages: Message[];
  optimization: OptimizationStrategy;
  budget?: number; // Max cost per request
  quality_threshold?: number; // Min quality score (0-1)
  max_latency?: number; // Max latency in ms
  preferred_models?: string[]; // Models to consider
  exclude_models?: string[]; // Models to exclude
}

export interface SmartRoutingResponse {
  selected_model: string;
  reasoning: string;
  optimization_applied: OptimizationStrategy;
  model_performance: {
    cost: number;
    latency_ms: number;
    quality_score: number;
    efficiency_score: number; // Quality per dollar
  };
  alternatives: Array<{
    model: string;
    cost: number;
    latency_ms: number;
    quality_score: number;
    efficiency_score: number;
    reason_excluded: string;
  }>;
  routing_metadata: {
    total_models_considered: number;
    models_excluded: number;
    optimization_time_ms: number;
    budget_utilized: number;
  };
}

export interface ModelPerformanceProfile {
  model: string;
  cost_per_1k_tokens: number;
  avg_latency_ms: number;
  quality_score: number;
  capabilities: string[];
  use_cases: string[];
}

export class SmartRouter {
  private comparisonService: ModelComparisonService;
  private modelProfiles: Map<string, ModelPerformanceProfile> = new Map();

  constructor() {
    this.comparisonService = new ModelComparisonService();
    this.initializeModelProfiles();
  }

  /**
   * Route request to optimal model based on strategy
   */
  async routeRequest(
    request: SmartRoutingRequest
  ): Promise<SmartRoutingResponse> {
    const startTime = Date.now();

    const {
      messages,
      optimization,
      budget = 0.1,
      quality_threshold = 0.7,
      max_latency = 10000,
      preferred_models = [],
      exclude_models = [],
    } = request;

    // Get available models
    const availableModels = this.getAvailableModels(
      preferred_models,
      exclude_models
    );

    // Filter models based on constraints
    const candidateModels = this.filterModelsByConstraints(
      availableModels,
      budget,
      quality_threshold,
      max_latency
    );

    if (candidateModels.length === 0) {
      throw new Error(
        'No models available that meet the specified constraints'
      );
    }

    // Select optimal model based on strategy
    const selectedModel = this.selectOptimalModel(
      candidateModels,
      optimization,
      budget
    );

    // Get model performance
    const modelPerformance = this.modelProfiles.get(selectedModel);
    if (!modelPerformance) {
      throw new Error(
        `Performance profile not found for model: ${selectedModel}`
      );
    }

    // Calculate efficiency score
    const efficiencyScore =
      modelPerformance.quality_score /
      Math.max(modelPerformance.cost_per_1k_tokens, 0.001);

    // Generate alternatives
    const alternatives = this.generateAlternatives(
      candidateModels,
      selectedModel
    );

    // Generate reasoning
    const reasoning = this.generateRoutingReasoning(
      selectedModel,
      optimization,
      modelPerformance,
      alternatives
    );

    const optimizationTime = Date.now() - startTime;

    return {
      selected_model: selectedModel,
      reasoning,
      optimization_applied: optimization,
      model_performance: {
        cost: modelPerformance.cost_per_1k_tokens,
        latency_ms: modelPerformance.avg_latency_ms,
        quality_score: modelPerformance.quality_score,
        efficiency_score: efficiencyScore,
      },
      alternatives,
      routing_metadata: {
        total_models_considered: candidateModels.length,
        models_excluded: availableModels.length - candidateModels.length,
        optimization_time_ms: optimizationTime,
        budget_utilized: modelPerformance.cost_per_1k_tokens / budget,
      },
    };
  }

  /**
   * Get available models based on preferences and exclusions
   */
  private getAvailableModels(
    preferred: string[],
    excluded: string[]
  ): string[] {
    const allModels = Array.from(this.modelProfiles.keys());

    if (preferred.length > 0) {
      return preferred.filter(
        model => !excluded.includes(model) && allModels.includes(model)
      );
    }

    return allModels.filter(model => !excluded.includes(model));
  }

  /**
   * Filter models based on constraints
   */
  private filterModelsByConstraints(
    models: string[],
    budget: number,
    qualityThreshold: number,
    maxLatency: number
  ): string[] {
    return models.filter(model => {
      const profile = this.modelProfiles.get(model);
      if (!profile) return false;

      return (
        profile.cost_per_1k_tokens <= budget &&
        profile.quality_score >= qualityThreshold &&
        profile.avg_latency_ms <= maxLatency
      );
    });
  }

  /**
   * Select optimal model based on optimization strategy
   */
  private selectOptimalModel(
    models: string[],
    strategy: OptimizationStrategy,
    budget: number
  ): string {
    const profiles = models.map(model => ({
      model,
      profile: this.modelProfiles.get(model)!,
    }));

    if (profiles.length === 0) {
      throw new Error('No models available for selection');
    }

    switch (strategy) {
      case 'cost':
        return profiles.reduce((cheapest, current) =>
          current.profile.cost_per_1k_tokens <
          cheapest.profile.cost_per_1k_tokens
            ? current
            : cheapest
        ).model;

      case 'speed':
        return profiles.reduce((fastest, current) =>
          current.profile.avg_latency_ms < fastest.profile.avg_latency_ms
            ? current
            : fastest
        ).model;

      case 'quality':
        return profiles.reduce((best, current) =>
          current.profile.quality_score > best.profile.quality_score
            ? current
            : best
        ).model;

      case 'balanced':
        return profiles.reduce((best, current) => {
          const currentEfficiency =
            current.profile.quality_score /
            Math.max(current.profile.cost_per_1k_tokens, 0.001);
          const bestEfficiency =
            best.profile.quality_score /
            Math.max(best.profile.cost_per_1k_tokens, 0.001);
          return currentEfficiency > bestEfficiency ? current : best;
        }).model;

      default:
        return profiles[0].model;
    }
  }

  /**
   * Generate alternative models with reasoning
   */
  private generateAlternatives(
    candidateModels: string[],
    selectedModel: string
  ): Array<{
    model: string;
    cost: number;
    latency_ms: number;
    quality_score: number;
    efficiency_score: number;
    reason_excluded: string;
  }> {
    return candidateModels
      .filter(model => model !== selectedModel)
      .map(model => {
        const profile = this.modelProfiles.get(model)!;
        const efficiencyScore =
          profile.quality_score / profile.cost_per_1k_tokens;

        return {
          model,
          cost: profile.cost_per_1k_tokens,
          latency_ms: profile.avg_latency_ms,
          quality_score: profile.quality_score,
          efficiency_score: efficiencyScore,
          reason_excluded: this.getExclusionReason(model, selectedModel),
        };
      });
  }

  /**
   * Get reason why a model was excluded
   */
  private getExclusionReason(model: string, selectedModel: string): string {
    const modelProfile = this.modelProfiles.get(model)!;
    const selectedProfile = this.modelProfiles.get(selectedModel)!;

    if (modelProfile.cost_per_1k_tokens > selectedProfile.cost_per_1k_tokens) {
      return 'Higher cost';
    }
    if (modelProfile.avg_latency_ms > selectedProfile.avg_latency_ms) {
      return 'Slower response time';
    }
    if (modelProfile.quality_score < selectedProfile.quality_score) {
      return 'Lower quality score';
    }

    return 'Less optimal for current strategy';
  }

  /**
   * Generate routing reasoning
   */
  private generateRoutingReasoning(
    selectedModel: string,
    strategy: OptimizationStrategy,
    performance: ModelPerformanceProfile,
    alternatives: any[]
  ): string {
    const reasons = [];

    switch (strategy) {
      case 'cost':
        reasons.push(
          `Selected ${selectedModel} for lowest cost ($${performance.cost_per_1k_tokens}/1k tokens)`
        );
        break;
      case 'speed':
        reasons.push(
          `Selected ${selectedModel} for fastest response (${performance.avg_latency_ms}ms average)`
        );
        break;
      case 'quality':
        reasons.push(
          `Selected ${selectedModel} for highest quality (${performance.quality_score} score)`
        );
        break;
      case 'balanced':
        const efficiency =
          performance.quality_score / performance.cost_per_1k_tokens;
        reasons.push(
          `Selected ${selectedModel} for best efficiency (${efficiency.toFixed(2)} quality per dollar)`
        );
        break;
    }

    if (alternatives.length > 0) {
      reasons.push(`Considered ${alternatives.length} alternative models`);
    }

    return reasons.join('. ');
  }

  /**
   * Initialize model performance profiles
   */
  private initializeModelProfiles(): void {
    const profiles: ModelPerformanceProfile[] = [
      {
        model: 'gpt-3.5-turbo',
        cost_per_1k_tokens: 0.002,
        avg_latency_ms: 800,
        quality_score: 0.75,
        capabilities: ['text', 'code', 'reasoning'],
        use_cases: ['general', 'coding', 'analysis'],
      },
      {
        model: 'gpt-4',
        cost_per_1k_tokens: 0.03,
        avg_latency_ms: 1200,
        quality_score: 0.95,
        capabilities: ['text', 'code', 'reasoning', 'analysis'],
        use_cases: ['complex', 'reasoning', 'analysis'],
      },
      {
        model: 'gpt-4-turbo',
        cost_per_1k_tokens: 0.01,
        avg_latency_ms: 1000,
        quality_score: 0.9,
        capabilities: ['text', 'code', 'reasoning', 'analysis'],
        use_cases: ['balanced', 'complex', 'reasoning'],
      },
      {
        model: 'claude-3-haiku',
        cost_per_1k_tokens: 0.00025,
        avg_latency_ms: 600,
        quality_score: 0.8,
        capabilities: ['text', 'analysis', 'long-context'],
        use_cases: ['fast', 'long-context', 'analysis'],
      },
      {
        model: 'claude-3-sonnet',
        cost_per_1k_tokens: 0.003,
        avg_latency_ms: 900,
        quality_score: 0.88,
        capabilities: ['text', 'analysis', 'reasoning', 'long-context'],
        use_cases: ['balanced', 'analysis', 'long-context'],
      },
      {
        model: 'claude-3-opus',
        cost_per_1k_tokens: 0.015,
        avg_latency_ms: 1500,
        quality_score: 0.98,
        capabilities: ['text', 'analysis', 'reasoning', 'long-context'],
        use_cases: ['high-quality', 'complex', 'reasoning'],
      },
      {
        model: 'llama-3.1-8b',
        cost_per_1k_tokens: 0, // Free when running locally
        avg_latency_ms: 2000,
        quality_score: 0.7,
        capabilities: ['text', 'code', 'reasoning'],
        use_cases: ['local', 'general', 'coding'],
      },
      {
        model: 'llama-3.1-70b',
        cost_per_1k_tokens: 0, // Free when running locally
        avg_latency_ms: 5000,
        quality_score: 0.85,
        capabilities: ['text', 'code', 'reasoning', 'analysis'],
        use_cases: ['local', 'high-quality', 'complex'],
      },
    ];

    profiles.forEach(profile => {
      this.modelProfiles.set(profile.model, profile);
    });
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(): {
    total_models: number;
    models_by_provider: Record<string, number>;
    average_cost: number;
    average_latency: number;
    average_quality: number;
  } {
    const profiles = Array.from(this.modelProfiles.values());
    const providers: Record<string, number> = {};

    profiles.forEach(profile => {
      const provider = this.getProviderName(profile.model);
      providers[provider] = (providers[provider] || 0) + 1;
    });

    return {
      total_models: profiles.length,
      models_by_provider: providers,
      average_cost:
        profiles.reduce((sum, p) => sum + p.cost_per_1k_tokens, 0) /
        profiles.length,
      average_latency:
        profiles.reduce((sum, p) => sum + p.avg_latency_ms, 0) /
        profiles.length,
      average_quality:
        profiles.reduce((sum, p) => sum + p.quality_score, 0) / profiles.length,
    };
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
}
