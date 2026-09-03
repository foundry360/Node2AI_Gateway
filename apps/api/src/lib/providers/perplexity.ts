import { Provider } from './base';
import {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '../types/providers';

export class PerplexityProvider extends Provider {
  name = 'perplexity';
  models = [
    // Online models (with web search)
    'sonar-pro',
    'sonar',
    'sonar-reasoning',
    // Chat models (no web search)
    'llama-3.1-sonar-small-128k-chat',
    'llama-3.1-sonar-large-128k-chat',
    'llama-3.1-sonar-huge-128k-chat',
    // Open-source models
    'llama-3.1-8b-instruct',
    'llama-3.1-70b-instruct',
  ];

  private apiKey: string;
  private baseURL: string;

  constructor(
    apiKey: string = process.env.PERPLEXITY_API_KEY || '',
    baseURL: string = 'https://api.perplexity.ai/chat/completions'
  ) {
    super({ apiKey, baseURL });
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || 'sonar',
          messages: messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 1000,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Perplexity API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      const usage = data.usage || {};
      const cost = this.calculateCost(
        options.model || 'llama-3.1-sonar-small-128k-online',
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0
      );

      return {
        id: data.id || `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: data.created || Math.floor(Date.now() / 1000),
        model: options.model || 'llama-3.1-sonar-small-128k-online',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: content,
            },
            finish_reason: data.choices?.[0]?.finish_reason || 'stop',
          },
        ],
        usage: {
          prompt_tokens: usage.prompt_tokens || 0,
          completion_tokens: usage.completion_tokens || 0,
          total_tokens: usage.total_tokens || 0,
        },
        cost,
      };
    } catch (error: any) {
      throw new Error(`Perplexity provider error: ${error.message}`);
    }
  }

  async *stream(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<ChatChunk> {
    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || 'sonar',
          messages: messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 1000,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Perplexity API error: ${response.status} ${response.statusText}`
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
                model: options.model || 'sonar',
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
              if (parsed.choices?.[0]?.delta?.content) {
                const textContent = parsed.choices[0].delta.content;
                yield {
                  id: parsed.id || `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: parsed.created || Math.floor(Date.now() / 1000),
                  model: options.model || 'sonar',
                  content: textContent,
                  cost: 0,
                  choices: [
                    {
                      index: 0,
                      delta: { content: textContent },
                      finish_reason: parsed.choices[0].finish_reason || null,
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
      throw new Error(`Perplexity streaming error: ${error.message}`);
    }
  }

  protected calculateCost(
    model: string,
    tokensIn: number,
    tokensOut: number
  ): number {
    // Perplexity pricing (as of 2024-2025)
    const pricing: { [key: string]: { input: number; output: number } } = {
      // Online models (with web search)
      'sonar-pro': { input: 0.001, output: 0.001 },
      sonar: { input: 0.0002, output: 0.0002 },
      'sonar-reasoning': { input: 0.001, output: 0.001 },
      // Chat models (no web search)
      'llama-3.1-sonar-small-128k-chat': { input: 0.0001, output: 0.0001 },
      'llama-3.1-sonar-large-128k-chat': { input: 0.0005, output: 0.0005 },
      'llama-3.1-sonar-huge-128k-chat': { input: 0.001, output: 0.001 },
      // Open-source models
      'llama-3.1-8b-instruct': { input: 0.00005, output: 0.00005 },
      'llama-3.1-70b-instruct': { input: 0.0007, output: 0.0007 },
    };

    const modelPricing = pricing[model] || pricing['sonar'];
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
        console.error('[Perplexity] API key is empty or invalid');
        throw new Error('API key is not configured');
      }

      // Try different model names in order of preference
      // Try the most commonly available models first
      const testModels = [
        'sonar',
        'sonar-pro',
        'llama-3.1-sonar-large-128k-chat',
        'sonar-reasoning',
        'llama-3.1-sonar-small-128k-chat',
        'llama-3.1-sonar-huge-128k-chat',
        'llama-3.1-70b-instruct',
        'llama-3.1-8b-instruct',
      ];

      let lastError: any = null;

      for (const testModel of testModels) {
        try {
          console.log(`[Perplexity] Trying model: ${testModel}`);
          const response = await fetch(this.baseURL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model: testModel,
              messages: [{ role: 'user', content: 'test' }],
              max_tokens: 1,
            }),
          });

          if (response.ok) {
            console.log(
              `[Perplexity] Successfully connected with model: ${testModel}`
            );
            return true;
          }

          // If 400 and it's about model, try next model
          if (response.status === 400) {
            const errorText = await response.text().catch(() => '');
            const errorJson = (() => {
              try {
                return JSON.parse(errorText);
              } catch {
                return null;
              }
            })();
            const errorMsg = errorJson?.error?.message || errorText;

            // Store error info including any permitted models list
            const errorInfo: any = {
              status: 400,
              errorText,
              errorJson,
              message: errorMsg,
            };

            if (
              errorMsg.includes('Invalid model') ||
              errorMsg.includes('Permitted models') ||
              errorMsg.includes('permitted models')
            ) {
              console.log(
                `[Perplexity] Model ${testModel} is invalid, trying next...`
              );
              console.log(
                `[Perplexity] Full error response:`,
                errorText.substring(0, 500)
              ); // Log full error to see permitted models
              lastError = errorInfo;
              continue; // Try next model
            } else {
              // Not a model error, store and break
              lastError = errorInfo;
              break;
            }
          }

          // For other errors, handle normally
          const errorText = await response.text().catch(() => '');
          const errorJson = (() => {
            try {
              return JSON.parse(errorText);
            } catch {
              return null;
            }
          })();

          lastError = { status: response.status, errorText, errorJson };
          break; // Don't try other models for non-model errors
        } catch (reqError: any) {
          console.error(
            `[Perplexity] Error testing model ${testModel}:`,
            reqError.message
          );
          lastError = reqError;
          // Continue to try next model
        }
      }

      // If we get here, all models failed or we hit a non-model error
      const finalStatus = lastError?.status || 400;
      const finalErrorText =
        lastError?.errorText ||
        lastError?.message ||
        'All model attempts failed';
      const finalErrorJson =
        lastError?.errorJson ||
        (() => {
          try {
            return JSON.parse(finalErrorText);
          } catch {
            return null;
          }
        })();

      console.error(
        '[Perplexity] Connection test failed after trying all models:',
        finalStatus,
        finalErrorText
      );

      // Provide user-friendly error messages
      if (finalStatus === 401) {
        throw new Error(
          'Invalid Perplexity API key. Please check that your API key is correct and starts with "pplx-".'
        );
      } else if (finalStatus === 403) {
        throw new Error(
          'Perplexity API key does not have permission to access this endpoint.'
        );
      } else if (finalStatus === 400) {
        // Try to extract model error info
        const errorMsg =
          finalErrorJson?.error?.message || finalErrorText.substring(0, 500);
        const fullErrorText = finalErrorText.substring(0, 1000); // Get more of the error for model list

        if (
          errorMsg.includes('Invalid model') ||
          errorMsg.includes('Permitted models')
        ) {
          // Try to extract permitted models from error message
          let permittedModelsHint = '';
          const modelsMatch =
            fullErrorText.match(/permitted models?[:\s]+([^\n.,;]+)/i) ||
            fullErrorText.match(/available models?[:\s]+([^\n.,;]+)/i);

          if (modelsMatch && modelsMatch[1]) {
            permittedModelsHint = ` Found in error: ${modelsMatch[1].trim()}`;
          }

          // Try to get available models from error or use common ones
          throw new Error(
            `Invalid Perplexity model name. Tried: ${testModels.join(', ')}.${permittedModelsHint} Valid models: sonar-pro, sonar, sonar-reasoning, llama-3.1-sonar-large-128k-chat, llama-3.1-sonar-small-128k-chat, llama-3.1-sonar-huge-128k-chat, llama-3.1-8b-instruct, llama-3.1-70b-instruct. Please check https://docs.perplexity.ai/ for current model names. Full error: ${errorMsg.substring(0, 300)}`
          );
        } else {
          throw new Error(`Perplexity API returned 400: ${errorMsg}`);
        }
      } else if (finalStatus === 429) {
        throw new Error(
          'Perplexity API rate limit exceeded. Please try again later.'
        );
      } else {
        throw new Error(
          `Perplexity API returned ${finalStatus}. ${finalErrorText.substring(0, 200)}`
        );
      }
    } catch (error: any) {
      console.error('[Perplexity] testConnection error:', error.message);
      throw error; // Re-throw to get better error messages
    }
  }

  async fetchAvailableModels(): Promise<string[]> {
    try {
      if (!this.apiKey || this.apiKey.trim().length === 0) {
        console.warn(
          '[Perplexity] API key not configured, returning default models'
        );
        return this.models;
      }

      // Perplexity doesn't have a models endpoint, but we can test models
      // For now, return all known models - the API will reject invalid ones
      console.log(
        '[Perplexity] No models endpoint, returning known Perplexity models'
      );
      return this.models;
    } catch (error: any) {
      console.warn(
        `[Perplexity] Error fetching models: ${error.message}, using defaults`
      );
      return this.models;
    }
  }

  getModelInfo(model: string): any | null {
    const modelInfo: { [key: string]: any } = {
      // Online models (with web search)
      'sonar-pro': {
        name: 'Sonar Pro',
        maxTokens: 131072,
        capabilities: ['text', 'web_search'],
        description: 'Best quality, most expensive',
      },
      sonar: {
        name: 'Sonar',
        maxTokens: 131072,
        capabilities: ['text', 'web_search'],
        description: 'Balanced quality/cost',
      },
      'sonar-reasoning': {
        name: 'Sonar Reasoning',
        maxTokens: 131072,
        capabilities: ['text', 'web_search', 'reasoning'],
        description: 'Advanced reasoning capabilities',
      },
      // Chat models (no web search)
      'llama-3.1-sonar-small-128k-chat': {
        name: 'Llama 3.1 Sonar Small (Chat)',
        maxTokens: 131072,
        capabilities: ['text'],
      },
      'llama-3.1-sonar-large-128k-chat': {
        name: 'Llama 3.1 Sonar Large (Chat)',
        maxTokens: 131072,
        capabilities: ['text'],
      },
      'llama-3.1-sonar-huge-128k-chat': {
        name: 'Llama 3.1 Sonar Huge (Chat)',
        maxTokens: 131072,
        capabilities: ['text'],
      },
      // Open-source models
      'llama-3.1-8b-instruct': {
        name: 'Llama 3.1 8B Instruct',
        maxTokens: 131072,
        capabilities: ['text'],
      },
      'llama-3.1-70b-instruct': {
        name: 'Llama 3.1 70B Instruct',
        maxTokens: 131072,
        capabilities: ['text'],
      },
    };

    return modelInfo[model] || null;
  }
}
