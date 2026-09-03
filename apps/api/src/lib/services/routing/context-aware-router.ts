/**
 * Context-Aware Router
 * Considers conversation history when routing requests
 */

import { UserPreferences, PromptAnalysis } from '../../types/routing.types';
import { getModelById } from '../../constants/model-capabilities';

/**
 * Message in conversation history
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string; // Model used for this message
  timestamp: Date;
}

export class ContextAwareRouter {
  /**
   * Route a prompt considering conversation history
   */
  async route(
    prompt: string,
    conversationHistory: Message[],
    preferences: UserPreferences,
    analysis: PromptAnalysis
  ): Promise<string> {
    // If no history, we can't be context-aware
    if (!conversationHistory || conversationHistory.length === 0) {
      return 'claude-3-sonnet-20240229'; // Default
    }

    // Get the model used in the last message
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const currentModel = lastMessage.model;

    // Check if we should switch models
    const shouldSwitch = this.shouldSwitchModel(
      prompt,
      currentModel,
      conversationHistory,
      analysis
    );

    if (!shouldSwitch && currentModel) {
      // Continue with same model for consistency
      const model = getModelById(currentModel);
      if (model && model.available) {
        return currentModel;
      }
    }

    // Need to switch or no current model
    // Use rule-based or score-based routing (injected dependency)
    return 'claude-3-sonnet-20240229'; // Default - will be overridden by main router
  }

  /**
   * Determine if we should switch from current model
   */
  shouldSwitchModel(
    prompt: string,
    currentModel: string | undefined,
    history: Message[],
    analysis: PromptAnalysis
  ): boolean {
    if (!currentModel) return true;

    const model = getModelById(currentModel);
    if (!model || !model.available) return true;

    // Switch if new capability is required that current model doesn't have
    if (analysis.requiresInternet && !model.features.includes('internet')) {
      return true;
    }

    if (analysis.requiresVision && !model.features.includes('vision')) {
      return true;
    }

    // Switch if prompt is significantly longer than model's context can handle
    if (analysis.estimatedInputTokens > model.performance.contextWindow * 0.8) {
      return true;
    }

    // Switch if user explicitly requests a different model
    const lowerPrompt = prompt.toLowerCase();
    if (
      (lowerPrompt.includes('use ') || lowerPrompt.includes('switch to')) &&
      (lowerPrompt.includes('claude') ||
        lowerPrompt.includes('gpt') ||
        lowerPrompt.includes('gemini') ||
        lowerPrompt.includes('perplexity'))
    ) {
      return true;
    }

    // Switch if current model has been failing
    const recentFailures = this.countRecentFailures(history);
    if (recentFailures > 2) {
      return true;
    }

    // Don't switch for short, conversational prompts
    if (
      analysis.complexity === 'simple' &&
      analysis.domains.includes('conversational')
    ) {
      return false;
    }

    // Default: maintain consistency
    return false;
  }

  /**
   * Count recent failures in conversation
   */
  private countRecentFailures(history: Message[]): number {
    // This would typically check for error responses or failed generations
    // For now, simplified implementation
    return 0;
  }

  /**
   * Detect significant context change
   */
  private hasContextChanged(newPrompt: string, history: Message[]): boolean {
    // Check if new prompt is from a completely different domain
    // than conversation history
    if (history.length < 2) return false;

    // Get domain keywords from history
    const historicalDomains = this.extractDomains(history);
    const newDomains = this.extractDomainsFromPrompt(newPrompt);

    // Check for significant domain shift
    const overlap = historicalDomains.filter(d =>
      newDomains.includes(d)
    ).length;
    const totalUnique = new Set([...historicalDomains, ...newDomains]).size;

    // If less than 50% overlap, context has changed
    return overlap / totalUnique < 0.5;
  }

  /**
   * Extract domains from conversation history
   */
  private extractDomains(history: Message[]): string[] {
    const allText = history
      .map(m => m.content)
      .join(' ')
      .toLowerCase();
    const domains: string[] = [];

    if (
      allText.includes('code') ||
      allText.includes('function') ||
      allText.includes('debug')
    ) {
      domains.push('code');
    }

    if (
      allText.includes('analyze') ||
      allText.includes('explain') ||
      allText.includes('why')
    ) {
      domains.push('analysis');
    }

    if (
      allText.includes('write') ||
      allText.includes('story') ||
      allText.includes('creative')
    ) {
      domains.push('creative');
    }

    return domains;
  }

  /**
   * Extract domains from a single prompt
   */
  private extractDomainsFromPrompt(prompt: string): string[] {
    const lowerPrompt = prompt.toLowerCase();
    const domains: string[] = [];

    if (
      lowerPrompt.includes('code') ||
      lowerPrompt.includes('function') ||
      lowerPrompt.includes('debug')
    ) {
      domains.push('code');
    }

    if (
      lowerPrompt.includes('analyze') ||
      lowerPrompt.includes('explain') ||
      lowerPrompt.includes('why')
    ) {
      domains.push('analysis');
    }

    if (
      lowerPrompt.includes('write') ||
      lowerPrompt.includes('story') ||
      lowerPrompt.includes('creative')
    ) {
      domains.push('creative');
    }

    return domains;
  }

  /**
   * Get optimal model for conversation context
   */
  getOptimalModelForContext(
    history: Message[],
    analysis: PromptAnalysis
  ): string {
    // Analyze conversation characteristics
    const totalTokens = history.reduce(
      (sum, msg) => sum + msg.content.length / 4,
      0
    );

    // If conversation is very long, prefer models with large context windows
    if (totalTokens > 50000) {
      return 'gemini-1.5-pro';
    }

    // If conversation involves code, prefer Claude models
    const hasCode = history.some(msg =>
      msg.content.toLowerCase().includes('code')
    );
    if (hasCode && analysis.domains.includes('code')) {
      return 'claude-3-sonnet-20240229';
    }

    // Default to balanced model
    return 'claude-3-sonnet-20240229';
  }
}
