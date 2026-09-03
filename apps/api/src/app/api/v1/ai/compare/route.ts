/**
 * AI Model Comparison API Endpoint
 * POST /api/v1/ai/compare
 * Compares responses from multiple models
 */

import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import {
  getAvailableModels,
  getModelById,
} from '@/lib/constants/model-capabilities';
import { z } from 'zod';

// Request validation schema
const CompareRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  models: z.array(z.string()).min(1, 'At least one model is required'),
});

export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await request.json();
      const validatedData = CompareRequestSchema.parse(body);

      // Validate models
      const validModels = validatedData.models.filter(modelId => {
        const model = getModelById(modelId);
        return model && model.available;
      });

      if (validModels.length === 0) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'No valid models provided',
            error: 'All specified models are invalid or unavailable',
          },
          { status: 400 }
        );
      }

      // Get model info for comparison
      const modelComparisons = validModels
        .map(modelId => {
          const model = getModelById(modelId);
          if (!model) return null;

          // Estimate cost (simplified)
          const estimatedTokens = 1000; // Placeholder
          const inputCost =
            (estimatedTokens / 1_000_000) * model.pricing.inputCostPerMillion;
          const outputCost =
            (estimatedTokens / 1_000_000) * model.pricing.outputCostPerMillion;

          return {
            model_id: model.modelId,
            display_name: model.displayName,
            provider: model.provider,
            estimated_cost: inputCost + outputCost,
            estimated_latency: model.performance.averageLatency,
            quality_score: model.performance.qualityScore,
            capabilities: model.capabilities,
            features: model.features,
          };
        })
        .filter(Boolean);

      return NextResponse.json({
        success: true,
        data: {
          prompt_length: validatedData.prompt.length,
          models: modelComparisons,
        },
        message: 'Model comparison generated successfully',
      });
    } catch (error: any) {
      console.error('[AI Compare API] Error:', error);

      if (error.name === 'ZodError') {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Validation error',
            error: error.errors,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Failed to compare models',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}
