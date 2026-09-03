/**
 * Rule-Based Router
 * Implements deterministic routing logic with clear, priority-based rules
 */

import {
  UserPreferences,
  PromptAnalysis,
  RoutingDecision,
} from '../../types/routing.types';
import {
  MODEL_CAPABILITIES_DB,
  getModelById,
} from '../../constants/model-capabilities';
import { promptAnalyzer } from '../prompt-analyzer.service';

export class RuleBasedRouter {
  /**
   * Route a prompt using rule-based logic
   */
  async route(
    prompt: string,
    preferences: UserPreferences,
    analysis: PromptAnalysis
  ): Promise<RoutingDecision> {
    let selectedModel = 'claude-3-sonnet-20240229'; // Default fallback
    let reasoning = '';

    // Rule 1: Explicit user preference
    if (preferences.preferredModel) {
      const model = getModelById(preferences.preferredModel);
      if (model && model.available) {
        selectedModel = preferences.preferredModel;
        reasoning = `Selected based on user preference: ${model.displayName}`;
        return this.buildDecision(
          selectedModel,
          reasoning,
          preferences,
          analysis
        );
      }
    }

    // Rule 2: Internet/search required
    if (analysis.requiresInternet) {
      if (preferences.prioritize === 'quality') {
        selectedModel = 'sonar-pro';
        reasoning =
          'Selected Perplexity Sonar Pro because prompt requires real-time internet search and quality is prioritized';
      } else {
        selectedModel = 'sonar';
        reasoning =
          'Selected Perplexity Sonar because prompt requires real-time internet search';
      }
      return this.buildDecision(
        selectedModel,
        reasoning,
        preferences,
        analysis
      );
    }

    // Rule 3: Vision/images required
    if (analysis.requiresVision) {
      if (
        analysis.complexity === 'expert' ||
        analysis.complexity === 'complex'
      ) {
        selectedModel = 'claude-3-opus-20240229';
        reasoning =
          'Selected Claude 3 Opus for complex vision analysis with highest quality';
      } else if (preferences.prioritize === 'speed') {
        selectedModel = 'gpt-4o';
        reasoning = 'Selected GPT-4o for vision task with speed priority';
      } else {
        selectedModel = 'claude-3-sonnet-20240229';
        reasoning = 'Selected Claude 3 Sonnet for balanced vision analysis';
      }
      return this.buildDecision(
        selectedModel,
        reasoning,
        preferences,
        analysis
      );
    }

    // Rule 4: Very long context (>100k tokens)
    if (analysis.estimatedInputTokens > 100000) {
      selectedModel = 'gemini-1.5-pro';
      reasoning =
        'Selected Gemini 1.5 Pro for ultra-long context window (1M tokens)';
      return this.buildDecision(
        selectedModel,
        reasoning,
        preferences,
        analysis
      );
    }

    // Rule 5: Code generation/analysis
    if (analysis.domains.includes('code')) {
      if (analysis.complexity === 'expert') {
        selectedModel = 'claude-3-opus-20240229';
        reasoning = 'Selected Claude 3 Opus for expert-level code generation';
      } else if (
        analysis.complexity === 'complex' ||
        preferences.prioritize === 'quality'
      ) {
        selectedModel = 'claude-3-sonnet-20240229';
        reasoning = 'Selected Claude 3 Sonnet for quality code generation';
      } else if (preferences.prioritize === 'speed') {
        selectedModel = 'claude-3-haiku-20240307';
        reasoning = 'Selected Claude 3 Haiku for fast code generation';
      } else if (preferences.prioritize === 'cost') {
        selectedModel = 'claude-3-haiku-20240307';
        reasoning =
          'Selected Claude 3 Haiku for cost-effective code generation';
      } else {
        selectedModel = 'claude-3-sonnet-20240229';
        reasoning = 'Selected Claude 3 Sonnet for balanced code generation';
      }
      return this.buildDecision(
        selectedModel,
        reasoning,
        preferences,
        analysis
      );
    }

    // Rule 6: Complex reasoning
    if (
      analysis.requiredCapabilities.includes('reasoning') &&
      (analysis.complexity === 'complex' || analysis.complexity === 'expert')
    ) {
      if (preferences.prioritize === 'quality') {
        selectedModel = 'claude-3-opus-20240229';
        reasoning = 'Selected Claude 3 Opus for highest quality reasoning';
      } else {
        selectedModel = 'claude-3-sonnet-20240229';
        reasoning = 'Selected Claude 3 Sonnet for quality reasoning';
      }
      return this.buildDecision(
        selectedModel,
        reasoning,
        preferences,
        analysis
      );
    }

    // Rule 7: Creative writing
    if (analysis.domains.includes('creative')) {
      if (preferences.prioritize === 'speed') {
        selectedModel = 'gpt-4o';
        reasoning = 'Selected GPT-4o for fast creative content generation';
      } else {
        selectedModel = 'claude-3-sonnet-20240229';
        reasoning =
          'Selected Claude 3 Sonnet for high-quality creative writing';
      }
      return this.buildDecision(
        selectedModel,
        reasoning,
        preferences,
        analysis
      );
    }

    // Rule 8: Simple tasks
    if (analysis.complexity === 'simple') {
      if (preferences.prioritize === 'cost') {
        selectedModel = 'claude-3-haiku-20240307';
        reasoning = 'Selected Claude 3 Haiku for cost-effective simple tasks';
      } else if (preferences.prioritize === 'speed') {
        selectedModel = 'gpt-4o-mini';
        reasoning = 'Selected GPT-4o Mini for fast simple tasks';
      } else {
        selectedModel = 'claude-3-haiku-20240307';
        reasoning = 'Selected Claude 3 Haiku for simple tasks';
      }
      return this.buildDecision(
        selectedModel,
        reasoning,
        preferences,
        analysis
      );
    }

    // Rule 9: Default - Balanced approach
    selectedModel = 'claude-3-sonnet-20240229';
    reasoning =
      'Selected Claude 3 Sonnet as balanced default for moderate complexity tasks';

    return this.buildDecision(selectedModel, reasoning, preferences, analysis);
  }

