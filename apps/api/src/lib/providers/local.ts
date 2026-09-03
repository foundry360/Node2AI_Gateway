import { Provider } from './base';
import {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '../types/providers';

export class LocalProvider extends Provider {
  name = 'local';
  models = [
    'llama2:7b',
    'llama2:13b',
    'llama2:70b',
    'mistral:7b',
    'codellama:7b',
    'codellama:13b',
    'phi:3b',
  ];

  private baseURL: string;

  constructor(
    baseUrl: string = process.env.LOCAL_LLM_URL || 'http://localhost:8000'
  ) {
    super({ baseUrl });
    this.baseURL = baseUrl;
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    return {
      id: `chatcmpl-local-${Date.now()}`,
      object: 'chat.completion' as any,
      created: Math.floor(Date.now() / 1000),
      model: options.model || 'llama2:7b',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content:
              'Local provider is not fully configured. Please set up Ollama or configure another provider.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      cost: 0,
    } as any;
  }

  async *stream(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<ChatChunk> {
    try {
      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model || 'llama2:7b',
          messages: this.formatMessages(messages),
          stream: true,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.topP || 0.9,
            max_tokens: options.maxTokens || 1000,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
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
                if (data.message?.content) {
                  yield {
                    content: data.message.content,
                    model: data.model,
                    usage: undefined,
                    finishReason: data.done ? 'stop' : undefined,
                    cost: 0,
                  };
                }
                if (data.done) {
                  return;
                }
              } catch (parseError) {
                // Skip invalid JSON lines
                continue;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      throw new Error(
        `Local model stream failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  protected calculateCost(
    model: string,
    tokensIn: number,
    tokensOut: number
  ): number {
    // Local models have no cost (running on your infrastructure)
    return 0;
  }

  private formatMessages(messages: Message[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`);
      if (!response.ok) {
        return this.models; // Return default models if API is not available
      }

      const data = await response.json();
      return data.models?.map((model: any) => model.name) || this.models;
    } catch (error) {
      console.warn('Failed to fetch Ollama models:', error);
      return this.models;
    }
  }

  /**
   * Check if Ollama is running
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: 'HEAD',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  getModelInfo(model: string): any {
    return { name: model, provider: 'local' };
  }

  validateConfig(): boolean {
    return !!this.baseURL;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
