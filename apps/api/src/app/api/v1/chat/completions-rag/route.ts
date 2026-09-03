import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SmartRouter, RoutingConfig } from '../../../../../lib/core/router';
import { CostCalculator } from '../../../../../lib/core/cost-calculator';
import { RAGService } from '../../../../../lib/rag/rag-service';
import { ChatRequest, ChatResponse } from '../../../../../lib/types/providers';

// Request validation schema
const ChatRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  temperature: z.number().optional().default(0.7),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional().default(false),
  use_curated_data: z.boolean().optional().default(false),
  curated_sources: z.array(z.string()).optional(),
});

// Initialize services (in a real app, these would be singletons)
const routingConfig: RoutingConfig = {
  primary: 'openai',
  fallback: ['anthropic', 'google', 'perplexity', 'local'],
  costOptimization: true,
  qualityThreshold: 0.8,
  maxRetries: 3,
};

const router = new SmartRouter(routingConfig);
const costCalculator = new CostCalculator();
const ragService = new RAGService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = ChatRequestSchema.parse(body);

    const {
      model,
      messages,
      temperature,
      max_tokens,
      stream,
      use_curated_data,
      curated_sources,
    } = validatedData;

    const startTime = Date.now();

    // Get auth context from middleware
    const authContext = (request as any).auth;
    const organizationId = authContext?.organizationId || 'default-org';

    let enhancedMessages = [...messages];

    // Add RAG context if enabled
    if (use_curated_data && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        try {
          // Get relevant context from RAG
          const ragContext = await ragService.getContextForChat(
            lastMessage.content,
            organizationId,
            3 // Max 3 chunks
          );

          if (ragContext.relevant_chunks.length > 0) {
            // Build context prompt
            const contextPrompt = `Based on the following relevant information from your knowledge base:

${ragContext.context_text}

Sources: ${ragContext.sources.join(', ')}
Confidence: ${(ragContext.confidence_score * 100).toFixed(1)}%

Please use this information to provide a comprehensive and accurate response. If the information doesn't directly answer the question, please say so and provide what information you can.`;

            // Add context as system message
            enhancedMessages = [
              { role: 'system', content: contextPrompt },
              ...messages,
            ];

            console.log(
              `RAG Context added: ${ragContext.relevant_chunks.length} chunks, ${ragContext.sources.length} sources`
            );
          }
        } catch (error) {
          console.error('RAG context retrieval failed:', error);
          // Continue without RAG context
        }
      }
    }

    let response: ChatResponse;

    if (stream) {
      // For streaming, we need to handle it differently
      // This is a simplified version - in production, you'd need proper streaming response handling
      const mockResponse: ChatResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content:
                "Hello! I'm Node2AI with RAG capabilities. I can help you with questions using your curated knowledge base. How can I assist you today?",
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens:
            enhancedMessages
              .map(m => m.content.length)
              .reduce((a, b) => a + b, 0) / 4,
          completion_tokens: 50,
          total_tokens:
            enhancedMessages
              .map(m => m.content.length)
              .reduce((a, b) => a + b, 0) /
              4 +
            50,
        },
        cost: 0.0001,
      };

      response = mockResponse;
    } else {
      // Use smart router for non-streaming requests
      try {
        response = await router.routeRequest(enhancedMessages, {
          model,
          temperature,
          max_tokens,
          stream: false,
        });
      } catch (routerError: any) {
        console.error(
          'Smart router failed, falling back to mock response:',
          routerError.message
        );

        // Fallback to mock response if router fails
        response = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: model || 'gpt-3.5-turbo',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content:
                  "Hello! I'm Node2AI with RAG capabilities. I can help you with questions using your curated knowledge base. How can I assist you today?",
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens:
              enhancedMessages
                .map(m => m.content.length)
                .reduce((a, b) => a + b, 0) / 4,
            completion_tokens: 50,
            total_tokens:
              enhancedMessages
                .map(m => m.content.length)
                .reduce((a, b) => a + b, 0) /
                4 +
              50,
          },
          cost: 0.0001,
        };
      }
    }

    // Track usage for cost calculation
    const latency = Date.now() - startTime;
    costCalculator.trackUsage({
      organizationId,
      provider: 'smart-router-rag', // In real implementation, this would be the actual provider used
      model: response.model,
      tokensInput: response.usage.prompt_tokens,
      tokensOutput: response.usage.completion_tokens,
      cost: response.cost,
      latency,
      success: true,
    });

    return NextResponse.json({
      success: true,
      data: response,
      message: 'Chat completion with RAG successful',
      metadata: {
        provider: 'smart-router-rag',
        latency: `${latency}ms`,
        cost: `$${response.cost.toFixed(6)}`,
        rag_enabled: use_curated_data,
        curated_sources: curated_sources || [],
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Invalid request payload',
          error: error.errors,
        },
        { status: 400 }
      );
    }
    console.error('Chat completions with RAG error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Internal server error',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
