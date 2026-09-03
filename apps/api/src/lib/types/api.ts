/**
 * API-specific TypeScript types for Node2AI
 * Defines request/response interfaces for all API endpoints
 */

// Chat API types
export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  user?: string;
  provider?: string;
  cost_optimization?: boolean;
  quality_threshold?: number;
  sanitize_input?: boolean;
  sanitize_output?: boolean;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  max_tokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  timeout?: number; // Request timeout in milliseconds
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider?: string;
  cost?: number;
  processing_time?: number;
  sanitized?: boolean;
}

export interface Message {
  role?: 'system' | 'user' | 'assistant';
  content?: string;
}

// Comparison API types
export interface CompareRequest {
  prompt: string;
  models: string[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  include_metrics?: boolean;
  include_costs?: boolean;
  include_quality_scores?: boolean;
  sanitize_input?: boolean;
  sanitize_output?: boolean;
}

export interface CompareResponse {
  id: string;
  object: string;
  created: number;
  prompt: string;
  models: string[];
  results: Array<{
    model: string;
    provider?: string;
    content?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    metrics?: {
      processing_time: number;
      tokens_per_second: number;
      latency: number;
    };
    costs?: {
      input_cost: number;
      output_cost: number;
      total_cost: number;
    };
    quality_scores?: {
      relevance: number;
      coherence: number;
      fluency: number;
      overall: number;
    };
    processing_time: number;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total_models: number;
    successful_comparisons: number;
    average_processing_time: number;
    total_cost: number;
    best_model: string | null;
    performance_ranking: string[];
  };
  sanitized?: boolean;
}

// Smart routing API types
export interface SmartRequest {
  messages: Message[];
  cost_constraint?: {
    max_cost?: number;
    cost_per_token_limit?: number;
    budget_remaining?: number;
  };
  quality_requirements?: {
    min_quality_score?: number;
    quality_priority?: 'speed' | 'quality' | 'cost';
    use_fallback?: boolean;
  };
  latency_requirements?: {
    max_latency_ms?: number;
    priority?: 'speed' | 'quality' | 'cost';
  };
  preferred_providers?: string[];
  excluded_providers?: string[];
  preferred_models?: string[];
  excluded_models?: string[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  learning_mode?: boolean;
  context_awareness?: boolean;
  sanitize_input?: boolean;
  sanitize_output?: boolean;
}

export interface SmartResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  provider: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  reasoning: {
    selected_provider: string;
    selected_model: string;
    selection_criteria: string[];
    alternatives: Array<{
      provider: string;
      model: string;
      score: number;
      reason: string;
    }>;
  };
  alternatives: Array<{
    provider: string;
    model: string;
    score: number;
    reason: string;
  }>;
  cost: number;
  processing_time: number;
  quality_score?: number;
  sanitized?: boolean;
  learning_data?: {
    user_satisfaction?: number;
    performance_metrics: {
      latency: number;
      cost_efficiency: number;
      quality_achieved: number;
    };
  };
}

// Knowledge base API types
export interface IngestRequest {
  files: Array<{
    name: string;
    content: string;
    type: 'text' | 'pdf' | 'docx' | 'html' | 'markdown' | 'json';
    size: number;
    encoding?: string;
  }>;
  chunk_size?: number;
  chunk_overlap?: number;
  embedding_model?: string;
  collection: string;
  tags?: string[];
  metadata?: Record<string, any>;
  extract_entities?: boolean;
  extract_keywords?: boolean;
  generate_summary?: boolean;
  sanitize_content?: boolean;
  preserve_structure?: boolean;
}

export interface IngestResponse {
  id: string;
  object: string;
  created: number;
  collection: string;
  results: Array<{
    file_name: string;
    file_type: string;
    document_id: string | null;
    chunks_created: number;
    entities_found: number;
    keywords_found: number;
    summary_generated: boolean;
    processing_time: number;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total_files: number;
    successful_files: number;
    failed_files: number;
    total_chunks: number;
    total_entities: number;
    total_keywords: number;
    summaries_generated: number;
  };
  sanitized?: boolean;
}

export interface SearchRequest {
  query: string;
  collection?: string;
  limit?: number;
  threshold?: number;
  tags?: string[];
  date_range?: {
    start?: string;
    end?: string;
  };
  metadata_filters?: Record<string, any>;
  ranking_strategy?: 'relevance' | 'recency' | 'popularity' | 'hybrid';
  boost_recent?: boolean;
  boost_popular?: boolean;
  include_context?: boolean;
  context_window?: number;
  include_metadata?: boolean;
  include_highlights?: boolean;
  use_reranking?: boolean;
  reranking_model?: string;
  expand_query?: boolean;
  sanitize_query?: boolean;
  sanitize_results?: boolean;
}

export interface SearchResponse {
  id: string;
  object: string;
  created: number;
  query: string;
  results: Array<{
    id: string;
    title: string;
    content: string;
    context?: string;
    highlights?: string[];
    score: number;
    metadata?: Record<string, any>;
    tags: string[];
    created_at: string;
    updated_at: string;
    collection: string;
  }>;
  stats: {
    total_results: number;
    returned_results: number;
    average_score: number;
    search_time: number;
    reranked: boolean;
    expanded_query: boolean;
  };
  sanitized?: boolean;
}

// Authentication API types
export interface LoginRequest {
  email: string;
  password: string;
  sso_provider?: 'google' | 'microsoft' | 'okta' | 'auth0';
  sso_token?: string;
  remember_me?: boolean;
  mfa_code?: string;
  device_info?: {
    user_agent?: string;
    ip_address?: string;
    device_id?: string;
  };
}

export interface LoginResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    permissions: Array<{
      resource: string;
      actions: string[];
    }>;
    tenant_id?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    last_login_at: string;
  };
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
  session: {
    id: string;
    expires_at: string;
    device_id?: string;
  };
}

