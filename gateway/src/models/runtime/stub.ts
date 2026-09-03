import type { LocalModelRuntime, ModelMessage } from '../types.js';

/**
 * Deterministic local runtime for CI / air-gap MVP without Ollama installed.
 * Swappable for OllamaLocalRuntime in appliance deployments.
 */
export class StubLocalRuntime implements LocalModelRuntime {
  readonly runtimeId = 'stub-local';

  constructor(private readonly modelIds: string[] = ['local-general-v1']) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  supports(model: string): boolean {
    return this.modelIds.includes(model);
  }

  async generate(input: {
    model: string;
    messages: ModelMessage[];
    request_id: string;
  }): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }> {
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
    const preview = (lastUser?.content ?? '').slice(0, 80);
    return {
      content: `[local-runtime:${input.model}] ${preview}`,
      usage: {
        input_tokens: Math.ceil((lastUser?.content.length ?? 0) / 4),
        output_tokens: 24,
      },
    };
  }
}
