import { NextRequest, NextResponse } from 'next/server';
import { SmartRouter } from '../../../../../lib/routing/smart-router';
import { z } from 'zod';

// Initialize smart router (in a real app, this would be a singleton)
const smartRouter = new SmartRouter();

// Request validation schema
const SmartRoutingSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1, 'Message content cannot be empty'),
      })
    )
    .min(1, 'At least 1 message required'),
  optimization: z.enum(['cost', 'speed', 'quality', 'balanced']),
  budget: z.number().min(0).max(1).optional().default(0.1),
  quality_threshold: z.number().min(0).max(1).optional().default(0.7),
  max_latency: z.number().min(100).max(30000).optional().default(10000),
  preferred_models: z.array(z.string()).optional().default([]),
  exclude_models: z.array(z.string()).optional().default([]),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = SmartRoutingSchema.parse(body);

    const {
      messages,
      optimization,
      budget,
      quality_threshold,
      max_latency,
      preferred_models,
      exclude_models,
    } = validatedData;

    // Perform smart routing
    const routing = await smartRouter.routeRequest({
      messages,
      optimization,
      budget,
      quality_threshold,
      max_latency,
      preferred_models,
      exclude_models,
    });

    return NextResponse.json({
      success: true,
      data: routing,
      message: 'Smart routing completed successfully',
    });
  } catch (error: any) {
    console.error('Smart routing error:', error);

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
        message: 'Smart routing failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const routingStats = smartRouter.getRoutingStats();

    return NextResponse.json({
      success: true,
      data: {
        routing_statistics: routingStats,
        optimization_strategies: {
          cost: 'Route to cheapest model that meets quality threshold',
          speed: 'Route to fastest model that meets quality threshold',
          quality: 'Route to highest quality model within budget',
          balanced: 'Route to model with best quality per dollar ratio',
        },
        supported_constraints: {
          budget: 'Maximum cost per request (0-1)',
          quality_threshold: 'Minimum quality score (0-1)',
          max_latency: 'Maximum response time in milliseconds',
          preferred_models: 'Models to prioritize',
          exclude_models: 'Models to avoid',
        },
      },
      message: 'Smart routing info retrieved successfully',
    });
  } catch (error: any) {
    console.error('Smart routing info error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve smart routing info',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
