/**
 * Type definitions for the AI Model Routing System
 * Provides interfaces for prompt analysis, model capabilities, user preferences, and routing decisions
 */

/**
 * Complexity levels for prompt analysis
 */
export type PromptComplexity = 'simple' | 'moderate' | 'complex' | 'expert';

/**
 * Domain categories for prompts
 */
export type PromptDomain =
  | 'code'
  | 'creative'
  | 'analysis'
  | 'search'
  | 'reasoning'
  | 'general'
  | 'vision'
  | 'conversational';

/**
 * Priority preferences for routing
 */
export type PriorityPreference = 'cost' | 'speed' | 'quality' | 'balanced';

/**
 * Routing algorithm types
 */
export type RoutingAlgorithm =
  | 'rule-based'
  | 'score-based'
  | 'context-aware'
  | 'budget-constrained'
  | 'manual';

/**
 * Model capability ratings (1-10 scale)
 */
export interface CapabilityRatings {
  /** Code generation and debugging capabilities */
  code: number;
  /** Complex reasoning and logical problem solving */
  reasoning: number;
  /** Creative writing and content generation */
  creative: number;
  /** Factual knowledge and information retrieval */
  factual: number;
  /** Vision/image analysis capabilities */
  vision: number;
  /** Conversation context understanding */
  conversational: number;
  /** Mathematical computation */
  mathematics: number;
  /** Multi-turn reasoning */
  multistep: number;
}

/**
 * Model pricing structure
 */
export interface ModelPricing {
  /** Cost per million input tokens (USD) */
  inputCostPerMillion: number;
  /** Cost per million output tokens (USD) */
  outputCostPerMillion: number;
  /** Minimum cost per request (USD) */
  minimumCost?: number;
}

/**
 * Model performance characteristics
 */
