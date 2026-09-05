import { GatewayError } from '../../shared/errors.js';
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

  /** True if the mapped Ollama model name (or tag prefix) appears in /api/tags. */
  async hasModel(gatewayModelId: string): Promise<boolean> {
    const ollamaModel = this.modelMap[gatewayModelId] ?? gatewayModelId;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      const names = (data.models ?? []).map((m) => m.name ?? m.model ?? '');
      return names.some(
        (n) => n === ollamaModel || n.startsWith(`${ollamaModel}:`) || n.startsWith(ollamaModel),
      );
    } catch {
      return false;
    }
  }

  async generate(input: {
    model: string;
    messages: ModelMessage[];
    request_id: string;
    num_predict?: number;
    signal?: AbortSignal;
  }): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }> {
    const ollamaModel = this.modelMap[input.model] ?? input.model;

    let reachable = false;
    try {
      reachable = await this.isAvailable();
    } catch {
      reachable = false;
    }
    if (!reachable) {
      throw new GatewayError(
        'LOCAL_RUNTIME_UNAVAILABLE',
        'LOCAL_RUNTIME_UNAVAILABLE: Ollama is not reachable.',
        503,
      );
    }

    if (!(await this.hasModel(input.model))) {
      throw new GatewayError(
        'LOCAL_MODEL_NOT_READY',
        `LOCAL_MODEL_NOT_READY: Ollama model "${ollamaModel}" is not pulled yet. Run: docker compose --profile model-pull up ollama-init`,
        503,
      );
    }

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': input.request_id,
        },
        body: JSON.stringify({
          model: ollamaModel,
          messages: input.messages,
          stream: false,
          options:
            input.num_predict != null
              ? { num_predict: input.num_predict }
              : undefined,
        }),
        signal: input.signal,
      });
    } catch (err) {
      if (input.signal?.aborted) {
        throw new GatewayError(
          'LOCAL_RUNTIME_UNAVAILABLE',
          'LOCAL_RUNTIME_UNAVAILABLE: Ollama inference timed out.',
          503,
        );
      }
      throw new GatewayError(
        'LOCAL_RUNTIME_UNAVAILABLE',
        'LOCAL_RUNTIME_UNAVAILABLE: Ollama request failed.',
        503,
      );
    }

    if (res.status === 404) {
      throw new GatewayError(
        'LOCAL_MODEL_NOT_READY',
        `LOCAL_MODEL_NOT_READY: Ollama model "${ollamaModel}" returned 404 (not pulled).`,
        503,
      );
    }

    if (!res.ok) {
      throw new GatewayError(
        'LOCAL_RUNTIME_UNAVAILABLE',
        `LOCAL_RUNTIME_UNAVAILABLE: Ollama runtime error HTTP ${res.status}`,
        503,
      );
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
