import { Provider } from './base';
import {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '../types/providers';

export class AnthropicProvider extends Provider {
  name = 'anthropic';
  models = [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-2.0',
    'claude-instant-1.2',
  ];

  private apiKey: string;
  private baseUrl: string;

  constructor(
    apiKey: string = process.env.ANTHROPIC_API_KEY || '',
    baseUrl: string = 'https://api.anthropic.com/v1'
  ) {
    super({ apiKey, baseUrl });
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    try {
      // Convert OpenAI format to Anthropic format
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const anthropicMessages = conversationMessages.map(msg => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as string,
        content: msg.content || '',
      }));

      // Add timeout to prevent hanging requests
      const timeoutMs = options.timeout || 30000; // Default 30s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: options.model || 'claude-3-sonnet-20240229',
            max_tokens: options.max_tokens || 1000,
            temperature: options.temperature || 0.7,
            system: systemMessage?.content,
            messages: anthropicMessages,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `Anthropic API error: ${response.status} ${response.statusText}`
          );
        }

        const data = (await response.json()) as any;
        const content = data.content[0]?.text || '';

        // Convert Anthropic response to OpenAI format
        const responseMessage = {
          role: 'assistant' as string,
          content: content as string,
        };

        const usage = data.usage || {};
        const cost = this.calculateCost(
          options.model || 'claude-3-sonnet-20240229',
          usage.input_tokens || 0,
          usage.output_tokens || 0
        );

        return {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: options.model || 'claude-3-sonnet-20240229',
          choices: [
            {
              index: 0,
              message: responseMessage,
              finish_reason: data.stop_reason || 'stop',
            },
          ],
          usage: {
            prompt_tokens: usage.input_tokens || 0,
            completion_tokens: usage.output_tokens || 0,
            total_tokens:
              (usage.input_tokens || 0) + (usage.output_tokens || 0),
          } as any,
          cost,
        };
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error(`Anthropic request timeout after ${timeoutMs}ms`);
        }
        throw fetchError;
      }
    } catch (error: any) {
      throw new Error(`Anthropic provider error: ${error.message}`);
    }
  }

  async *stream(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<ChatChunk> {
    try {
      // Convert OpenAI format to Anthropic format
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const anthropicMessages = conversationMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model || 'claude-3-sonnet-20240229',
          max_tokens: options.max_tokens || 1000,
          temperature: options.temperature || 0.7,
          system: systemMessage?.content,
          messages: anthropicMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Anthropic API error: ${response.status} ${response.statusText}`
        );
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              yield {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: options.model || 'claude-3-sonnet-20240229',
                content: '',
                cost: 0,
                choices: [
                  {
                    index: 0,
                    delta: { content: '' },
                    finish_reason: 'stop',
                  },
                ],
              };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                yield {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: options.model || 'claude-3-sonnet-20240229',
                  content: parsed.delta.text,
                  cost: 0,
                  choices: [
                    {
                      index: 0,
                      delta: { content: parsed.delta.text },
                      finish_reason: null,
                    },
                  ],
                };
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Anthropic streaming error: ${error.message}`);
    }
  }

  protected calculateCost(
    model: string,
    tokensIn: number,
    tokensOut: number
  ): number {
    // Anthropic pricing (as of 2024)
    const pricing: { [key: string]: { input: number; output: number } } = {
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
      'claude-2.1': { input: 0.008, output: 0.024 },
      'claude-2.0': { input: 0.008, output: 0.024 },
      'claude-instant-1.2': { input: 0.0008, output: 0.0024 },
    };

    const modelPricing = pricing[model] || pricing['claude-3-sonnet-20240229'];
    return (
      (tokensIn * modelPricing.input + tokensOut * modelPricing.output) / 1000
    );
  }

  validateConfig(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiKey || this.apiKey.trim().length === 0) {
        console.error('[Anthropic] API key is empty or invalid');
        throw new Error('API key is not configured');
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(
          '[Anthropic] Connection test failed:',
          response.status,
          errorText
        );
        throw new Error(
          `Anthropic API returned ${response.status}: ${errorText.substring(0, 200)}`
        );
      }

      return true;
    } catch (error: any) {
      console.error('[Anthropic] testConnection error:', error.message);
      throw error; // Re-throw to get better error messages
    }
  }

  async fetchAvailableModels(): Promise<string[]> {
    try {
      if (!this.apiKey || this.apiKey.trim().length === 0) {
        console.warn(
          '[Anthropic] API key not configured, returning default models'
        );
        return this.models;
      }

      // Anthropic doesn't have a public models endpoint
      // Try a lightweight test to validate the key has access to Claude models
      // We can't reliably detect which specific models are accessible
      // so we return all known models and let the API reject invalid ones
      console.log(
        '[Anthropic] No models endpoint, returning known Claude models'
      );
      return this.models;
    } catch (error: any) {
      console.warn(
        `[Anthropic] Error fetching models: ${error.message}, using defaults`
      );
      return this.models;
    }
  }

  getModelInfo(model: string): any | null {
    const modelInfo: { [key: string]: any } = {
      'claude-3-opus-20240229': {
        name: 'Claude 3 Opus',
        maxTokens: 200000,
        capabilities: ['text', 'vision'],
      },
      'claude-3-sonnet-20240229': {
        name: 'Claude 3 Sonnet',
        maxTokens: 200000,
        capabilities: ['text', 'vision'],
      },
      'claude-3-haiku-20240307': {
        name: 'Claude 3 Haiku',
        maxTokens: 200000,
        capabilities: ['text', 'vision'],
      },
    };

    return modelInfo[model] || null;
  }
}
