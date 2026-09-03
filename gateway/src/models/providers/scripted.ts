import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  ModelProvider,
} from '../types.js';

/**
 * Test/scripted provider that returns fixed assistant content.
 * Used to prove response governance without a real model.
 */
export class ScriptedModelProvider implements ModelProvider {
  readonly providerId: string;
  readonly kind: 'local' | 'private' | 'cloud';

  constructor(
    private readonly modelIds: string[],
    private readonly scriptedContent: string | ((req: ModelExecutionRequest) => string),
    options: { providerId?: string; kind?: 'local' | 'private' | 'cloud' } = {},
  ) {
    this.providerId = options.providerId ?? 'scripted-local';
    this.kind = options.kind ?? 'local';
  }

  supports(modelId: string): boolean {
    return this.modelIds.includes(modelId);
  }

  async execute(req: ModelExecutionRequest): Promise<ModelExecutionResult> {
    const content =
      typeof this.scriptedContent === 'function'
        ? this.scriptedContent(req)
        : this.scriptedContent;
    return {
      model_id: req.model_id,
      provider: this.providerId,
      message: { role: 'assistant', content },
      usage: { input_tokens: 8, output_tokens: 16 },
    };
  }
}
