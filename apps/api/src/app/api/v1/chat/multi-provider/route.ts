import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Request validation schema
const MultiProviderChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1, 'Message content cannot be empty'),
      })
    )
    .min(1, 'At least 1 message required'),
  providers: z
    .array(z.enum(['openai', 'anthropic', 'google', 'perplexity']))
    .min(1, 'At least 1 provider required'),
  comparison_mode: z
    .enum(['parallel', 'sequential', 'best_of'])
    .optional()
    .default('parallel'),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().positive().optional().default(1000),
  timeout: z.number().positive().optional().default(30000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = MultiProviderChatSchema.parse(body);

    const {
      messages,
      providers,
      comparison_mode,
      temperature,
      max_tokens,
      timeout,
    } = validatedData;

    // Mock multi-provider responses
    const mockProviderResponses = {
      openai: {
        provider: 'openai',
        model: 'gpt-4',
        response: {
          id: `chatcmpl-openai-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content:
                  'OpenAI GPT-4 provides comprehensive and detailed responses with strong reasoning capabilities.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 45,
            total_tokens: 70,
          },
        },
        latency: 1200,
        cost: 0.06,
        quality_score: 0.95,
      },
      anthropic: {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        response: {
          id: `chatcmpl-anthropic-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'claude-3-sonnet-20240229',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content:
                  'Anthropic Claude offers balanced performance with excellent safety and helpfulness characteristics.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 40,
            total_tokens: 65,
          },
        },
        latency: 1000,
        cost: 0.04,
        quality_score: 0.9,
      },
      google: {
        provider: 'google',
        model: 'gemini-pro',
        response: {
          id: `chatcmpl-google-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gemini-pro',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content:
                  'Google Gemini provides fast and efficient responses with strong multimodal capabilities.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 35,
            total_tokens: 60,
          },
        },
        latency: 800,
        cost: 0.03,
        quality_score: 0.85,
      },
      perplexity: {
        provider: 'perplexity',
        model: 'llama-3-sonar',
        response: {
          id: `chatcmpl-perplexity-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'llama-3-sonar',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content:
                  'Perplexity offers real-time information with web search capabilities and fast response times.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 30,
            total_tokens: 55,
          },
        },
        latency: 600,
        cost: 0.02,
        quality_score: 0.8,
      },
    };

    // Generate responses for requested providers
    const providerResults = providers.map(provider => {
      const providerData =
        mockProviderResponses[provider as keyof typeof mockProviderResponses];
      return {
        ...providerData,
        status: 'success',
        timestamp: new Date().toISOString(),
      };
    });

    // Calculate comparison metrics
    const totalCost = providerResults.reduce(
      (sum, result) => sum + result.cost,
      0
    );
    const averageLatency =
      providerResults.reduce((sum, result) => sum + result.latency, 0) /
      providerResults.length;
    const averageQuality =
      providerResults.reduce((sum, result) => sum + result.quality_score, 0) /
      providerResults.length;

    // Determine best response based on comparison mode
    let bestResponse;
    switch (comparison_mode) {
      case 'best_of':
        bestResponse = providerResults.reduce((best, current) =>
          current.quality_score > best.quality_score ? current : best
        );
        break;
      case 'sequential':
        bestResponse = providerResults[0]; // First provider
        break;
      default: // parallel
        bestResponse = providerResults.reduce((best, current) =>
          current.quality_score / current.cost > best.quality_score / best.cost
            ? current
            : best
        );
    }

    const response = {
      success: true,
      data: {
        comparison_mode,
        providers_requested: providers,
        provider_results: providerResults,
        best_response: bestResponse,
        comparison_metrics: {
          total_cost: totalCost,
          average_latency: averageLatency,
          average_quality: averageQuality,
          fastest_provider: providerResults.reduce((fastest, current) =>
            current.latency < fastest.latency ? current : fastest
          ).provider,
          cheapest_provider: providerResults.reduce((cheapest, current) =>
            current.cost < cheapest.cost ? current : cheapest
          ).provider,
          highest_quality_provider: providerResults.reduce((best, current) =>
            current.quality_score > best.quality_score ? current : best
          ).provider,
        },
        request_metadata: {
          temperature,
          max_tokens,
          timeout,
          total_providers: providers.length,
          processing_time: Math.max(...providerResults.map(r => r.latency)),
        },
      },
      message: `Multi-provider comparison completed using ${comparison_mode} mode`,
    };

    return NextResponse.json(response);
  } catch (error) {
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
        message: 'Multi-provider chat failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/chat/multi-provider
 * Get multi-provider comparison information
 */
export async function GET(request: NextRequest) {
  try {
    const response = {
      success: true,
      data: {
        available_providers: [
          {
            name: 'openai',
            models: ['gpt-4', 'gpt-3.5-turbo'],
            avg_latency: 1200,
            avg_cost: 0.06,
            quality_score: 0.95,
            capabilities: ['text-generation', 'reasoning', 'code-generation'],
          },
          {
            name: 'anthropic',
            models: ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
            avg_latency: 1000,
            avg_cost: 0.04,
            quality_score: 0.9,
            capabilities: ['text-generation', 'safety', 'helpfulness'],
          },
          {
            name: 'google',
            models: ['gemini-pro'],
            avg_latency: 800,
            avg_cost: 0.03,
            quality_score: 0.85,
            capabilities: ['text-generation', 'multimodal', 'fast-response'],
          },
          {
            name: 'perplexity',
            models: ['llama-3-sonar'],
            avg_latency: 600,
            avg_cost: 0.02,
            quality_score: 0.8,
            capabilities: ['text-generation', 'web-search', 'real-time-info'],
          },
        ],
        comparison_modes: {
          parallel: 'Run all providers simultaneously and compare results',
          sequential: 'Run providers one after another in order',
          best_of: 'Run all providers and return the highest quality response',
        },
        supported_parameters: {
          providers: 'Array of provider names to compare',
          comparison_mode: 'How to compare provider responses',
          temperature: 'Response creativity (0-2)',
          max_tokens: 'Maximum response length',
          timeout: 'Maximum wait time in milliseconds',
        },
        example_usage: {
          providers: ['openai', 'anthropic'],
          comparison_mode: 'parallel',
          messages: [
            {
              role: 'user',
              content: 'Compare the capabilities of different AI models',
            },
          ],
        },
      },
      message: 'Multi-provider comparison info retrieved successfully',
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Multi-provider info error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve multi-provider info',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
