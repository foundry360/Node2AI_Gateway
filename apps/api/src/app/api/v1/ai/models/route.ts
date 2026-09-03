/**
 * AI Models API Endpoint
 * GET /api/v1/ai/models
 * Returns list of available models with capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAvailableModels } from '@/lib/constants/model-capabilities';

export async function GET(request: NextRequest) {
  try {
    const models = getAvailableModels().map(model => ({
      model_id: model.modelId,
      display_name: model.displayName,
      provider: model.provider,
      available: model.available,
      pricing: {
        input_cost_per_million: model.pricing.inputCostPerMillion,
        output_cost_per_million: model.pricing.outputCostPerMillion,
      },
      performance: {
        average_latency: model.performance.averageLatency,
        quality_score: model.performance.qualityScore,
        context_window: model.performance.contextWindow,
        max_output_tokens: model.performance.maxOutputTokens,
      },
      capabilities: model.capabilities,
      features: model.features,
    }));

    return NextResponse.json({
      success: true,
      data: {
        models,
        count: models.length,
      },
      message: 'Models retrieved successfully',
    });
  } catch (error: any) {
    console.error('[AI Models API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve models',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
