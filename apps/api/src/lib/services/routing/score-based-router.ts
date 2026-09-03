/**
 * Score-Based Router
 * Implements sophisticated scoring system that considers multiple factors
 */

import {
  UserPreferences,
  PromptAnalysis,
  CustomerSettings,
  RoutingDecision,
  ModelCapabilities,
} from '../../types/routing.types';
import {
  MODEL_CAPABILITIES_DB,
  getModelById,
} from '../../constants/model-capabilities';
import { inferModelCapabilities } from '../model-capability-mapper';

export class ScoreBasedRouter {
  /**
   * Route a prompt using score-based logic
   */
  async route(
    prompt: string,
    preferences: UserPreferences,
    analysis: PromptAnalysis,
    settings: CustomerSettings
  ): Promise<RoutingDecision> {
    // Get available models based on customer settings
    const availableModels = this.getAvailableModels(settings);

    if (availableModels.length === 0) {
      throw new Error('No models available for customer');
    }

    // Score each model
    const scoredModels = availableModels.map(model => {
      const capabilityScore = this.scoreCapabilities(model, analysis);
      const costScore = this.scoreCost(model, preferences, analysis);
      const performanceScore = this.scorePerformance(model, preferences);
      const qualityScore = this.scoreQuality(model, analysis);

      // Adjust weights based on prompt complexity
      let capabilityWeight = 0.4;
      let costWeight = 0.25;
      let performanceWeight = 0.2;
      let qualityWeight = 0.15;

      // For complex/expert prompts, prioritize quality and capabilities over cost
      if (
        analysis.complexity === 'complex' ||
        analysis.complexity === 'expert'
      ) {
        capabilityWeight = 0.45;
        costWeight = 0.15;
        performanceWeight = 0.15;
        qualityWeight = 0.25;
      }

      // Apply priority boost
      if (preferences.prioritize === 'cost') {
        capabilityWeight = 0.3;
        costWeight = 0.375;
        performanceWeight = 0.15;
        qualityWeight = 0.175;
      } else if (preferences.prioritize === 'speed') {
        capabilityWeight = 0.3;
        costWeight = 0.15;
        performanceWeight = 0.3;
        qualityWeight = 0.25;
      } else if (preferences.prioritize === 'quality') {
        capabilityWeight = 0.35;
        costWeight = 0.15;
        performanceWeight = 0.1;
        qualityWeight = 0.4;
      }

      // Weighted total score
      const totalScore =
        capabilityScore * capabilityWeight +
        costScore * costWeight +
        performanceScore * performanceWeight +
        qualityScore * qualityWeight;

      return {
        model: model.modelId,
        score: totalScore,
        breakdown: {
          capability: capabilityScore,
          cost: costScore,
          performance: performanceScore,
          quality: qualityScore,
        },
      };
    });

    // Sort by score (descending)
    scoredModels.sort((a, b) => b.score - a.score);

    // Select top model
    const topModelId = scoredModels[0].model;
    const model = getModelById(topModelId);

    if (!model) {
      throw new Error(`Model not found: ${topModelId}`);
    }

    // Build reasoning
    const reasoning = this.buildReasoning(
      model,
      scoredModels[0],
      preferences,
      analysis
    );

    // Build decision
    return this.buildDecision(
      model,
      scoredModels,
      preferences,
      analysis,
      reasoning
    );
  }

  /**
   * Score model based on capability match
   */
  private scoreCapabilities(
    model: ModelCapabilities,
    analysis: PromptAnalysis
  ): number {
    let score = 0;
    let maxScore = 0;

    // Check required capabilities
    analysis.requiredCapabilities.forEach(cap => {
      const modelRating = model.capabilities[cap];
      const maxPossibleRating = 10;

      maxScore += maxPossibleRating;

      // Capability match score
      if (modelRating >= 8) {
        score += modelRating; // Excellent
      } else if (modelRating >= 6) {
        score += modelRating * 0.7; // Good
      } else if (modelRating >= 4) {
        score += modelRating * 0.4; // Fair
      } else {
        score += modelRating * 0.1; // Poor
      }
    });

    // Check feature requirements
    if (analysis.requiresInternet && model.features.includes('internet')) {
      score += 10;
      maxScore += 10;
    } else if (analysis.requiresInternet) {
      maxScore += 10; // Missing critical feature
    }

    if (analysis.requiresVision && model.features.includes('vision')) {
      score += 10;
      maxScore += 10;
    } else if (analysis.requiresVision) {
      maxScore += 10; // Missing critical feature
    }

    // Context window suitability
    if (analysis.estimatedInputTokens > model.performance.contextWindow) {
      score *= 0.3; // Severe penalty for insufficient context
    } else if (
      analysis.estimatedInputTokens >
      model.performance.contextWindow * 0.8
    ) {
      score *= 0.8; // Penalty for being close to limit
    }

    return maxScore > 0 ? (score / maxScore) * 100 : 50;
  }

