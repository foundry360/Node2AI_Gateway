/**
 * Budget Router
 * Enforces spending limits and budget constraints
 */

import {
  UserPreferences,
  PromptAnalysis,
  BudgetTracker,
} from '../../types/routing.types';
import {
  MODEL_CAPABILITIES_DB,
  getModelById,
} from '../../constants/model-capabilities';
import { RuleBasedRouter } from './rule-based-router';

export class BudgetRouter {
  private ruleBasedRouter: RuleBasedRouter;

  constructor() {
    this.ruleBasedRouter = new RuleBasedRouter();
  }

  /**
   * Route a prompt considering budget constraints
   */
  async route(
    prompt: string,
    preferences: UserPreferences,
    analysis: PromptAnalysis,
    currentSpend: BudgetTracker
  ): Promise<string> {
    // First, get the ideal model using rule-based routing
    const idealModelDecision = await this.ruleBasedRouter.route(
      prompt,
      preferences,
      analysis
    );

    // Estimate cost for ideal model
    const idealCost = this.estimateCost(
      analysis.estimatedInputTokens,
      analysis.estimatedOutputTokens,
      idealModelDecision.model
    );

    // Check budget status
    const budgetStatus = this.checkBudgetStatus(
      idealCost,
      currentSpend,
      preferences
    );

    // If budget is critical or exceeded, force cheapest viable model
    if (budgetStatus === 'critical' || budgetStatus === 'exceeded') {
      const cheapestModel = this.getCheapestViableModel(analysis);
      if (cheapestModel) {
        return cheapestModel;
      }
    }

    // If budget is low (warning), prefer cost-effective models
    if (budgetStatus === 'warning') {
      // Adjust preferences to prioritize cost temporarily
      const costAwarePreferences: UserPreferences = {
        ...preferences,
        prioritize: 'cost',
      };

      const costAwareModelDecision = await this.ruleBasedRouter.route(
        prompt,
        costAwarePreferences,
        analysis
      );

      return costAwareModelDecision.model;
    }

    // Budget is healthy, use ideal model
    return idealModelDecision.model;
  }

  /**
   * Estimate cost for a given model and tokens
   */
  estimateCost(
    inputTokens: number,
    outputTokens: number,
    modelId: string
  ): number {
    const model = getModelById(modelId);
    if (!model) return 0;

    const inputCost =
      (inputTokens / 1_000_000) * model.pricing.inputCostPerMillion;
    const outputCost =
      (outputTokens / 1_000_000) * model.pricing.outputCostPerMillion;

    return inputCost + outputCost;
  }

  /**
   * Get the cheapest model that can still handle the task
   */
  getCheapestViableModel(analysis: PromptAnalysis): string | null {
    // Get all available models
    const available = MODEL_CAPABILITIES_DB.filter(m => m.available);

    // Filter by minimum capability requirements
    const viable = available.filter(model => {
      // Check if model has required capabilities
      const hasCapabilities = analysis.requiredCapabilities.every(
        cap => model.capabilities[cap] >= 6
      );

      // Check if model has required features
      const hasFeatures =
        (!analysis.requiresInternet || model.features.includes('internet')) &&
        (!analysis.requiresVision || model.features.includes('vision'));

      // Check if model has adequate context
      const hasContext =
        analysis.estimatedInputTokens < model.performance.contextWindow;

      return hasCapabilities && hasFeatures && hasContext;
    });

    if (viable.length === 0) {
      return null;
    }

    // Return cheapest
    const cheapest = viable.reduce((lowest, current) => {
      const lowestCost =
        lowest.pricing.inputCostPerMillion +
        lowest.pricing.outputCostPerMillion;
      const currentCost =
        current.pricing.inputCostPerMillion +
        current.pricing.outputCostPerMillion;
      return currentCost < lowestCost ? current : lowest;
    });

    return cheapest.modelId;
  }

  /**
   * Check budget status
   */
  checkBudgetStatus(
    estimatedCost: number,
    currentSpend: BudgetTracker,
    preferences: UserPreferences
  ): 'healthy' | 'warning' | 'critical' | 'exceeded' {
    // Check daily budget
    if (currentSpend.dailyLimit && currentSpend.dailyRemaining !== undefined) {
      if (currentSpend.dailyRemaining <= 0) {
        return 'exceeded';
      }

      if (estimatedCost > currentSpend.dailyRemaining) {
        return 'critical';
      }

      // If remaining budget is less than 5x estimated cost, warn
      if (currentSpend.dailyRemaining < estimatedCost * 5) {
        return 'warning';
      }
    }

    // Check weekly budget
    if (
      currentSpend.weeklyLimit &&
      currentSpend.weeklyRemaining !== undefined
    ) {
      if (currentSpend.weeklyRemaining <= 0) {
        return 'exceeded';
      }

      if (estimatedCost > currentSpend.weeklyRemaining) {
        return 'critical';
      }
    }

    // Check monthly budget
    if (
      currentSpend.monthlyLimit &&
      currentSpend.monthlyRemaining !== undefined
    ) {
      if (currentSpend.monthlyRemaining <= 0) {
        return 'exceeded';
      }

      if (estimatedCost > currentSpend.monthlyRemaining) {
        return 'critical';
      }
    }

    // Check per-request limit
    if (
      preferences.maxCostPerRequest &&
      estimatedCost > preferences.maxCostPerRequest
    ) {
      return 'critical';
    }

    return 'healthy';
  }

  /**
   * Calculate remaining budget for a period
   */
  calculateRemaining(
    limit: number,
    spent: number
  ): { remaining: number; percentage: number; status: string } {
    const remaining = Math.max(0, limit - spent);
    const percentage = (spent / limit) * 100;
    let status = 'healthy';

    if (percentage >= 100) {
      status = 'exceeded';
    } else if (percentage >= 90) {
      status = 'critical';
    } else if (percentage >= 75) {
      status = 'warning';
    }

    return { remaining, percentage, status };
  }

  /**
   * Get budget recommendations
   */
  getBudgetRecommendations(currentSpend: BudgetTracker): Array<{
    period: string;
    recommendation: string;
    urgency: 'low' | 'medium' | 'high';
  }> {
    const recommendations: Array<{
      period: string;
      recommendation: string;
      urgency: 'low' | 'medium' | 'high';
    }> = [];

    // Daily recommendations
    if (currentSpend.dailyLimit && currentSpend.dailyRemaining !== undefined) {
      const daily = this.calculateRemaining(
        currentSpend.dailyLimit,
        currentSpend.dailySpend
      );

      if (daily.status === 'exceeded') {
        recommendations.push({
          period: 'daily',
          recommendation: `Daily budget exceeded by $${Math.abs(daily.remaining).toFixed(2)}. Consider reducing request frequency or using lower-cost models.`,
          urgency: 'high',
        });
      } else if (daily.status === 'critical') {
        recommendations.push({
          period: 'daily',
          recommendation: `Daily budget at ${daily.percentage.toFixed(1)}%. Only $${daily.remaining.toFixed(2)} remaining. Switch to cost-effective models.`,
          urgency: 'high',
        });
      } else if (daily.status === 'warning') {
        recommendations.push({
          period: 'daily',
          recommendation: `Daily budget at ${daily.percentage.toFixed(1)}%. Consider optimizing request costs.`,
          urgency: 'medium',
        });
      }
    }

    // Similar for weekly and monthly
    // ... (omitted for brevity, similar logic)

    return recommendations;
  }
}
