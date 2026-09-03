/**
 * Model Capabilities Database
 * Complete model information including capabilities, pricing, and performance metrics
 * Updated as of January 2025
 */

import { ModelCapabilities } from '../types/routing.types';

/**
 * Complete capabilities matrix for all supported AI models
 */
export const MODEL_CAPABILITIES_DB: ModelCapabilities[] = [
  // Anthropic Claude Models
  {
    modelId: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    provider: 'anthropic',
    available: true,
    pricing: {
      inputCostPerMillion: 15.0,
      outputCostPerMillion: 75.0,
    },
    performance: {
      averageLatency: 2500,
      qualityScore: 9.5,
      reliabilityScore: 9.5,
      contextWindow: 200000,
      maxOutputTokens: 4096,
    },
    capabilities: {
      code: 9.5,
      reasoning: 9.8,
      creative: 9.2,
      factual: 9.0,
      vision: 9.0,
      conversational: 9.5,
      mathematics: 9.5,
      multistep: 9.8,
    },
    features: ['vision', 'streaming', 'function-calling', 'long-context'],
    lastUpdated: new Date('2025-01-01'),
  },
  {
    modelId: 'claude-3-sonnet-20240229',
    displayName: 'Claude 3 Sonnet',
    provider: 'anthropic',
    available: true,
    pricing: {
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
    },
    performance: {
      averageLatency: 1500,
      qualityScore: 9.0,
      reliabilityScore: 9.5,
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
    capabilities: {
      code: 9.0,
      reasoning: 9.5,
      creative: 9.0,
      factual: 8.8,
      vision: 8.5,
      conversational: 9.2,
      mathematics: 9.0,
      multistep: 9.5,
    },
    features: ['vision', 'streaming', 'function-calling', 'long-context'],
    lastUpdated: new Date('2025-01-01'),
  },
  {
    modelId: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    provider: 'anthropic',
    available: true,
    pricing: {
      inputCostPerMillion: 0.25,
      outputCostPerMillion: 1.25,
    },
    performance: {
      averageLatency: 800,
      qualityScore: 8.0,
      reliabilityScore: 9.0,
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
    capabilities: {
      code: 7.5,
      reasoning: 8.0,
      creative: 7.8,
      factual: 8.0,
      vision: 7.5,
      conversational: 8.5,
      mathematics: 7.5,
      multistep: 7.8,
    },
    features: ['vision', 'streaming', 'function-calling', 'long-context'],
    lastUpdated: new Date('2025-01-01'),
  },
  // OpenAI Models
  {
    modelId: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    provider: 'openai',
    available: true,
    pricing: {
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 30.0,
    },
    performance: {
      averageLatency: 2000,
      qualityScore: 9.3,
      reliabilityScore: 9.2,
      contextWindow: 128000,
      maxOutputTokens: 16384,
    },
    capabilities: {
      code: 9.2,
      reasoning: 9.3,
      creative: 9.0,
      factual: 8.8,
      vision: 9.2,
      conversational: 9.0,
      mathematics: 9.2,
      multistep: 9.3,
    },
    features: ['vision', 'streaming', 'function-calling', 'long-context'],
    lastUpdated: new Date('2025-01-01'),
  },
  {
    modelId: 'gpt-4o',
    displayName: 'GPT-4o',
    provider: 'openai',
    available: true,
    pricing: {
      inputCostPerMillion: 5.0,
      outputCostPerMillion: 15.0,
    },
    performance: {
      averageLatency: 1200,
      qualityScore: 9.4,
      reliabilityScore: 9.3,
      contextWindow: 128000,
      maxOutputTokens: 16384,
    },
    capabilities: {
      code: 9.3,
      reasoning: 9.4,
      creative: 9.2,
      factual: 9.0,
      vision: 9.3,
      conversational: 9.3,
      mathematics: 9.3,
      multistep: 9.4,
    },
    features: ['vision', 'streaming', 'function-calling', 'long-context'],
    lastUpdated: new Date('2025-01-01'),
  },
  {
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    provider: 'openai',
    available: true,
    pricing: {
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.6,
    },
    performance: {
      averageLatency: 600,
      qualityScore: 8.5,
      reliabilityScore: 9.0,
      contextWindow: 128000,
      maxOutputTokens: 16384,
    },
    capabilities: {
      code: 8.0,
      reasoning: 8.3,
      creative: 8.5,
      factual: 8.3,
      vision: 8.0,
      conversational: 9.0,
      mathematics: 8.0,
      multistep: 8.2,
    },
    features: ['vision', 'streaming', 'function-calling', 'long-context'],
    lastUpdated: new Date('2025-01-01'),
  },
  // Google Gemini Models
  {
    modelId: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    provider: 'google',
    available: true,
    pricing: {
      inputCostPerMillion: 1.25,
      outputCostPerMillion: 5.0,
    },
    performance: {
      averageLatency: 1500,
      qualityScore: 9.2,
      reliabilityScore: 9.1,
      contextWindow: 1000000,
      maxOutputTokens: 8192,
    },
    capabilities: {
      code: 8.8,
      reasoning: 9.2,
      creative: 8.8,
      factual: 9.0,
      vision: 9.0,
      conversational: 8.5,
      mathematics: 9.2,
      multistep: 9.2,
    },
    features: ['vision', 'streaming', 'function-calling', 'ultra-long-context'],
    lastUpdated: new Date('2025-01-01'),
  },
  {
    modelId: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    provider: 'google',
    available: true,
    pricing: {
      inputCostPerMillion: 0.075,
      outputCostPerMillion: 0.3,
    },
    performance: {
      averageLatency: 700,
      qualityScore: 8.3,
      reliabilityScore: 9.0,
      contextWindow: 1000000,
      maxOutputTokens: 8192,
    },
    capabilities: {
      code: 7.8,
      reasoning: 8.2,
      creative: 8.2,
      factual: 8.5,
      vision: 8.3,
      conversational: 8.8,
      mathematics: 8.3,
      multistep: 8.2,
    },
    features: ['vision', 'streaming', 'function-calling', 'ultra-long-context'],
    lastUpdated: new Date('2025-01-01'),
  },
  // Perplexity Models
  {
    modelId: 'sonar-pro',
    displayName: 'Perplexity Sonar Pro',
    provider: 'perplexity',
    available: true,
    pricing: {
      inputCostPerMillion: 1.0,
      outputCostPerMillion: 1.0,
    },
    performance: {
      averageLatency: 1500,
      qualityScore: 8.8,
      reliabilityScore: 8.5,
      contextWindow: 131072,
      maxOutputTokens: 4096,
    },
    capabilities: {
      code: 7.5,
      reasoning: 8.5,
      creative: 7.8,
      factual: 9.5,
      vision: 0,
      conversational: 8.0,
      mathematics: 8.2,
      multistep: 8.3,
    },
    features: ['internet', 'streaming', 'real-time-search'],
    lastUpdated: new Date('2025-01-01'),
  },
  {
    modelId: 'sonar',
    displayName: 'Perplexity Sonar',
    provider: 'perplexity',
    available: true,
    pricing: {
      inputCostPerMillion: 0.2,
      outputCostPerMillion: 0.2,
    },
    performance: {
      averageLatency: 1000,
      qualityScore: 8.0,
      reliabilityScore: 8.5,
      contextWindow: 131072,
      maxOutputTokens: 4096,
    },
    capabilities: {
      code: 6.5,
      reasoning: 7.8,
      creative: 7.2,
      factual: 9.2,
      vision: 0,
      conversational: 8.2,
      mathematics: 7.5,
      multistep: 7.8,
    },
    features: ['internet', 'streaming', 'real-time-search'],
    lastUpdated: new Date('2025-01-01'),
  },
];

/**
 * Get model by ID
 */
export function getModelById(modelId: string): ModelCapabilities | undefined {
  return MODEL_CAPABILITIES_DB.find(m => m.modelId === modelId);
}

/**
 * Get all models for a provider
 */
export function getModelsByProvider(provider: string): ModelCapabilities[] {
  return MODEL_CAPABILITIES_DB.filter(m => m.provider === provider);
}

/**
 * Get all available models
 */
export function getAvailableModels(): ModelCapabilities[] {
  return MODEL_CAPABILITIES_DB.filter(m => m.available);
}

/**
 * Get cheapest model that meets requirements
 */
export function getCheapestModel(
  capabilities: Partial<
    Record<keyof ModelCapabilities['capabilities'], number>
  >,
  provider?: string
): ModelCapabilities | null {
  const models = provider
    ? getModelsByProvider(provider)
    : MODEL_CAPABILITIES_DB;

  // Filter by capability requirements
  const suitable = models.filter(model => {
    return Object.entries(capabilities).every(([key, minRating]) => {
      const capability = key as keyof ModelCapabilities['capabilities'];
      return model.capabilities[capability] >= minRating;
    });
  });

  if (suitable.length === 0) return null;

  // Return cheapest (combining input and output costs)
  return suitable.reduce((cheapest, current) => {
    const cheapestTotal =
      cheapest.pricing.inputCostPerMillion +
      cheapest.pricing.outputCostPerMillion;
    const currentTotal =
      current.pricing.inputCostPerMillion +
      current.pricing.outputCostPerMillion;
    return currentTotal < cheapestTotal ? current : cheapest;
  });
}

/**
 * Get fastest model that meets requirements
 */
export function getFastestModel(
  capabilities: Partial<
    Record<keyof ModelCapabilities['capabilities'], number>
  >,
  provider?: string
): ModelCapabilities | null {
  const models = provider
    ? getModelsByProvider(provider)
    : MODEL_CAPABILITIES_DB;

  // Filter by capability requirements
  const suitable = models.filter(model => {
    return Object.entries(capabilities).every(([key, minRating]) => {
      const capability = key as keyof ModelCapabilities['capabilities'];
      return model.capabilities[capability] >= minRating;
    });
  });

  if (suitable.length === 0) return null;

  // Return fastest
  return suitable.reduce((fastest, current) =>
    current.performance.averageLatency < fastest.performance.averageLatency
      ? current
      : fastest
  );
}

/**
 * Get highest quality model that meets requirements
 */
export function getHighestQualityModel(
  capabilities: Partial<
    Record<keyof ModelCapabilities['capabilities'], number>
  >,
  provider?: string
): ModelCapabilities | null {
  const models = provider
    ? getModelsByProvider(provider)
    : MODEL_CAPABILITIES_DB;

  // Filter by capability requirements
  const suitable = models.filter(model => {
    return Object.entries(capabilities).every(([key, minRating]) => {
      const capability = key as keyof ModelCapabilities['capabilities'];
      return model.capabilities[capability] >= minRating;
    });
  });

  if (suitable.length === 0) return null;

  // Return highest quality
  return suitable.reduce((best, current) =>
    current.performance.qualityScore > best.performance.qualityScore
      ? current
      : best
  );
}

/**
 * Get models that support a specific feature
 */
export function getModelsWithFeature(feature: string): ModelCapabilities[] {
  return MODEL_CAPABILITIES_DB.filter(m => m.features.includes(feature));
}

/**
 * Get models with context window >= specified size
 */
export function getModelsWithContextWindow(
  minTokens: number
): ModelCapabilities[] {
  return MODEL_CAPABILITIES_DB.filter(
    m => m.performance.contextWindow >= minTokens
  );
}

/**
 * Compare models by cost and performance
 */
export function compareModels(
  model1Id: string,
  model2Id: string
): {
  costDifference: number;
  latencyDifference: number;
  qualityDifference: number;
} | null {
  const model1 = getModelById(model1Id);
  const model2 = getModelById(model2Id);

  if (!model1 || !model2) return null;

  const cost1 =
    model1.pricing.inputCostPerMillion + model1.pricing.outputCostPerMillion;
  const cost2 =
    model2.pricing.inputCostPerMillion + model2.pricing.outputCostPerMillion;

  return {
    costDifference: ((cost2 - cost1) / cost1) * 100,
    latencyDifference:
      model2.performance.averageLatency - model1.performance.averageLatency,
    qualityDifference:
      model2.performance.qualityScore - model1.performance.qualityScore,
  };
}