  /**
   * Build routing decision with all metadata
   */
  private buildDecision(
    modelId: string,
    reasoning: string,
    preferences: UserPreferences,
    analysis: PromptAnalysis
  ): RoutingDecision {
    const model = getModelById(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // Calculate fallbacks
    const fallbacks = this.selectFallbacks(modelId, analysis, preferences);

    // Calculate alternatives
    const alternatives = this.getAlternatives(modelId, analysis, preferences);

    // Estimate costs
    const inputCost =
      (analysis.estimatedInputTokens / 1_000_000) *
      model.pricing.inputCostPerMillion;
    const outputCost =
      (analysis.estimatedOutputTokens / 1_000_000) *
      model.pricing.outputCostPerMillion;
    const totalCost = inputCost + outputCost;

    return {
      model: modelId,
      provider: model.provider,
      fallbacks,
      reasoning,
      algorithm: 'rule-based',
      analysis,
      tokenEstimate: {
        input: analysis.estimatedInputTokens,
        output: analysis.estimatedOutputTokens,
        total: analysis.estimatedInputTokens + analysis.estimatedOutputTokens,
        confidence: 0.7,
      },
      costEstimate: {
        cost: totalCost,
        confidence: 0.7,
        breakdown: {
          inputCost,
          outputCost,
        },
      },
      alternatives,
    };
  }

  /**
   * Select fallback models in order of preference
   */
  private selectFallbacks(
    primaryModel: string,
    analysis: PromptAnalysis,
    preferences: UserPreferences
  ): string[] {
    const fallbacks: string[] = [];
    const model = getModelById(primaryModel);
    if (!model) return fallbacks;

    // Same provider, lower tier
    const sameProviderModels = MODEL_CAPABILITIES_DB.filter(
      m =>
        m.provider === model.provider &&
        m.modelId !== primaryModel &&
        m.available
    );

    // Add same provider fallback
    if (sameProviderModels.length > 0) {
      const lowerTier = this.getLowerTierModel(
        sameProviderModels,
        primaryModel
      );
      if (lowerTier) fallbacks.push(lowerTier.modelId);
    }

    // Different provider, similar capability
    if (
      analysis.requiresInternet &&
      !MODEL_CAPABILITIES_DB.find(
        m => m.modelId === primaryModel && m.features.includes('internet')
      )
    ) {
      fallbacks.push('sonar');
      fallbacks.push('sonar-pro');
    }

    // Most reliable fallback (Claude Sonnet)
    if (!fallbacks.includes('claude-3-sonnet-20240229')) {
      fallbacks.push('claude-3-sonnet-20240229');
    }

    return fallbacks;
  }

  /**
   * Get alternative models considered
   */
  private getAlternatives(
    selectedModel: string,
    analysis: PromptAnalysis,
    preferences: UserPreferences
  ): Array<{ model: string; score: number; reason: string }> {
    const alternatives: Array<{
      model: string;
      score: number;
      reason: string;
    }> = [];

    // Get top 3 alternatives based on capabilities
    const suitableModels = MODEL_CAPABILITIES_DB.filter(
      m => m.available && m.modelId !== selectedModel
    );

    suitableModels.forEach(model => {
      let score = 0;
      const reasons: string[] = [];

      // Score based on required capabilities
      analysis.requiredCapabilities.forEach(cap => {
        const rating = model.capabilities[cap];
        if (rating >= 8) {
          score += 2;
          reasons.push(`excellent ${cap}`);
        } else if (rating >= 6) {
          score += 1;
        }
      });

      // Prioritize based on user preference
      if (preferences.prioritize === 'cost' && this.isCostEffective(model)) {
        score += 2;
        reasons.push('cost effective');
      } else if (
        preferences.prioritize === 'speed' &&
        model.performance.averageLatency < 1000
      ) {
        score += 2;
        reasons.push('fast');
      } else if (
        preferences.prioritize === 'quality' &&
        model.performance.qualityScore >= 9
      ) {
        score += 2;
        reasons.push('high quality');
      }

      if (score > 0) {
        alternatives.push({
          model: model.modelId,
          score,
          reason: reasons.join(', ') || 'suitable',
        });
      }
    });

    // Sort by score and return top 3
    return alternatives.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /**
   * Get lower tier model from same provider
   */
  private getLowerTierModel(
    models: typeof MODEL_CAPABILITIES_DB,
    primaryModel: string
  ): (typeof MODEL_CAPABILITIES_DB)[0] | null {
    const primary = getModelById(primaryModel);
    if (!primary) return null;

    // Sort by pricing (cheapest first)
    const sortedByPrice = [...models].sort((a, b) => {
      const costA =
        a.pricing.inputCostPerMillion + a.pricing.outputCostPerMillion;
      const costB =
        b.pricing.inputCostPerMillion + b.pricing.outputCostPerMillion;
      return costA - costB;
    });

    // Return cheaper model or first available
    return sortedByPrice[0] || null;
  }

  /**
   * Check if model is cost-effective
   */
  private isCostEffective(model: (typeof MODEL_CAPABILITIES_DB)[0]): boolean {
    const totalCost =
      model.pricing.inputCostPerMillion + model.pricing.outputCostPerMillion;
    return totalCost < 2.0; // Less than $2 per million tokens
  }
}
