import type { LocalModelRuntime, ModelMessage } from '../types.js';

export interface OllamaLocalRuntimeOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Map gateway model_id → Ollama model name */
  modelMap?: Record<string, string>;
}

/**
 * Ollama-backed LocalModelRuntime. Used when the appliance has Ollama running.
 * Does not authorize — only executes inference against a local endpoint.
 */
export class OllamaLocalRuntime implements LocalModelRuntime {
  readonly runtimeId = 'ollama';
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly modelMap: Record<string, string>;

  constructor(options: OllamaLocalRuntimeOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.modelMap = options.modelMap ?? { 'local-general-v1': 'llama3.2' };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(input: {
    model: string;
    messages: ModelMessage[];
    request_id: string;
  }): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }> {
    const ollamaModel = this.modelMap[input.model] ?? input.model;
    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': input.request_id,
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages: input.messages,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama runtime error: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.message?.content ?? '',
      usage: {
        input_tokens: data.prompt_eval_count ?? 0,
        output_tokens: data.eval_count ?? 0,
      },
    };
  }
}
