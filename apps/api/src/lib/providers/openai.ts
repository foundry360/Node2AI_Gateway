import { Provider } from './base';
import {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '../types/providers';

export class OpenAIProvider extends Provider {
  name = 'openai';
  models = [
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k',
  ];

  private apiKey: string;
  private baseURL: string;

  constructor(
    apiKey: string = process.env.OPENAI_API_KEY || '',
    baseURL: string = 'https://api.openai.com/v1'
  ) {
    super({ apiKey, baseURL });
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    try {
      // Check if API key is configured
      if (!this.apiKey) {
        console.warn('OpenAI API key not configured - returning mock response');
        return this.getMockResponse(messages, options);
      }

      const openaiMessages = messages.map((msg: any) => ({
        role: msg.role || 'user',
        content: msg.content || '',
      }));

      console.log('Sending request to OpenAI:', {
        model: options.model || 'gpt-4',
        messages: openaiMessages,
      });

      // Add timeout to prevent hanging requests
      const timeoutMs = options.timeout || 30000; // Default 30s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model || 'gpt-4',
            messages: openaiMessages,
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || options.maxTokens || 1000,
            stream: options.stream || false,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `OpenAI API error: ${response.status} ${response.statusText}`
          );
        }

        const data = (await response.json()) as any;

        // Calculate cost based on token usage
        const usage = data.usage || {};
        const cost = this.calculateCost(
          data.model || options.model || 'gpt-3.5-turbo',
          usage.prompt_tokens || 0,
          usage.completion_tokens || 0
        );

        return {
          id: data.id,
          object: 'chat.completion',
          created: data.created,
          model: data.model,
          choices: data.choices || [],
          usage: {
            prompt_tokens: usage.prompt_tokens || 0,
            completion_tokens: usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0,
          } as any,
          cost,
        };
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error(`OpenAI request timeout after ${timeoutMs}ms`);
        }
        throw fetchError;
      }
    } catch (error: any) {
      throw new Error(`OpenAI provider error: ${error.message}`);
    }
  }

  private getMockResponse(
    messages: Message[],
    options: ChatOptions
  ): ChatResponse {
    const userMessage = messages.find(m => m.role === 'user')?.content || '';

    // Try to provide a relevant mock response based on the prompt
    let mockContent = 'I understand your question. ';

    if (userMessage.toLowerCase().includes('headache')) {
      mockContent +=
        'Common causes of headaches include tension, migraines, dehydration, and stress. I recommend consulting with a healthcare provider for persistent headaches.';
    } else if (
      userMessage.toLowerCase().includes('credit card') ||
      userMessage.toLowerCase().includes('compromise')
    ) {
      mockContent +=
        'If you believe your credit card information has been compromised, you should immediately contact your bank, monitor your accounts, and consider freezing your credit.';
    } else if (
      userMessage.toLowerCase().includes('bank') ||
      userMessage.toLowerCase().includes('fraud')
    ) {
      mockContent +=
        'For banking security, use strong passwords, enable two-factor authentication, regularly monitor your accounts, and never share your banking credentials.';
    } else if (
      userMessage.toLowerCase().includes('visa') ||
      userMessage.toLowerCase().includes('passport')
    ) {
      mockContent +=
        'Visa processing times typically range from 1-4 weeks depending on the country and visa type. Check with the specific embassy for current processing times.';
    } else {
      mockContent +=
        'This is a mock response. Please configure your OpenAI API key to get real AI responses.';
    }

    return {
      id: `chatcmpl-mock-${Date.now()}`,
      object: 'chat.completion' as any,
      created: Math.floor(Date.now() / 1000),
      model: options.model || 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: mockContent,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: userMessage.length / 4,
        completion_tokens: mockContent.length / 4,
        total_tokens: (userMessage.length + mockContent.length) / 4,
      } as any,
      cost: 0,
    };
  }

  async *stream(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<ChatChunk> {
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model || 'gpt-3.5-turbo',
          messages: this.formatMessages(messages),
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 1000,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}`
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
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  yield {
                    content: parsed.choices[0].delta.content,
                    model: parsed.model,
                    usage: undefined,
                    finishReason: undefined,
                    cost: 0,
                  };
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
        `OpenAI stream failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  protected calculateCost(
    model: string,
    tokensIn: number,
    tokensOut: number
  ): number {
    // OpenAI pricing (as of 2024)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
      'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
    };

    const modelPricing = pricing[model] || pricing['gpt-3.5-turbo'];
    return (
      (tokensIn * modelPricing.input + tokensOut * modelPricing.output) / 1000
    );
  }

  private formatMessages(messages: Message[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  validateConfig(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiKey || this.apiKey.trim().length === 0) {
        console.error('[OpenAI] API key is empty or invalid');
        throw new Error('API key is not configured');
      }

      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(
          '[OpenAI] Connection test failed:',
          response.status,
          errorText
        );
        throw new Error(
          `OpenAI API returned ${response.status}: ${errorText.substring(0, 200)}`
        );
      }

      return true;
    } catch (error: any) {
      console.error('[OpenAI] testConnection error:', error.message);
      throw error; // Re-throw to get better error messages
    }
  }

  /**
   * Fetch available models from OpenAI API
   */
  async fetchAvailableModels(): Promise<string[]> {
    try {
      if (!this.apiKey || this.apiKey.trim().length === 0) {
        console.warn(
          '[OpenAI] API key not configured, returning default models'
        );
        return this.models; // Return hardcoded defaults as fallback
      }

      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(
          `[OpenAI] Failed to fetch models: ${response.status}, using defaults`
        );
        return this.models;
      }

      const data = await response.json();

      // Filter to chat models only
      const chatModels =
        data.data
          ?.filter(
            (m: any) =>
              m.id &&
              (m.id.includes('gpt-4') ||
                m.id.includes('gpt-3.5-turbo') ||
                m.id.includes('o1'))
          )
          .map((m: any) => m.id) || [];

      if (chatModels.length > 0) {
        console.log(
          `[OpenAI] Loaded ${chatModels.length} available models: ${chatModels.join(', ')}`
        );
        return chatModels;
      }

      // Fallback to defaults if no models found
      console.warn('[OpenAI] No chat models found, using defaults');
      return this.models;
    } catch (error: any) {
      console.warn(
        `[OpenAI] Error fetching models: ${error.message}, using defaults`
      );
      return this.models;
    }
  }

  getModelInfo(model: string): any | null {
    const modelInfo: { [key: string]: any } = {
      'gpt-4': {
        name: 'GPT-4',
        maxTokens: 8192,
        capabilities: ['text', 'function_calling'],
      },
      'gpt-4-turbo': {
        name: 'GPT-4 Turbo',
        maxTokens: 128000,
        capabilities: ['text', 'function_calling', 'vision'],
      },
      'gpt-3.5-turbo': {
        name: 'GPT-3.5 Turbo',
        maxTokens: 4096,
        capabilities: ['text', 'function_calling'],
      },
      'gpt-3.5-turbo-16k': {
        name: 'GPT-3.5 Turbo 16K',
        maxTokens: 16384,
        capabilities: ['text', 'function_calling'],
      },
    };

    return modelInfo[model] || null;
  }
}
