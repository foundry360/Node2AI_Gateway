import type { ModelRegistry, RegisteredModel } from './types.js';

export class InMemoryModelRegistry implements ModelRegistry {
  constructor(private readonly models: RegisteredModel[]) {}

  listActive(): RegisteredModel[] {
    return this.models.filter((m) => m.status === 'active');
  }

  get(modelId: string): RegisteredModel | null {
    return this.models.find((m) => m.model_id === modelId) ?? null;
  }

  listActiveModelIds(): string[] {
    return this.listActive().map((m) => m.model_id);
  }
}

export function defaultPhase4Registry(): RegisteredModel[] {
  return [
    {
      model_id: 'local-general-v1',
      provider_id: 'local-runtime',
      name: 'Local General v1',
      kind: 'local',
      status: 'active',
    },
    {
      model_id: 'cloud-public-gpt',
      provider_id: 'external-openai-compatible',
      name: 'Approved External GPT',
      kind: 'cloud',
      status: 'active',
    },
  ];
}