// Usage API types
export interface UsageSummaryRequest {
  period: {
    start: string;
    end: string;
  };
  group_by?: 'day' | 'week' | 'month';
  filters?: {
    user_id?: string;
    model?: string;
    provider?: string;
  };
}

export interface UsageSummaryResponse {
  period: {
    start: string;
    end: string;
  };
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  average_latency: number;
  error_rate: number;
  breakdown: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
    latency: number;
    errors: number;
  }>;
  top_models: Array<{
    model: string;
    requests: number;
    cost: number;
    percentage: number;
  }>;
  top_users: Array<{
    user_id: string;
    requests: number;
    cost: number;
    percentage: number;
  }>;
}

export interface CostBreakdownRequest {
  period: {
    start: string;
    end: string;
  };
  group_by?: 'provider' | 'model' | 'user';
  filters?: {
    user_id?: string;
    model?: string;
    provider?: string;
  };
}

export interface CostBreakdownResponse {
  period: {
    start: string;
    end: string;
  };
  total_cost: number;
  breakdown: Array<{
    category: string;
    cost: number;
    percentage: number;
    details: Array<{
      name: string;
      cost: number;
      percentage: number;
    }>;
  }>;
}

// Integration API types
export interface IntegrationConfigureRequest {
  type: string;
  name: string;
  config: Record<string, any>;
}

export interface IntegrationConfigureResponse {
  id: string;
  type: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  last_sync?: string;
  error?: string;
}

export interface IntegrationTestRequest {
  integration_id: string;
  test_data?: any;
}

export interface IntegrationTestResponse {
  success: boolean;
  latency: number;
  error?: string;
  details?: Record<string, any>;
}

// Admin API types
export interface LicenseValidateRequest {
  license_key: string;
}

export interface LicenseValidateResponse {
  valid: boolean;
  tier: 'standard' | 'professional' | 'enterprise';
  expires_at: string;
  features: string[];
  max_instances: number;
  usage: {
    current_instances: number;
    requests_this_month: number;
    requests_limit: number;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration?: number;
  }>;
  last_checked: string;
  version: string;
  uptime: number;
}

export interface MetricsResponse {
  timestamp: string;
  metrics: {
    requests_total: number;
    requests_per_second: number;
    average_latency: number;
    error_rate: number;
    active_connections: number;
    memory_usage: number;
    cpu_usage: number;
  };
  providers: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    requests: number;
    errors: number;
  }>;
}
