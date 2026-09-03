/**
 * AI Routing Service
 * Main orchestration service that integrates prompt analysis, routing algorithms,
 * and decision-making for intelligent AI model selection
 */

import {
  UserPreferences,
  CustomerSettings,
  PromptAnalysis,
  RoutingDecision,
  BudgetTracker,
} from '../types/routing.types';
import { promptAnalyzer } from './prompt-analyzer.service';
import { RuleBasedRouter } from './routing/rule-based-router';
import { ScoreBasedRouter } from './routing/score-based-router';
import { ContextAwareRouter, Message } from './routing/context-aware-router';
import { BudgetRouter } from './routing/budget-router';
import { getModelById } from '../constants/model-capabilities';

export interface RoutingRequest {
  prompt: string;
  conversationHistory?: Message[];
  userPreferences: UserPreferences;
  customerSettings: CustomerSettings;
  currentSpend?: BudgetTracker;
  attachments?: File[];
}

export class AIRoutingService {
  private promptAnalyzer = promptAnalyzer;
  private ruleBasedRouter: RuleBasedRouter;
  private scoreBasedRouter: ScoreBasedRouter;
  private contextAwareRouter: ContextAwareRouter;
  private budgetRouter: BudgetRouter;

  constructor() {
    this.ruleBasedRouter = new RuleBasedRouter();
    this.scoreBasedRouter = new ScoreBasedRouter();
    this.contextAwareRouter = new ContextAwareRouter();
    this.budgetRouter = new BudgetRouter();
  }

  /**
   * Main routing method - orchestrates the complete routing flow
   */
  async routeRequest(request: RoutingRequest): Promise<RoutingDecision> {
    const startTime = Date.now();

    try {
      // Step 1: Analyze the prompt
      const analysis = await this.promptAnalyzer.analyzePrompt(
        request.prompt,
        request.attachments
      );

      // Step 2: Determine routing strategy
      let decision: RoutingDecision;

      if (request.userPreferences.enableAutoRouting) {
        // Auto-routing enabled - use intelligent selection

        // Check if context-aware routing should be used
        if (
          request.conversationHistory &&
          request.conversationHistory.length > 0
        ) {
          // Use context-aware routing
          decision = await this.routeWithContext(
            request.prompt,
            request.conversationHistory,
            request.userPreferences,
            analysis
          );
        } else {
          // Use score-based routing for new requests
          decision = await this.scoreBasedRouter.route(
            request.prompt,
            request.userPreferences,
            analysis,
            request.customerSettings
          );
        }
      } else {
        // Auto-routing disabled - use rule-based routing
        decision = await this.ruleBasedRouter.route(
          request.prompt,
          request.userPreferences,
          analysis
        );
      }

      // Step 4: Log the routing decision (would integrate with audit system)
      const routingTime = Date.now() - startTime;
      await this.logRoutingDecision(decision, routingTime);

      return decision;
    } catch (error) {
      console.error('[AIRoutingService] Error routing request:', error);
      throw error;
    }
  }

  /**
   * Route with conversation context
   */
  private async routeWithContext(
    prompt: string,
    conversationHistory: Message[],
    preferences: UserPreferences,
    analysis: PromptAnalysis
  ): Promise<RoutingDecision> {
    // Check if we should switch models
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const shouldSwitch = this.contextAwareRouter.shouldSwitchModel(
      prompt,
      lastMessage.model,
      conversationHistory,
      analysis
    );

    // If no switch needed and we have a current model, use it
    if (!shouldSwitch && lastMessage.model) {
      const currentModel = getModelById(lastMessage.model);
      if (currentModel && currentModel.available) {
        return this.buildDecisionForModel(
          currentModel.modelId,
          preferences,
          analysis,
          'Context consistency maintained'
        );
      }
    }

    // Otherwise, use score-based routing for optimal selection
    return this.scoreBasedRouter.route(prompt, preferences, analysis, {
      allowedModels: [],
      enabledFeatures: [],
    });
  }

  /**
   * Build decision from budget constraint
   */
  private buildDecisionFromBudget(
    modelId: string,
    analysis: PromptAnalysis,
    preferences: UserPreferences,
    budgetTracker: BudgetTracker
  ): RoutingDecision {
    const model = getModelById(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const inputCost =
      (analysis.estimatedInputTokens / 1_000_000) *
      model.pricing.inputCostPerMillion;
    const outputCost =
      (analysis.estimatedOutputTokens / 1_000_000) *
      model.pricing.outputCostPerMillion;
    const totalCost = inputCost + outputCost;

    return {
      model: modelId,
      provider: model.provider,
      fallbacks: [],
      reasoning: `Budget constraint applied: selected ${model.displayName} as most cost-effective option`,
      algorithm: 'budget-constrained',
      analysis,
      tokenEstimate: {
        input: analysis.estimatedInputTokens,
        output: analysis.estimatedOutputTokens,
        total: analysis.estimatedInputTokens + analysis.estimatedOutputTokens,
        confidence: 0.7,
      },
      costEstimate: {
        cost: totalCost,
        confidence: 0.7,
        breakdown: {
          inputCost,
          outputCost,
        },
      },
      alternatives: [],
    };
  }

  /**
   * Build decision for a specific model
   */
  private buildDecisionForModel(
    modelId: string,
    preferences: UserPreferences,
    analysis: PromptAnalysis,
    reasoning: string
  ): RoutingDecision {
    const model = getModelById(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const inputCost =
      (analysis.estimatedInputTokens / 1_000_000) *
      model.pricing.inputCostPerMillion;
    const outputCost =
      (analysis.estimatedOutputTokens / 1_000_000) *
      model.pricing.outputCostPerMillion;
    const totalCost = inputCost + outputCost;

    return {
      model: modelId,
      provider: model.provider,
      fallbacks: [],
      reasoning,
      algorithm: 'context-aware',
      analysis,
      tokenEstimate: {
        input: analysis.estimatedInputTokens,
        output: analysis.estimatedOutputTokens,
        total: analysis.estimatedInputTokens + analysis.estimatedOutputTokens,
        confidence: 0.7,
      },
      costEstimate: {
        cost: totalCost,
        confidence: 0.7,
        breakdown: {
          inputCost,
          outputCost,
        },
      },
      alternatives: [],
    };
  }

  /**
   * Log routing decision to audit system
   */
  private async logRoutingDecision(
    decision: RoutingDecision,
    routingTime: number
  ): Promise<void> {
    // TODO: Integrate with audit service
    console.log('[AIRoutingService] Routing decision logged:', {
      model: decision.model,
      algorithm: decision.algorithm,
      reasoning: decision.reasoning,
      estimatedCost: decision.costEstimate.cost,
      routingTime,
    });
  }
}

// Singleton instance
export const aiRoutingService = new AIRoutingService();