  /**
   * Score model based on cost efficiency
   */
  private scoreCost(
    model: ModelCapabilities,
    preferences: UserPreferences,
    analysis: PromptAnalysis
  ): number {
    // Calculate estimated cost
    const inputCost =
      (analysis.estimatedInputTokens / 1_000_000) *
      model.pricing.inputCostPerMillion;
    const outputCost =
      (analysis.estimatedOutputTokens / 1_000_000) *
      model.pricing.outputCostPerMillion;
    const totalCost = inputCost + outputCost;

    // Check against user preference
    if (
      preferences.maxCostPerRequest &&
      totalCost > preferences.maxCostPerRequest
    ) {
      return 0; // Unacceptable
    }

    // Normalize against a fixed maximum cost reference
    // Use Claude Opus pricing as the max reference (most expensive common model)
    const maxCostReference = 15.0 + 75.0; // input + output per million

    // Calculate total cost in dollars per million
    const costPerMillion =
      model.pricing.inputCostPerMillion + model.pricing.outputCostPerMillion;

    // Score: cheaper = higher score (normalize to 0-100)
    const normalizedScore =
      ((maxCostReference - costPerMillion) / maxCostReference) * 100;

    return Math.max(0, Math.min(100, normalizedScore));
  }

  /**
   * Score model based on performance/speed
   */
  private scorePerformance(
    model: ModelCapabilities,
    preferences: UserPreferences
  ): number {
    // Check against user preference
    if (
      preferences.maxLatency &&
      model.performance.averageLatency > preferences.maxLatency
    ) {
      return 0; // Unacceptable
    }

    // Normalize against slowest model
    const maxLatency = Math.max(
      ...MODEL_CAPABILITIES_DB.map(m => m.performance.averageLatency)
    );

    // Score: faster = higher score
    const normalizedScore =
      ((maxLatency - model.performance.averageLatency) / maxLatency) * 100;

    return Math.max(0, normalizedScore);
  }

  /**
   * Score model based on quality
   */
  private scoreQuality(
    model: ModelCapabilities,
    analysis: PromptAnalysis
  ): number {
    let score = model.performance.qualityScore * 10; // Convert to 0-100

    // Boost for reliability
    score += model.performance.reliabilityScore;

    // Adjust based on accuracy requirement
    if (analysis.accuracyRequirement === 'high') {
      // Prefer higher quality models more
      if (model.performance.qualityScore >= 9) {
        score += 20;
      } else if (model.performance.qualityScore >= 8) {
        score += 10;
      }
    } else if (analysis.accuracyRequirement === 'low') {
      // Slight boost to mid-tier models
      if (
        model.performance.qualityScore >= 7 &&
        model.performance.qualityScore < 9
      ) {
        score += 5;
      }
    }

    return Math.min(100, score);
  }

  /**
   * Get available models based on customer settings
   */
  private getAvailableModels(settings: CustomerSettings): ModelCapabilities[] {
    const allModels = MODEL_CAPABILITIES_DB.filter(m => m.available);

    // If customer has specified allowed models, use those (could be fetched models)
    if (settings.allowedModels.length > 0) {
      const knownModels = allModels.filter(m =>
        settings.allowedModels.includes(m.modelId)
      );

      // For any allowed models not in our DB, infer their capabilities
      const unknownModels = settings.allowedModels
        .filter(modelId => !allModels.some(m => m.modelId === modelId))
        .map(modelId => inferModelCapabilities(modelId))
        .filter((model): model is ModelCapabilities => model !== null);

      return [...knownModels, ...unknownModels];
    }

    return allModels;
  }

