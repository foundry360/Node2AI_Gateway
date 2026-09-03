/**
 * Fallback Router
 * Handles failures and provides intelligent fallback options
 */

import {
  UserPreferences,
  PromptAnalysis,
  ModelCapabilities,
} from '../../types/routing.types';
import {
  MODEL_CAPABILITIES_DB,
  getModelById,
} from '../../constants/model-capabilities';

export class FallbackRouter {
  /**
   * Route with fallback options
   */
  async routeWithFallback(
    prompt: string,
    preferences: UserPreferences,
    analysis: PromptAnalysis
  ): Promise<{ model: string; fallbacks: string[] }> {
    // Select primary model (you can inject a router here)
    const primaryModel = 'claude-3-sonnet-20240229';

    // Select fallbacks
    const fallbacks = this.selectFallbacks(primaryModel, analysis);

    return {
      model: primaryModel,
      fallbacks,
    };
  }

  /**
   * Select fallback models based on primary model
   */
  selectFallbacks(primaryModel: string, analysis: PromptAnalysis): string[] {
    const fallbacks: string[] = [];
    const primary = getModelById(primaryModel);

    if (!primary) {
      return ['claude-3-sonnet-20240229']; // Ultimate fallback
    }

    // Strategy 1: Same provider, lower tier
    const sameProviderFallbacks = this.getSameProviderFallbacks(primary);
    fallbacks.push(...sameProviderFallbacks);

    // Strategy 2: Different provider, similar capability
    const similarCapabilityFallbacks = this.getSimilarCapabilityFallbacks(
      primary,
      analysis
    );
    fallbacks.push(...similarCapabilityFallbacks);

    // Strategy 3: Most reliable models
    const reliableFallback = this.getMostReliableFallback(primary);
    if (reliableFallback && !fallbacks.includes(reliableFallback)) {
      fallbacks.push(reliableFallback);
    }

    return fallbacks;
  }

  /**
   * Get fallbacks from same provider
   */
  private getSameProviderFallbacks(primary: ModelCapabilities): string[] {
    const sameProviderModels = MODEL_CAPABILITIES_DB.filter(
      m =>
        m.provider === primary.provider &&
        m.modelId !== primary.modelId &&
        m.available
    );

    // Sort by price (cheaper first for fallback)
    const sorted = sameProviderModels.sort((a, b) => {
      const costA =
        a.pricing.inputCostPerMillion + a.pricing.outputCostPerMillion;
      const costB =
        b.pricing.inputCostPerMillion + b.pricing.outputCostPerMillion;
      return costA - costB;
    });

    return sorted.map(m => m.modelId);
  }

  /**
   * Get fallbacks with similar capabilities
   */
  private getSimilarCapabilityFallbacks(
    primary: ModelCapabilities,
    analysis: PromptAnalysis
  ): string[] {
    const fallbacks: string[] = [];

    // Find models with similar or better capabilities
    const suitable = MODEL_CAPABILITIES_DB.filter(
      m => m.available && m.modelId !== primary.modelId
    );

    // If primary failed due to missing capability, prioritize models with it
    if (analysis.requiresInternet && !primary.features.includes('internet')) {
      const withInternet = suitable.filter(m =>
        m.features.includes('internet')
      );
      fallbacks.push(...withInternet.map(m => m.modelId));
    }

    if (analysis.requiresVision && !primary.features.includes('vision')) {
      const withVision = suitable.filter(m => m.features.includes('vision'));
      fallbacks.push(...withVision.map(m => m.modelId));
    }

    // Add models with similar capability ratings
    const requiredCaps = analysis.requiredCapabilities;
    const similarCapability = suitable.filter(model => {
      // Check if model has adequate capabilities
      const hasCapabilities = requiredCaps.every(
        cap => model.capabilities[cap] >= primary.capabilities[cap] * 0.8
      );
      return hasCapabilities;
    });

    // Sort by reliability
    similarCapability.sort(
      (a, b) => b.performance.reliabilityScore - a.performance.reliabilityScore
    );

    // Add top 2 similar capability models
    fallbacks.push(...similarCapability.slice(0, 2).map(m => m.modelId));

    return fallbacks;
  }

  /**
   * Get most reliable fallback
   */
  private getMostReliableFallback(
    primary: ModelCapabilities
  ): string | undefined {
    // Get most reliable model that's different from primary
    const reliable = MODEL_CAPABILITIES_DB.filter(
      m => m.available && m.modelId !== primary.modelId
    );

    if (reliable.length === 0) return undefined;

    // Sort by reliability score
    const sorted = reliable.sort(
      (a, b) => b.performance.reliabilityScore - a.performance.reliabilityScore
    );

    return sorted[0].modelId;
  }

  /**
   * Check if model should be excluded from fallbacks
   */
  private shouldExcludeModel(
    modelId: string,
    preferences: UserPreferences
  ): boolean {
    // Check if user wants to avoid this model
    if (preferences.avoidModels?.includes(modelId)) {
      return true;
    }

    // Check if provider should be avoided
    const model = getModelById(modelId);
    if (!model) return true;

    if (
      preferences.avoidProvider &&
      model.provider === preferences.avoidProvider
    ) {
      return true;
    }

    return false;
  }
}
