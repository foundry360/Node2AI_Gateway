import { Provider } from './base';
import {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '../types/providers';

export class GoogleProvider extends Provider {
  name = 'google';
  models = [
    'gemini-pro',
    'gemini-pro-vision',
    'gemini-ultra',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ];

  private apiKey: string;
  private baseUrl: string;

  constructor(
    apiKey: string = process.env.GOOGLE_API_KEY || '',
    baseUrl: string = 'https://generativelanguage.googleapis.com/v1'
  ) {
    super({ apiKey, baseUrl });
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    try {
      const googleMessages = messages
        .filter((m: any) => m.role !== 'system')
        .map(
          msg =>
            ({
              role: msg.role === 'user' ? 'user' : 'model',
              parts: [{ text: msg.content }],
            }) as any
        );

      // Add system message as first user message if present
      const systemMessage = messages.find(m => m.role === 'system');
      if (systemMessage) {
        googleMessages.unshift({
          role: 'user',
          parts: [{ text: systemMessage.content }],
        });
      }

      // Add timeout to prevent hanging requests
      const timeoutMs = options.timeout || 30000; // Default 30s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(
          `${this.baseUrl}/models/${options.model || 'gemini-pro'}:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: googleMessages,
              generationConfig: {
                temperature: options.temperature || 0.7,
                maxOutputTokens: options.max_tokens || 1000,
                topP: 0.8,
                topK: 10,
              },
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `Google API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Convert Google response to OpenAI format
        const responseMessage = {
          role: 'assistant' as string,
          content: content as string,
        };

        const usage = data.usageMetadata || {};
        const cost = this.calculateCost(
          options.model || 'gemini-pro',
          usage.promptTokenCount || 0,
          usage.candidatesTokenCount || 0
        );

        return {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: options.model || 'gemini-pro',
          choices: [
            {
              index: 0,
              message: responseMessage,
              finish_reason: data.candidates?.[0]?.finishReason || 'stop',
            },
          ],
          usage: {
            prompt_tokens: usage.promptTokenCount || 0,
            completion_tokens: usage.candidatesTokenCount || 0,
            total_tokens:
              (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0),
          },
          cost,
        };
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error(`Google request timeout after ${timeoutMs}ms`);
        }
        throw fetchError;
      }
    } catch (error: any) {
      throw new Error(`Google provider error: ${error.message}`);
    }
  }

  async *stream(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<ChatChunk> {
    try {
      // Convert OpenAI format to Google format
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const googleMessages = conversationMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      // Add system message as first user message if present
      if (systemMessage) {
        googleMessages.unshift({
          role: 'user',
          parts: [{ text: systemMessage.content }],
        });
      }

      const response = await fetch(
        `${this.baseUrl}/models/${options.model || 'gemini-pro'}:streamGenerateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: googleMessages,
            generationConfig: {
              temperature: options.temperature || 0.7,
              maxOutputTokens: options.max_tokens || 1000,
              topP: 0.8,
              topK: 10,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Google API error: ${response.status} ${response.statusText}`
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
                model: options.model || 'gemini-pro',
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
              if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                const textContent = parsed.candidates[0].content.parts[0].text;
                yield {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: options.model || 'gemini-pro',
                  content: textContent,
                  cost: 0,
                  choices: [
                    {
                      index: 0,
                      delta: { content: textContent },
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
      throw new Error(`Google streaming error: ${error.message}`);
    }
  }

  protected calculateCost(
    model: string,
    tokensIn: number,
    tokensOut: number
  ): number {
    // Google Gemini pricing (as of 2024)
    const pricing: { [key: string]: { input: number; output: number } } = {
      'gemini-pro': { input: 0.0005, output: 0.0015 },
      'gemini-pro-vision': { input: 0.0005, output: 0.0015 },
      'gemini-ultra': { input: 0.00125, output: 0.00375 },
      'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
      'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
    };

    const modelPricing = pricing[model] || pricing['gemini-pro'];
    return (
      (tokensIn * modelPricing.input + tokensOut * modelPricing.output) / 1000
    );
  }

  validateConfig(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async fetchAvailableModels(): Promise<string[]> {
    try {
      if (!this.apiKey || this.apiKey.trim().length === 0) {
        console.warn(
          '[Google] API key not configured, returning default models'
        );
        return this.models;
      }

      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.warn(
          `[Google] Failed to fetch models: ${response.status}, using defaults`
        );
        return this.models;
      }

      const data = await response.json();

      // Filter to chat models only (gemini-pro, gemini-1.5, etc.)
      const chatModels =
        data.models
          ?.filter((m: any) => m.name && m.name.includes('gemini'))
          .map((m: any) => m.name.replace('models/', '')) || [];

      if (chatModels.length > 0) {
        console.log(
          `[Google] Loaded ${chatModels.length} available models: ${chatModels.join(', ')}`
        );
        return chatModels;
      }

      // Fallback to defaults if no models found
      console.warn('[Google] No models found in API response, using defaults');
      return this.models;
    } catch (error: any) {
      console.warn(
        `[Google] Error fetching models: ${error.message}, using defaults`
      );
      return this.models;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiKey || this.apiKey.trim().length === 0) {
        console.error('[Google] API key is empty or invalid');
        throw new Error('API key is not configured');
      }

      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(
          '[Google] Connection test failed:',
          response.status,
          errorText
        );
        throw new Error(
          `Google API returned ${response.status}: ${errorText.substring(0, 200)}`
        );
      }

      return true;
    } catch (error: any) {
      console.error('[Google] testConnection error:', error.message);
      throw error; // Re-throw to get better error messages
    }
  }

  getModelInfo(model: string): any | null {
    const modelInfo: { [key: string]: any } = {
      'gemini-pro': {
        name: 'Gemini Pro',
        maxTokens: 32768,
        capabilities: ['text', 'function_calling'],
      },
      'gemini-pro-vision': {
        name: 'Gemini Pro Vision',
        maxTokens: 16384,
        capabilities: ['text', 'vision'],
      },
      'gemini-ultra': {
        name: 'Gemini Ultra',
        maxTokens: 32768,
        capabilities: ['text', 'vision', 'function_calling'],
      },
      'gemini-1.5-pro': {
        name: 'Gemini 1.5 Pro',
        maxTokens: 2097152,
        capabilities: ['text', 'vision', 'function_calling'],
      },
      'gemini-1.5-flash': {
        name: 'Gemini 1.5 Flash',
        maxTokens: 1048576,
        capabilities: ['text', 'vision', 'function_calling'],
      },
    };

    return modelInfo[model] || null;
  }
}
