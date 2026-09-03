/**
 * Prompt Analyzer Service
 * Analyzes user prompts to determine complexity, domains, required capabilities, and other characteristics
 * to inform intelligent model routing decisions
 */

import {
  PromptAnalysis,
  PromptComplexity,
  PromptDomain,
} from '../types/routing.types';

export class PromptAnalyzerService {
  /**
   * Analyze a prompt and determine its characteristics
   */
  async analyzePrompt(
    prompt: string,
    attachments?: File[]
  ): Promise<PromptAnalysis> {
    // Basic metrics
    const promptLength = prompt.length;
    const hasAttachments = attachments && attachments.length > 0;

    // Estimate tokens (rough: 1 token ≈ 4 characters)
    const estimatedInputTokens = this.countTokens(prompt);

    // Estimate output tokens based on complexity
    const estimatedOutputTokens = this.estimateOutputTokens(prompt);

    // Detect domains
    const domains = this.detectDomains(prompt);

    // Assess complexity
    const complexity = this.detectComplexity(prompt);

    // Required capabilities
    const requiredCapabilities = this.detectRequiredCapabilities(
      prompt,
      domains
    );

    // Feature requirements
    const requiresInternet = this.detectSearchIntent(prompt);
    const requiresVision =
      hasAttachments && this.hasImageAttachments(attachments);
    const requiresCodeExecution = this.detectCodeExecutionIntent(prompt);

    // Determine sensitivity
    const latencySensitivity = this.assessLatencySensitivity(
      prompt,
      complexity
    );
    const accuracyRequirement = this.assessAccuracyRequirement(
      prompt,
      complexity
    );

    // Extract keywords
    const keywords = this.extractKeywords(prompt);

    return {
      estimatedInputTokens,
      estimatedOutputTokens,
      complexity,
      domains,
      requiredCapabilities,
      requiresInternet,
      requiresVision,
      requiresCodeExecution,
      latencySensitivity,
      accuracyRequirement,
      metadata: {
        promptLength,
        hasAttachments: !!hasAttachments,
        attachmentTypes: hasAttachments
          ? attachments.map(f => f.type)
          : undefined,
        keywords,
      },
    };
  }

  /**
   * Rough token counting (1 token ≈ 4 characters)
   */
  private countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate output tokens based on prompt characteristics
   */
  private estimateOutputTokens(prompt: string): number {
    const tokens = this.countTokens(prompt);

    // Different prompts have different output ratios
    if (this.isQuestion(prompt)) {
      // Questions typically generate shorter answers
      return Math.min(tokens * 2, 2000);
    }

    if (this.isCreativePrompt(prompt)) {
      // Creative prompts generate longer outputs
      return tokens * 8;
    }

    if (this.isCodeGeneration(prompt)) {
      // Code generation varies widely
      return tokens * 6;
    }

    // Default ratio
    return tokens * 4;
  }

  /**
   * Detect domains from prompt content
   */
  private detectDomains(prompt: string): PromptDomain[] {
    const domains: PromptDomain[] = [];
    const lowerPrompt = prompt.toLowerCase();

    // Code domain
    const codeKeywords = [
      'code',
      'function',
      'class',
      'variable',
      'debug',
      'implement',
      'algorithm',
      'api',
      'database',
      'sql',
      'javascript',
      'python',
      'typescript',
      'react',
      'node',
      'html',
      'css',
      'json',
      'array',
      'object',
      'async',
      'await',
      'promise',
      'export',
      'import',
      'module',
    ];

    if (codeKeywords.some(keyword => lowerPrompt.includes(keyword))) {
      domains.push('code');
    }

    // Creative domain
    const creativeKeywords = [
      'story',
      'poem',
      'song',
      'article',
      'blog',
      'write',
      'creative',
      'imagine',
      'describe',
      'narrative',
      'character',
      'plot',
      'fiction',
      'sci-fi',
      'fantasy',
    ];

    if (creativeKeywords.some(keyword => lowerPrompt.includes(keyword))) {
      domains.push('creative');
    }

    // Analysis domain
    const analysisKeywords = [
      'analyze',
      'analysis',
      'compare',
      'evaluate',
      'assess',
      'review',
      'examine',
      'investigate',
      'critique',
      'explain',
      'why',
      'how does',
      'what are the',
    ];

    if (analysisKeywords.some(keyword => lowerPrompt.includes(keyword))) {
      domains.push('analysis');
      domains.push('reasoning');
    }

    // Search domain
    if (this.detectSearchIntent(prompt)) {
      domains.push('search');
    }

    // Vision domain
    if (
      lowerPrompt.includes('image') ||
      lowerPrompt.includes('photo') ||
      lowerPrompt.includes('picture') ||
      lowerPrompt.includes('what is in this') ||
      lowerPrompt.includes('describe this image') ||
      lowerPrompt.includes('analyze this')
    ) {
      domains.push('vision');
    }

    // Conversational domain
    const conversationalKeywords = [
      'hi',
      'hello',
      'how are you',
      'tell me about',
      'chat',
      'conversation',
      'discuss',
    ];

    if (
      conversationalKeywords.some(keyword => lowerPrompt.includes(keyword)) &&
      prompt.length < 500
    ) {
      domains.push('conversational');
    }

    // If no domains detected, default to general
    if (domains.length === 0) {
      domains.push('general');
    }

    return domains;
  }

