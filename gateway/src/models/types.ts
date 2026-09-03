export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelExecutionRequest {
  request_id: string;
  correlation_id: string;
  model_id: string;
  messages: ModelMessage[];
  operation: string;
  /** Policy-approved eligible set — gateway must not expand beyond this. */
  eligible_models: string[];
}

export interface ModelExecutionResult {
  model_id: string;
  provider: string;
  message: ModelMessage;
  usage: { input_tokens: number; output_tokens: number };
}

export type ProviderKind = 'local' | 'private' | 'cloud';

/**
 * Model Gateway executes ONLY already policy-approved requests.
 * It must never make authorization / policy decisions.
 */
export interface ModelProvider {
  readonly providerId: string;
  readonly kind: ProviderKind;
  supports(modelId: string): boolean;
  execute(req: ModelExecutionRequest): Promise<ModelExecutionResult>;
}

export interface RegisteredModel {
  model_id: string;
  provider_id: string;
  name: string;
  kind: ProviderKind;
  status: 'active' | 'disabled';
}

export interface ModelRegistry {
  listActive(): RegisteredModel[];
  get(modelId: string): RegisteredModel | null;
  listActiveModelIds(): string[];
}

export interface ModelGateway {
  /** Models visible to PolicyEngine as "available". */
  listAvailableModels(): string[];
  /**
   * Execute a model that Policy already approved.
   * `req.model_id` must be ∈ req.eligible_models and present in the registry.
   */
  executeApproved(req: ModelExecutionRequest): Promise<ModelExecutionResult>;
}

/** Runtime abstraction for on-appliance inference (Ollama, llama.cpp, vLLM, …). */
export interface LocalModelRuntime {
  readonly runtimeId: string;
  isAvailable(): Promise<boolean>;
  generate(input: {
    model: string;
    messages: ModelMessage[];
    request_id: string;
  }): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }>;
}