export interface ModelPerformance {
  /** Average latency in milliseconds */
  averageLatency: number;
  /** Quality score (1-10) */
  qualityScore: number;
  /** Reliability score (1-10) */
  reliabilityScore: number;
  /** Context window in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
}

/**
 * Complete model capability profile
 */
export interface ModelCapabilities {
  /** Unique model identifier */
  modelId: string;
  /** Human-readable model name */
  displayName: string;
  /** Provider name (anthropic, openai, google, perplexity) */
  provider: string;
  /** Current availability status */
  available: boolean;
  /** Pricing information */
  pricing: ModelPricing;
  /** Performance metrics */
  performance: ModelPerformance;
  /** Capability ratings */
  capabilities: CapabilityRatings;
  /** Special features (vision, internet, streaming, etc.) */
  features: string[];
  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Prompt analysis results
 */
export interface PromptAnalysis {
  /** Estimated number of input tokens */
  estimatedInputTokens: number;
  /** Estimated number of output tokens */
  estimatedOutputTokens: number;
  /** Overall complexity assessment */
  complexity: PromptComplexity;
  /** Detected domain categories */
  domains: PromptDomain[];
  /** Required capabilities */
  requiredCapabilities: (keyof CapabilityRatings)[];
  /** Whether internet/search access is needed */
  requiresInternet: boolean;
  /** Whether vision/image analysis is needed */
  requiresVision: boolean;
  /** Whether code execution is needed */
  requiresCodeExecution: boolean;
  /** Latency sensitivity (low/medium/high) */
  latencySensitivity: 'low' | 'medium' | 'high';
  /** Accuracy requirements (low/medium/high) */
  accuracyRequirement: 'low' | 'medium' | 'high';
  /** Additional metadata */
  metadata: {
    promptLength: number;
    hasAttachments: boolean;
    attachmentTypes?: string[];
    keywords?: string[];
  };
}

/**
 * User routing preferences
 */
export interface UserPreferences {
  /** Priority preference */
  prioritize: PriorityPreference;
  /** Preferred model (optional) */
  preferredModel?: string;
  /** Provider to avoid (optional) */
  avoidProvider?: string;
  /** Models to avoid */
  avoidModels?: string[];
  /** Maximum cost per request (USD) */
  maxCostPerRequest?: number;
  /** Maximum acceptable latency (ms) */
  maxLatency?: number;
  /** Enable auto-routing */
  enableAutoRouting: boolean;
  /** Enable fallback routing */
  enableFallback: boolean;
}

/**
 * Customer/organization settings
 */
export interface CustomerSettings {
  /** Allowed models */
  allowedModels: string[];
  /** Daily budget limit (USD) */
  dailyBudget?: number;
  /** Weekly budget limit (USD) */
  weeklyBudget?: number;
  /** Monthly budget limit (USD) */
  monthlyBudget?: number;
  /** Features enabled */
  enabledFeatures: string[];
  /** Custom routing rules */
  customRules?: CustomRoutingRule[];
}

/**
 * Custom routing rule for customer-specific logic
 */
export interface CustomRoutingRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Condition to trigger this rule */
  condition: (analysis: PromptAnalysis) => boolean;
  /** Model to select when condition matches */
  model: string;
  /** Rule priority (higher = checked first) */
  priority: number;
}

/**
 * Token usage estimation
 */
export interface TokenEstimate {
  /** Input tokens */
  input: number;
  /** Output tokens */
  output: number;
  /** Total tokens */
  total: number;
  /** Estimation confidence (0-1) */
  confidence: number;
}

/**
 * Cost estimation
 */
export interface CostEstimate {
  /** Estimated cost in USD */
  cost: number;
  /** Confidence level (0-1) */
  confidence: number;
  /** Breakdown by cost components */
  breakdown: {
    inputCost: number;
    outputCost: number;
    minimumCost?: number;
  };
}

/**
 * Routing decision result
 */
export interface RoutingDecision {
  /** Selected model ID */
  model: string;
  /** Model provider */
  provider: string;
  /** Fallback models (in order) */
  fallbacks: string[];
  /** Reasoning for selection */
  reasoning: string;
  /** Routing algorithm used */
  algorithm: RoutingAlgorithm;
  /** Prompt analysis results */
  analysis: PromptAnalysis;
  /** Token estimation */
  tokenEstimate: TokenEstimate;
  /** Cost estimation */
  costEstimate: CostEstimate;
  /** Alternative models considered */
  alternatives: ModelAlternative[];
}

/**
 * Alternative model option
 */
export interface ModelAlternative {
  /** Model ID */
  model: string;
  /** Score/reason this model was considered */
  score: number;
  /** Why it was/wasn't selected */
  reason: string;
}

/**
 * Routing metrics for analytics
 */
export interface RoutingMetrics {
  /** Total requests routed */
  totalRequests: number;
  /** Successful routes */
  successfulRoutes: number;
  /** Fallback usage count */
  fallbackUsed: number;
  /** Average routing time (ms) */
  averageRoutingTime: number;
  /** Model distribution */
  modelDistribution: { model: string; count: number; percentage: number }[];
  /** Cost metrics */
  costMetrics: {
    estimatedTotal: number;
    actualTotal: number;
    averagePerRequest: number;
    savings: number;
  };
  /** Performance metrics */
  performanceMetrics: {
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
}

/**
 * Budget tracking information
 */
export interface BudgetTracker {
  /** Daily spend */
  dailySpend: number;
  /** Daily limit */
  dailyLimit?: number;
  /** Weekly spend */
  weeklySpend: number;
  /** Weekly limit */
  weeklyLimit?: number;
  /** Monthly spend */
  monthlySpend: number;
  /** Monthly limit */
  monthlyLimit?: number;
  /** Remaining daily budget */
  dailyRemaining?: number;
  /** Remaining weekly budget */
  weeklyRemaining?: number;
  /** Remaining monthly budget */
  monthlyRemaining?: number;
  /** Budget status */
  status: 'healthy' | 'warning' | 'critical' | 'exceeded';
}

/**
 * Model usage statistics
 */
export interface ModelUsageStats {
  /** Model identifier */
  model: string;
  /** Provider name */
  provider: string;
  /** Total requests */
  requestCount: number;
  /** Percentage of total requests */
  percentage: number;
  /** Total cost */
  totalCost: number;
  /** Average cost per request */
  averageCost: number;
  /** Average latency */
  averageLatency: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Fallback usage count */
  fallbackCount: number;
}

/**
 * Time range for analytics
 */
export interface DateRange {
  /** Start date */
  start: Date;
  /** End date */
  end: Date;
}

/**
 * Performance metrics by model
 */
export interface PerformanceMetrics {
  /** Model identifier */
  model: string;
  /** Average latency (ms) */
  averageLatency: number;
  /** P50 latency (ms) */
  p50Latency: number;
  /** P95 latency (ms) */
  p95Latency: number;
  /** P99 latency (ms) */
  p99Latency: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average tokens per request */
  averageTokens: number;
  /** Average cost per request */
  averageCost: number;
}

/**
 * Cost analysis results
 */
export interface CostAnalysis {
  /** Total spend in period */
  totalSpend: number;
  /** Average spend per request */
  averagePerRequest: number;
  /** Cost by model */
  costByModel: { model: string; cost: number; percentage: number }[];
  /** Cost by provider */
  costByProvider: { provider: string; cost: number; percentage: number }[];
  /** Daily cost trends */
  dailyTrends: { date: string; cost: number }[];
  /** Potential savings with optimization */
  optimizationSavings?: number;
}

/**
 * Routing accuracy metrics
 */
export interface RoutingAccuracyMetrics {
  /** Total routing decisions */
  totalDecisions: number;
  /** Decisions with fallback needed */
  fallbackRate: number;
  /** User overrides */
  overrideRate: number;
  /** Model rejection rate */
  rejectionRate: number;
  /** Accuracy score (0-1) */
  accuracyScore: number;
}

/**
 * User satisfaction metrics
 */
export interface SatisfactionMetrics {
  /** Average user rating (1-5) */
  averageRating: number;
  /** Rating distribution */
  ratingDistribution: { rating: number; count: number }[];
  /** Satisfaction by model */
  byModel: { model: string; averageRating: number; responseCount: number }[];
  /** Satisfaction by algorithm */
  byAlgorithm: {
    algorithm: RoutingAlgorithm;
    averageRating: number;
    responseCount: number;
  }[];
}