  /**
   * Detect complexity level
   */
  private detectComplexity(prompt: string): PromptComplexity {
    const tokens = this.countTokens(prompt);
    const sentences = prompt.split(/[.!?]+/).length;
    const avgSentenceLength = tokens / sentences;

    // Very short prompts are simple
    if (tokens < 50 && sentences === 1) {
      return 'simple';
    }

    // Long prompts with complex structure
    if (tokens > 2000) {
      return 'expert';
    }

    // Check for complex indicators
    const complexityIndicators = [
      'multi-step',
      'first, then',
      'step by step',
      'comprehensive',
      'detailed',
      'complete',
      'full',
      'complex',
      'advanced',
      'optimize',
      'architecture',
      'architectural',
      'design pattern',
      'system design',
      'migration',
      'roadmap',
      'strategy',
      'evaluation',
      'analysis',
      'breakdown',
      'assessment',
      'recommendation',
      'implementation',
      'security considerations',
      'monitoring and observability',
      'cost-benefit',
      'pros and cons',
    ];

    const hasComplexityIndicators = complexityIndicators.some(indicator =>
      prompt.toLowerCase().includes(indicator)
    );

    if (hasComplexityIndicators && tokens > 200) {
      return 'complex';
    }

    if (hasComplexityIndicators || avgSentenceLength > 40) {
      return 'complex';
    }

    // Medium complexity
    if (tokens > 200 || avgSentenceLength > 30) {
      return 'moderate';
    }

    return 'simple';
  }

  /**
   * Detect required capabilities based on domains and prompt
   */
  private detectRequiredCapabilities(
    prompt: string,
    domains: PromptDomain[]
  ): Array<keyof import('../types/routing.types').CapabilityRatings> {
    const capabilities: Array<
      keyof import('../types/routing.types').CapabilityRatings
    > = [];

    // Code capability
    if (domains.includes('code')) {
      capabilities.push('code');
    }

    // Reasoning capability
    if (
      domains.includes('analysis') ||
      domains.includes('reasoning') ||
      prompt.toLowerCase().includes('why') ||
      prompt.toLowerCase().includes('explain') ||
      prompt.toLowerCase().includes('analyze')
    ) {
      capabilities.push('reasoning');
      capabilities.push('multistep');
    }

    // Creative capability
    if (domains.includes('creative')) {
      capabilities.push('creative');
    }

    // Conversational capability
    if (domains.includes('conversational')) {
      capabilities.push('conversational');
    }

    // Vision capability
    if (domains.includes('vision')) {
      capabilities.push('vision');
    }

    // Factual capability
    if (domains.includes('search')) {
      capabilities.push('factual');
    }

    // Mathematics capability
    const mathKeywords = [
      'calculate',
      'solve',
      'equation',
      'formula',
      'math',
      'algebra',
      'geometry',
      'statistics',
      'probability',
      'derivative',
      'integral',
    ];

    if (mathKeywords.some(keyword => prompt.toLowerCase().includes(keyword))) {
      capabilities.push('mathematics');
    }

    return Array.from(new Set(capabilities)); // Remove duplicates
  }

