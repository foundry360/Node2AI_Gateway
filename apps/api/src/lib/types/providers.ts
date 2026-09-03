// Re-export chat types from api.ts to avoid duplication
export type { ChatRequest, ChatResponse, ChatOptions, Message } from './api';

export interface ChatChunk {
  id?: string;
  object?: string;
  created?: number;
  choices?: Array<any>;
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  cost: number;
}

export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  retries?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  inputCost: number;
  outputCost: number;
  capabilities: string[];
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
}
