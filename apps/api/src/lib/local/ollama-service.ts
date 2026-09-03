import { Message, ChatResponse, ChatOptions } from '../types/providers';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaPullRequest {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  format?: string;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    stop?: string[];
    num_predict?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaService {
  private baseUrl: string;
  private defaultModels: string[] = [
    'llama3.1:8b',
    'llama3.1:70b',
    'mistral:7b',
    'mixtral:8x7b',
    'codellama:7b',
    'codellama:13b',
    'codellama:34b',
    'gemma2:9b',
    'gemma2:27b',
  ];

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<OllamaPullRequest> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to pull model ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Generate text using Ollama
   */
  async generate(
    request: OllamaGenerateRequest
  ): Promise<OllamaGenerateResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Ollama generation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Ollama generation error:', error);
      throw error;
    }
  }

  /**
   * Chat with Ollama model
   */
  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    const { model, temperature = 0.7, max_tokens, stream = false } = options;

    // Convert messages to prompt format
    const prompt = this.formatMessagesAsPrompt(messages);

    try {
      const response = await this.generate({
        model,
        prompt,
        stream: false,
        options: {
          temperature,
          num_predict: max_tokens,
          stop: ['</s>', '[INST]', '[/INST]'],
        },
      });

      // Calculate token usage (rough estimation)
      const promptTokens = this.estimateTokens(prompt);
      const completionTokens = this.estimateTokens(response.response);
      const totalTokens = promptTokens + completionTokens;

      // Calculate cost (free for local models)
      const cost = 0;

      return {
        id: `ollama-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: response.response,
            },
            finish_reason: response.done ? 'stop' : 'length',
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        },
        cost,
      };
    } catch (error: any) {
      console.error('Ollama chat error:', error);
      throw new Error(`Ollama chat failed: ${error.message}`);
    }
  }

  /**
   * Stream chat with Ollama model
   */
  async *streamChat(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<any> {
    const { model, temperature = 0.7, max_tokens } = options;
    const prompt = this.formatMessagesAsPrompt(messages);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          options: {
            temperature,
            num_predict: max_tokens,
            stop: ['</s>', '[INST]', '[/INST]'],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama stream failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              yield {
                id: `ollama-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: data.response || '',
                    },
                    finish_reason: data.done ? 'stop' : null,
                  },
                ],
              };
            } catch (parseError) {
              // Skip invalid JSON lines
              continue;
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Ollama stream error:', error);
      throw new Error(`Ollama stream failed: ${error.message}`);
    }
  }

  /**
   * Format messages as a single prompt
   */
  private formatMessagesAsPrompt(messages: Message[]): string {
    // Simple prompt formatting - in production, you'd want more sophisticated formatting
    return (
      messages
        .map(msg => {
          if (msg.role === 'system') {
            return `System: ${msg.content}`;
          } else if (msg.role === 'user') {
            return `Human: ${msg.content}`;
          } else if (msg.role === 'assistant') {
            return `Assistant: ${msg.content}`;
          }
          return msg.content;
        })
        .join('\n\n') + '\n\nAssistant:'
    );
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get model information
   */
  async getModelInfo(modelName: string): Promise<OllamaModel | null> {
    try {
      const models = await this.listModels();
      return models.find(model => model.name === modelName) || null;
    } catch (error) {
      console.error(`Failed to get model info for ${modelName}:`, error);
      return null;
    }
  }

  /**
   * Check if Ollama is running
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get recommended models for different use cases
   */
  getRecommendedModels(): Record<string, string[]> {
    return {
      general: ['llama3.1:8b', 'mistral:7b'],
      coding: ['codellama:7b', 'codellama:13b'],
      'high-quality': ['llama3.1:70b', 'mixtral:8x7b'],
      fast: ['llama3.1:8b', 'mistral:7b'],
      balanced: ['llama3.1:8b', 'mixtral:8x7b'],
      research: ['llama3.1:70b', 'gemma2:27b'],
    };
  }

  /**
   * Get model capabilities
   */
  getModelCapabilities(modelName: string): {
    max_tokens: number;
    context_window: number;
    capabilities: string[];
    recommended_use_cases: string[];
  } {
    const capabilities: Record<string, any> = {
      'llama3.1:8b': {
        max_tokens: 8192,
        context_window: 128000,
        capabilities: ['text', 'code', 'reasoning'],
        recommended_use_cases: ['general', 'coding', 'analysis'],
      },
      'llama3.1:70b': {
        max_tokens: 8192,
        context_window: 128000,
        capabilities: ['text', 'code', 'reasoning', 'analysis'],
        recommended_use_cases: ['high-quality', 'complex', 'research'],
      },
      'mistral:7b': {
        max_tokens: 8192,
        context_window: 32000,
        capabilities: ['text', 'code', 'reasoning'],
        recommended_use_cases: ['fast', 'general', 'coding'],
      },
      'mixtral:8x7b': {
        max_tokens: 8192,
        context_window: 32000,
        capabilities: ['text', 'code', 'reasoning', 'analysis'],
        recommended_use_cases: ['balanced', 'complex', 'reasoning'],
      },
      'codellama:7b': {
        max_tokens: 16384,
        context_window: 100000,
        capabilities: ['code', 'debugging', 'explanation'],
        recommended_use_cases: ['coding', 'debugging', 'code-review'],
      },
      'codellama:13b': {
        max_tokens: 16384,
        context_window: 100000,
        capabilities: ['code', 'debugging', 'explanation', 'analysis'],
        recommended_use_cases: ['coding', 'debugging', 'complex-code'],
      },
      'gemma2:9b': {
        max_tokens: 8192,
        context_window: 8192,
        capabilities: ['text', 'reasoning'],
        recommended_use_cases: ['general', 'fast', 'reasoning'],
      },
      'gemma2:27b': {
        max_tokens: 8192,
        context_window: 8192,
        capabilities: ['text', 'reasoning', 'analysis'],
        recommended_use_cases: ['high-quality', 'research', 'analysis'],
      },
    };

    return (
      capabilities[modelName] || {
        max_tokens: 4096,
        context_window: 4096,
        capabilities: ['text'],
        recommended_use_cases: ['general'],
      }
    );
  }
}