  /**
   * Build reasoning for routing decision
   */
  private buildReasoning(
    model: ModelCapabilities,
    scoredModel: {
      model: string;
      score: number;
      breakdown: {
        capability: number;
        cost: number;
        performance: number;
        quality: number;
      };
    },
    preferences: UserPreferences,
    analysis: PromptAnalysis
  ): string {
    const reasons: string[] = [];

    reasons.push(
      `Selected ${model.displayName} with a score of ${scoredModel.score.toFixed(1)}`
    );

    // Add capability reasoning
    if (scoredModel.breakdown.capability >= 80) {
      reasons.push('excellent capability match');
    } else if (scoredModel.breakdown.capability >= 60) {
      reasons.push('good capability match');
    }

    // Add cost reasoning
    if (preferences.prioritize === 'cost') {
      reasons.push(
        `cost-efficient ($${((analysis.estimatedInputTokens / 1_000_000) * model.pricing.inputCostPerMillion + (analysis.estimatedOutputTokens / 1_000_000) * model.pricing.outputCostPerMillion).toFixed(4)} est.)`
      );
    }

    // Add performance reasoning
    if (preferences.prioritize === 'speed') {
      reasons.push(`fast response (${model.performance.averageLatency}ms avg)`);
    }

    // Add quality reasoning
    if (preferences.prioritize === 'quality') {
      reasons.push(`high quality (${model.performance.qualityScore}/10)`);
    }

    // Add domain-specific reasoning
    if (analysis.domains.includes('code')) {
      reasons.push('strong code generation');
    } else if (analysis.domains.includes('creative')) {
      reasons.push('excellent creative capabilities');
    } else if (analysis.domains.includes('search')) {
      reasons.push('real-time search capability');
    }

    return reasons.join(', ');
  }

  /**
   * Build complete routing decision
   */
  private buildDecision(
    model: ModelCapabilities,
    scoredModels: Array<{
      model: string;
      score: number;
      breakdown: {
        capability: number;
        cost: number;
        performance: number;
        quality: number;
      };
    }>,
    preferences: UserPreferences,
    analysis: PromptAnalysis,
    reasoning: string
  ): RoutingDecision {
    // Get top 3 alternatives
    const alternatives = scoredModels.slice(0, 3).map(scored => ({
      model: scored.model,
      score: scored.score,
      reason: `Score: ${scored.score.toFixed(1)} (cap: ${scored.breakdown.capability.toFixed(1)}, cost: ${scored.breakdown.cost.toFixed(1)}, perf: ${scored.breakdown.performance.toFixed(1)}, qual: ${scored.breakdown.quality.toFixed(1)})`,
    }));

    // Get fallbacks
    const fallbacks = this.selectFallbacks(
      model.modelId,
      analysis,
      preferences,
      scoredModels
    );

    // Calculate cost estimates
    const inputCost =
      (analysis.estimatedInputTokens / 1_000_000) *
      model.pricing.inputCostPerMillion;
    const outputCost =
      (analysis.estimatedOutputTokens / 1_000_000) *
      model.pricing.outputCostPerMillion;
    const totalCost = inputCost + outputCost;

    return {
      model: model.modelId,
      provider: model.provider,
      fallbacks,
      reasoning,
      algorithm: 'score-based',
      analysis,
      tokenEstimate: {
        input: analysis.estimatedInputTokens,
        output: analysis.estimatedOutputTokens,
        total: analysis.estimatedInputTokens + analysis.estimatedOutputTokens,
        confidence: 0.75,
      },
      costEstimate: {
        cost: totalCost,
        confidence: 0.75,
        breakdown: {
          inputCost,
          outputCost,
        },
      },
      alternatives,
    };
  }

  /**
   * Select fallback models
   */
  private selectFallbacks(
    primaryModel: string,
    analysis: PromptAnalysis,
    preferences: UserPreferences,
    scoredModels: Array<{ model: string; score: number }>
  ): string[] {
    const fallbacks: string[] = [];

    // Add next best scored models
    const alternatives = scoredModels
      .filter(s => s.model !== primaryModel)
      .slice(0, 2)
      .map(s => s.model);

    fallbacks.push(...alternatives);

    // Add Claude Sonnet as ultimate fallback if not already included
    if (!fallbacks.includes('claude-3-sonnet-20240229')) {
      fallbacks.push('claude-3-sonnet-20240229');
    }

    return fallbacks;
  }
}