  /**
   * Detect if prompt requires internet/search capability
   */
  detectSearchIntent(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();

    const searchKeywords = [
      'latest',
      'current',
      'recent',
      'today',
      'yesterday',
      'this week',
      'this month',
      'news',
      'search',
      'find',
      'look up',
      'what happened',
      'breaking',
      'trending',
      'real-time',
      'live',
      'as of',
      'update on',
      'status of',
    ];

    return searchKeywords.some(keyword => lowerPrompt.includes(keyword));
  }

  /**
   * Detect if prompt requires vision capability
   */
  private hasImageAttachments(attachments: File[]): boolean {
    return attachments.some(
      file =>
        file.type.startsWith('image/') ||
        file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    );
  }

  /**
   * Detect if prompt requires code execution
   */
  private detectCodeExecutionIntent(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();

    const executionKeywords = [
      'run',
      'execute',
      'test',
      'debug',
      'fix error',
      'error message',
      'stack trace',
      'console output',
    ];

    return executionKeywords.some(keyword => lowerPrompt.includes(keyword));
  }

  /**
   * Assess latency sensitivity
   */
  private assessLatencySensitivity(
    prompt: string,
    complexity: PromptComplexity
  ): 'low' | 'medium' | 'high' {
    const lowerPrompt = prompt.toLowerCase();

    // High sensitivity indicators
    const highSensitivityKeywords = [
      'real-time',
      'urgent',
      'immediately',
      'quick',
      'fast',
      'asap',
      'conversation',
      'chat',
    ];

    if (
      highSensitivityKeywords.some(keyword => lowerPrompt.includes(keyword))
    ) {
      return 'high';
    }

    // Low sensitivity indicators
    const lowSensitivityKeywords = [
      'think carefully',
      'thorough',
      'detailed',
      'comprehensive',
      'no rush',
    ];

    if (lowSensitivityKeywords.some(keyword => lowerPrompt.includes(keyword))) {
      return 'low';
    }

    // Complex tasks are less latency-sensitive
    if (complexity === 'expert' || complexity === 'complex') {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Assess accuracy requirements
   */
  private assessAccuracyRequirement(
    prompt: string,
    complexity: PromptComplexity
  ): 'low' | 'medium' | 'high' {
    const lowerPrompt = prompt.toLowerCase();

    // High accuracy indicators
    const highAccuracyKeywords = [
      'accurate',
      'precise',
      'exact',
      'correct',
      'professional',
      'production',
      'critical',
      'important',
      'verify',
      'factual',
    ];

    if (highAccuracyKeywords.some(keyword => lowerPrompt.includes(keyword))) {
      return 'high';
    }

    // Low accuracy indicators
    const lowAccuracyKeywords = [
      'rough',
      'approximate',
      'estimate',
      'draft',
      'quick',
      'brainstorm',
    ];

    if (lowAccuracyKeywords.some(keyword => lowerPrompt.includes(keyword))) {
      return 'low';
    }

    // Complex tasks require high accuracy
    if (complexity === 'expert' || complexity === 'complex') {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Extract keywords from prompt
   */
  private extractKeywords(prompt: string): string[] {
    const words = prompt
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Remove common stop words
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'this',
      'that',
      'these',
      'those',
      'is',
      'are',
      'was',
      'were',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
    ]);

    const keywords = words.filter(word => !stopWords.has(word));

    // Return top 10 most frequent keywords
    const frequency = new Map<string, number>();
    keywords.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Check if prompt is a question
   */
  private isQuestion(prompt: string): boolean {
    return (
      prompt.trim().endsWith('?') ||
      /^(how|what|why|when|where|who|which|can|could|should|will|would)\b/i.test(
        prompt.trim()
      )
    );
  }

  /**
   * Check if prompt is creative
   */
  private isCreativePrompt(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    const creativeIndicators = [
      'write',
      'story',
      'poem',
      'creative',
      'imagine',
      'narrative',
      'character',
      'plot',
    ];
    return creativeIndicators.some(indicator =>
      lowerPrompt.includes(indicator)
    );
  }

  /**
   * Check if prompt is code generation
   */
  private isCodeGeneration(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    const codeIndicators = [
      'implement',
      'create a function',
      'write code',
      'generate code',
      'build a',
      'make a function',
    ];
    return codeIndicators.some(indicator => lowerPrompt.includes(indicator));
  }
}

// Singleton instance
export const promptAnalyzer = new PromptAnalyzerService();
