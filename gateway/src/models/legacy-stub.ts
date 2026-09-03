import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelProvider,
} from './types.js';

/** Legacy stub provider kept for compatibility; prefer LocalModelProvider. */
export class StubLocalProvider implements ModelProvider {
  readonly providerId = 'local-stub';
  readonly kind = 'local' as const;

  constructor(private readonly modelIds: string[] = ['local-general-v1']) {}

  supports(modelId: string): boolean {
    return this.modelIds.includes(modelId);
  }

  async execute(req: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    const preview = (lastUser?.content ?? '').slice(0, 80);
    return {
      model_id: req.model_id,
      provider: this.providerId,
      message: {
        role: 'assistant',
        content: `[governed-stub:${req.model_id}] Completed operation=${req.operation}. Echo: ${preview}`,
      },
      usage: {
        input_tokens: Math.ceil((lastUser?.content.length ?? 0) / 4),
        output_tokens: 24,
      },
    };
  }
}
