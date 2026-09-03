import type { ModelRegistry, ProviderKind, RegisteredModel } from './types.js';
import type { PgQueryable } from '../shared/pg.js';

export interface MutableModelRegistry extends ModelRegistry {
  listAll(): RegisteredModel[];
  upsert(model: RegisteredModel): void;
  setStatus(modelId: string, status: 'active' | 'disabled'): void;
}

export class InMemoryModelRegistry implements MutableModelRegistry {
  private models: RegisteredModel[];

  constructor(models: RegisteredModel[]) {
    this.models = models.map((m) => ({ ...m }));
  }

  listActive(): RegisteredModel[] {
    return this.models.filter((m) => m.status === 'active');
  }

  listAll(): RegisteredModel[] {
    return [...this.models];
  }

  get(modelId: string): RegisteredModel | null {
    return this.models.find((m) => m.model_id === modelId) ?? null;
  }

  listActiveModelIds(): string[] {
    return this.listActive().map((m) => m.model_id);
  }

  upsert(model: RegisteredModel): void {
    const idx = this.models.findIndex((m) => m.model_id === model.model_id);
    if (idx >= 0) this.models[idx] = { ...model };
    else this.models.push({ ...model });
  }

  setStatus(modelId: string, status: 'active' | 'disabled'): void {
    const m = this.get(modelId);
    if (!m) throw new Error(`Model not found: ${modelId}`);
    m.status = status;
  }
}

export async function loadModelsFromPostgres(db: PgQueryable): Promise<RegisteredModel[]> {
  const res = await db.query(
    `SELECT m.model_id, m.provider_id, m.name, m.status, p.kind
     FROM models m
     JOIN providers p ON p.provider_id = m.provider_id
     ORDER BY m.name`,
  );
  return res.rows.map((row) => ({
    model_id: String(row.model_id),
    provider_id: String(row.provider_id),
    name: String(row.name),
    kind: row.kind as ProviderKind,
    status: row.status as RegisteredModel['status'],
  }));
}

export async function persistModel(db: PgQueryable, model: RegisteredModel): Promise<void> {
  await db.query(
    `INSERT INTO providers (provider_id, name, kind, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (provider_id) DO NOTHING`,
    [model.provider_id, model.provider_id, model.kind],
  );
  await db.query(
    `INSERT INTO models (model_id, provider_id, name, status, capabilities, metadata)
     VALUES ($1, $2, $3, $4, '[]'::jsonb, '{}'::jsonb)
     ON CONFLICT (model_id) DO UPDATE
       SET provider_id = EXCLUDED.provider_id,
           name = EXCLUDED.name,
           status = EXCLUDED.status`,
    [model.model_id, model.provider_id, model.name, model.status],
  );
}

export async function persistModelStatus(
  db: PgQueryable,
  modelId: string,
  status: 'active' | 'disabled',
): Promise<void> {
  const res = await db.query(`UPDATE models SET status = $2 WHERE model_id = $1 RETURNING model_id`, [
    modelId,
    status,
  ]);
  if (!res.rows[0]) throw new Error(`Model not found: ${modelId}`);
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
