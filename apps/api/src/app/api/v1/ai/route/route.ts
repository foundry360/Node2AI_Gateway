/**
 * AI Routing API Endpoint
 * POST /api/v1/ai/route
 * Provides intelligent model routing recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
import { aiRoutingService } from '@/lib/services/ai-routing.service';
import {
  UserPreferences,
  CustomerSettings,
  BudgetTracker,
} from '@/lib/types/routing.types';
import { z } from 'zod';

// Request validation schema
const RouteRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  conversation_id: z.string().uuid().optional(),
  preferences: z
    .object({
      prioritize: z
        .enum(['cost', 'speed', 'quality', 'balanced'])
        .default('balanced'),
      max_cost_per_request: z.number().positive().optional(),
      preferred_model: z.string().optional(),
      enable_auto_routing: z.boolean().default(true),
    })
    .default({}),
  auto_route: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    try {
      const body = await request.json();
      const validatedData = RouteRequestSchema.parse(body);

      // Get user preferences
      const userPreferences: UserPreferences = {
        prioritize: validatedData.preferences.prioritize,
        preferredModel: validatedData.preferences.preferred_model,
        maxCostPerRequest: validatedData.preferences.max_cost_per_request,
        enableAutoRouting: validatedData.auto_route,
        enableFallback: true,
      };

      // Get customer settings (simplified - would come from DB in production)
      const customerSettings: CustomerSettings = {
        allowedModels: [], // Empty = all models allowed
        enabledFeatures: ['auto-routing', 'fallback-routing'],
      };

      // Get budget tracking (simplified - would come from DB in production)
      const currentSpend: BudgetTracker = {
        dailySpend: 0,
        weeklySpend: 0,
        monthlySpend: 0,
        status: 'healthy',
      };

      // Make routing decision
      const decision = await aiRoutingService.routeRequest({
        prompt: validatedData.prompt,
        userPreferences,
        customerSettings,
        currentSpend,
      });

      return NextResponse.json({
        success: true,
        data: {
          model: decision.model,
          provider: decision.provider,
          fallbacks: decision.fallbacks,
          estimated_cost: decision.costEstimate.cost,
          estimated_tokens: {
            input: decision.tokenEstimate.input,
            output: decision.tokenEstimate.output,
          },
          reasoning: decision.reasoning,
          analysis: {
            complexity: decision.analysis.complexity,
            domains: decision.analysis.domains,
            required_capabilities: decision.analysis.requiredCapabilities,
          },
        },
        message: 'Routing decision generated successfully',
      });
    } catch (error: any) {
      console.error('[AI Route API] Error:', error);

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
          message: 'Failed to generate routing decision',
          error: error.message,
        },
        { status: 500 }
      );
    }
  });
}

export async function OPTIONS(request: NextRequest) {
  // Get origin from request for CORS
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:3001',
  ];
  const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : '*';

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
