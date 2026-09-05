import type { LocalModelRuntime, ModelMessage } from '../types.js';
import { GatewayError } from '../../shared/errors.js';
import { OllamaLocalRuntime } from './ollama.js';
import { StubLocalRuntime } from './stub.js';

export type LocalRuntimeMode = 'stub' | 'ollama' | 'auto';

/**
 * Selects Ollama when available (or forced). Stub for CI/tests.
 * In air-gap + ollama mode, generate fails closed if Ollama is unreachable.
 */
export class ResolvingLocalRuntime implements LocalModelRuntime {
  readonly runtimeId = 'resolving-local';
  private readonly ollama: OllamaLocalRuntime;
  private readonly stub: StubLocalRuntime;
  private resolved: LocalModelRuntime | null = null;
  private resolvePromise: Promise<LocalModelRuntime> | null = null;

  constructor(
    private readonly mode: LocalRuntimeMode,
    private readonly airgap: boolean,
    options: {
      ollamaBaseUrl?: string;
      modelMap?: Record<string, string>;
      fetchImpl?: typeof fetch;
      stubModels?: string[];
    } = {},
  ) {
    this.ollama = new OllamaLocalRuntime({
      baseUrl: options.ollamaBaseUrl,
      modelMap: options.modelMap,
      fetchImpl: options.fetchImpl,
    });
    this.stub = new StubLocalRuntime(options.stubModels ?? ['local-general-v1']);
  }

  async resolve(): Promise<LocalModelRuntime> {
    if (this.resolved) return this.resolved;
    if (this.resolvePromise) return this.resolvePromise;

    this.resolvePromise = (async () => {
      if (this.mode === 'stub') {
        this.resolved = this.stub;
        return this.stub;
      }
      if (this.mode === 'ollama') {
        this.resolved = this.ollama;
        return this.ollama;
      }
      if (await this.ollama.isAvailable()) {
        this.resolved = this.ollama;
        return this.ollama;
      }
      if (this.airgap) {
        this.resolved = this.ollama;
        return this.ollama;
      }
      this.resolved = this.stub;
      return this.stub;
    })();

    return this.resolvePromise;
  }

  async isAvailable(): Promise<boolean> {
    const runtime = await this.resolve();
    return runtime.isAvailable();
  }

  async status(): Promise<{
    mode: LocalRuntimeMode;
    active_runtime: string;
    available: boolean;
    airgap: boolean;
  }> {
    const runtime = await this.resolve();
    const available = await runtime.isAvailable();
    return {
      mode: this.mode,
      active_runtime: runtime.runtimeId,
      available,
      airgap: this.airgap,
    };
  }

  async generate(input: {
    model: string;
    messages: ModelMessage[];
    request_id: string;
    num_predict?: number;
    signal?: AbortSignal;
  }): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }> {
    const runtime = await this.resolve();
    if (this.airgap && runtime.runtimeId === 'ollama') {
      const ok = await this.ollama.isAvailable();
      if (!ok) {
        throw new GatewayError(
          'AIRGAP_LOCAL_RUNTIME_UNAVAILABLE',
          'AIRGAP_LOCAL_RUNTIME_UNAVAILABLE: Ollama is required in air-gap mode.',
          503,
        );
      }
    }
    if (this.mode === 'ollama') {
      const ok = await this.ollama.isAvailable();
      if (!ok) {
        throw new GatewayError(
          'LOCAL_RUNTIME_UNAVAILABLE',
          'LOCAL_RUNTIME_UNAVAILABLE: Ollama is not reachable.',
          503,
        );
      }
    }
    return runtime.generate(input);
  }
}
