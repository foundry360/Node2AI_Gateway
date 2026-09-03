import type {
  LocalModelRuntime,
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelProvider,
} from '../types.js';

export class LocalModelProvider implements ModelProvider {
  readonly providerId = 'local-runtime';
  readonly kind = 'local' as const;

  constructor(
    private readonly runtime: LocalModelRuntime,
    private readonly modelIds: string[],
  ) {}

  supports(modelId: string): boolean {
    return this.modelIds.includes(modelId);
  }

  async execute(req: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const generated = await this.runtime.generate({
      model: req.model_id,
      messages: req.messages,
      request_id: req.request_id,
    });

    return {
      model_id: req.model_id,
      provider: this.providerId,
      message: { role: 'assistant', content: generated.content },
      usage: generated.usage,
    };
  }
}
