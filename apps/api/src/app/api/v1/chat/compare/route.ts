import { NextRequest, NextResponse } from 'next/server';
import { ModelComparisonService } from '../../../../../lib/comparison/model-comparison';
import { z } from 'zod';

// Initialize comparison service (in a real app, this would be a singleton)
const comparisonService = new ModelComparisonService();

// Request validation schema
const CompareRequestSchema = z.object({
  models: z
    .array(z.string())
    .min(2, 'At least 2 models required')
    .max(5, 'Maximum 5 models allowed'),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1, 'Message content cannot be empty'),
      })
    )
    .min(1, 'At least 1 message required'),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().min(1).max(4096).optional(),
  timeout: z.number().min(1000).max(60000).optional().default(30000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CompareRequestSchema.parse(body);

    const { models, messages, temperature, max_tokens, timeout } =
      validatedData;

    // Perform model comparison
    const comparison = await comparisonService.compareModels({
      models,
      messages,
      temperature,
      max_tokens,
      timeout,
    });

    return NextResponse.json({
      success: true,
      data: comparison,
      message: 'Model comparison completed successfully',
    });
  } catch (error: any) {
    console.error('Model comparison error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Invalid request data',
          error: error.errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join(', '),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Model comparison failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const availableModels = comparisonService.getAvailableModels();
    const modelInfo = comparisonService.getModelInfo();

    return NextResponse.json({
      success: true,
      data: {
        available_models: availableModels,
        model_info: modelInfo,
        comparison_capabilities: {
          max_models: 5,
          timeout_range: '1-60 seconds',
          supported_providers: ['openai', 'anthropic', 'google', 'ollama'],
        },
      },
      message: 'Model comparison info retrieved successfully',
    });
  } catch (error: any) {
    console.error('Model comparison info error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve model comparison info',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
