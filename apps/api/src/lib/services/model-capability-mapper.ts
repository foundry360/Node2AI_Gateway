/**
 * Model Capability Mapper
 * Maps fetched model names to known capabilities for routing decisions
 */

import { ModelCapabilities } from '../types/routing.types';

/**
 * Create default capabilities for a model based on its name
 */
export function inferModelCapabilities(
  modelId: string
): ModelCapabilities | null {
  const lowerModel = modelId.toLowerCase();

  // OpenAI Models
  if (lowerModel.includes('gpt-4o') && lowerModel.includes('mini')) {
    return createModelCapabilities(modelId, 'openai', {
      pricing: { inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
      qualityScore: 8.5,
      latency: 600,
      contextWindow: 128000,
      capabilities: {
        code: 8.0,
        reasoning: 8.3,
        creative: 8.5,
        factual: 8.3,
        vision: 8.0,
        mathematics: 8.0,
        conversational: 8.5,
        multistep: 8.0,
      },
    });
  }

  if (lowerModel.includes('gpt-4o') && !lowerModel.includes('mini')) {
    return createModelCapabilities(modelId, 'openai', {
      pricing: { inputCostPerMillion: 5.0, outputCostPerMillion: 15.0 },
      qualityScore: 9.4,
      latency: 1200,
      contextWindow: 128000,
      capabilities: {
        code: 9.3,
        reasoning: 9.4,
        creative: 9.2,
        factual: 9.0,
        vision: 9.3,
        mathematics: 9.3,
        conversational: 9.5,
        multistep: 9.0,
      },
    });
  }

  if (lowerModel.includes('gpt-4-turbo')) {
    return createModelCapabilities(modelId, 'openai', {
      pricing: { inputCostPerMillion: 10.0, outputCostPerMillion: 30.0 },
      qualityScore: 9.3,
      latency: 2000,
      contextWindow: 128000,
      capabilities: {
        code: 9.2,
        reasoning: 9.3,
        creative: 9.0,
        factual: 8.8,
        vision: 9.2,
        mathematics: 9.2,
        conversational: 9.3,
        multistep: 8.8,
      },
    });
  }

  if (
    lowerModel.includes('gpt-4') &&
    !lowerModel.includes('turbo') &&
    !lowerModel.includes('o')
  ) {
    return createModelCapabilities(modelId, 'openai', {
      pricing: { inputCostPerMillion: 0.03, outputCostPerMillion: 0.06 },
      qualityScore: 9.0,
      latency: 3000,
      contextWindow: 8192,
      capabilities: {
        code: 9.0,
        reasoning: 9.0,
        creative: 8.5,
        factual: 8.5,
        vision: 8.0,
        mathematics: 8.5,
        conversational: 9.0,
        multistep: 8.5,
      },
    });
  }

  if (lowerModel.includes('o1-pro')) {
    return createModelCapabilities(modelId, 'openai', {
      pricing: { inputCostPerMillion: 15.0, outputCostPerMillion: 60.0 },
      qualityScore: 9.5,
      latency: 10000,
      contextWindow: 200000,
      capabilities: {
        code: 9.0,
        reasoning: 10.0,
        creative: 7.0,
        factual: 9.0,
        vision: 0,
        mathematics: 10.0,
        conversational: 7.5,
        multistep: 10.0,
      },
    });
  }

  if (lowerModel.includes('o1') && !lowerModel.includes('pro')) {
    return createModelCapabilities(modelId, 'openai', {
      pricing: { inputCostPerMillion: 3.0, outputCostPerMillion: 12.0 },
      qualityScore: 9.2,
      latency: 8000,
      contextWindow: 200000,
      capabilities: {
        code: 8.5,
        reasoning: 9.5,
        creative: 6.5,
        factual: 8.5,
        vision: 0,
        mathematics: 9.5,
        conversational: 7.0,
        multistep: 9.5,
      },
    });
  }

  // Google Gemini Models
  if (
    lowerModel.includes('gemini') &&
    lowerModel.includes('pro') &&
    !lowerModel.includes('flash')
  ) {
    return createModelCapabilities(modelId, 'google', {
      pricing: { inputCostPerMillion: 1.25, outputCostPerMillion: 5.0 },
      qualityScore: 9.2,
      latency: 1500,
      contextWindow: 1000000,
      capabilities: {
        code: 8.8,
        reasoning: 9.2,
        creative: 8.8,
        factual: 9.0,
        vision: 9.0,
        mathematics: 9.2,
        conversational: 9.2,
        multistep: 9.0,
      },
    });
  }

  if (lowerModel.includes('gemini') && lowerModel.includes('flash')) {
    return createModelCapabilities(modelId, 'google', {
      pricing: { inputCostPerMillion: 0.075, outputCostPerMillion: 0.3 },
      qualityScore: 8.3,
      latency: 700,
      contextWindow: 1000000,
      capabilities: {
        code: 7.8,
        reasoning: 8.2,
        creative: 8.2,
        factual: 8.5,
        vision: 8.3,
        mathematics: 8.3,
        conversational: 8.5,
        multistep: 7.8,
      },
    });
  }

  if (lowerModel.includes('gemini')) {
    return createModelCapabilities(modelId, 'google', {
      pricing: { inputCostPerMillion: 0.5, outputCostPerMillion: 1.5 },
      qualityScore: 8.5,
      latency: 1000,
      contextWindow: 32768,
      capabilities: {
        code: 8.0,
        reasoning: 8.5,
        creative: 8.0,
        factual: 8.5,
        vision: 7.5,
        mathematics: 8.0,
        conversational: 8.3,
        multistep: 7.5,
      },
    });
  }

  // Anthropic Claude Models
  if (lowerModel.includes('claude') && lowerModel.includes('opus')) {
    return createModelCapabilities(modelId, 'anthropic', {
      pricing: { inputCostPerMillion: 15.0, outputCostPerMillion: 75.0 },
      qualityScore: 9.5,
      latency: 2500,
      contextWindow: 200000,
      capabilities: {
        code: 9.5,
        reasoning: 9.8,
        creative: 9.2,
        factual: 9.0,
        vision: 9.0,
        mathematics: 9.5,
        conversational: 9.8,
        multistep: 9.5,
      },
    });
  }

  if (lowerModel.includes('claude') && lowerModel.includes('sonnet')) {
    return createModelCapabilities(modelId, 'anthropic', {
      pricing: { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
      qualityScore: 9.0,
      latency: 1500,
      contextWindow: 200000,
      capabilities: {
        code: 9.0,
        reasoning: 9.5,
        creative: 9.0,
        factual: 8.8,
        vision: 8.5,
        mathematics: 9.0,
        conversational: 9.5,
        multistep: 9.3,
      },
    });
  }

  if (lowerModel.includes('claude') && lowerModel.includes('haiku')) {
    return createModelCapabilities(modelId, 'anthropic', {
      pricing: { inputCostPerMillion: 0.25, outputCostPerMillion: 1.25 },
      qualityScore: 8.0,
      latency: 800,
      contextWindow: 200000,
      capabilities: {
        code: 7.5,
        reasoning: 8.0,
        creative: 7.8,
        factual: 8.0,
        vision: 7.5,
        mathematics: 7.5,
        conversational: 8.5,
        multistep: 8.0,
      },
    });
  }

  if (lowerModel.includes('claude')) {
    return createModelCapabilities(modelId, 'anthropic', {
      pricing: { inputCostPerMillion: 8.0, outputCostPerMillion: 24.0 },
      qualityScore: 8.5,
      latency: 2000,
      contextWindow: 100000,
      capabilities: {
        code: 8.5,
        reasoning: 8.5,
        creative: 8.5,
        factual: 8.5,
        vision: 7.5,
        mathematics: 8.5,
        conversational: 9.0,
        multistep: 8.3,
      },
    });
  }

  // Perplexity Models
  if (lowerModel.includes('sonar') && lowerModel.includes('pro')) {
    return createModelCapabilities(modelId, 'perplexity', {
      pricing: { inputCostPerMillion: 1.0, outputCostPerMillion: 1.0 },
      qualityScore: 8.8,
      latency: 1500,
      contextWindow: 131072,
      capabilities: {
        code: 7.5,
        reasoning: 8.5,
        creative: 7.8,
        factual: 9.5,
        vision: 0,
        mathematics: 8.2,
        conversational: 8.5,
        multistep: 8.0,
      },
    });
  }

  if (lowerModel.includes('sonar') && !lowerModel.includes('pro')) {
    return createModelCapabilities(modelId, 'perplexity', {
      pricing: { inputCostPerMillion: 0.2, outputCostPerMillion: 0.2 },
      qualityScore: 8.0,
      latency: 1000,
      contextWindow: 131072,
      capabilities: {
        code: 6.5,
        reasoning: 7.8,
        creative: 7.2,
        factual: 9.2,
        vision: 0,
        mathematics: 7.5,
        conversational: 8.0,
        multistep: 7.5,
      },
    });
  }

  // If we can't infer capabilities, return null
  return null;
}

interface CreateModelParams {
  pricing: { inputCostPerMillion: number; outputCostPerMillion: number };
  qualityScore: number;
  latency: number;
  contextWindow: number;
  capabilities: {
    code: number;
    reasoning: number;
    creative: number;
    factual: number;
    vision: number;
    mathematics: number;
    conversational: number;
    multistep: number;
  };
}

function createModelCapabilities(
  modelId: string,
  provider: string,
  params: CreateModelParams
): ModelCapabilities {
  const features: string[] = [];
  if (params.capabilities.vision > 0) features.push('vision');
  features.push('streaming');

  if (
    provider === 'openai' ||
    provider === 'google' ||
    provider === 'anthropic'
  ) {
    features.push('function-calling');
  }

  if (params.contextWindow > 100000) {
    features.push('long-context');
  }

  if (provider === 'perplexity') {
    features.push('internet');
  }

  return {
    modelId,
    displayName: formatModelName(modelId),
    provider: provider as any,
    available: true,
    pricing: params.pricing,
    performance: {
      averageLatency: params.latency,
      qualityScore: params.qualityScore,
      reliabilityScore: 9.0,
      contextWindow: params.contextWindow,
      maxOutputTokens: 16384,
    },
    capabilities: params.capabilities,
    features,
    lastUpdated: new Date(),
  };
}

function formatModelName(modelId: string): string {
  const parts = modelId.split('-');
  return parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
