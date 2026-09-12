import type { PgQueryable } from '../../shared/pg.js';
import type { PackPolicyMeta, PackSnapshot } from './packs/baseline.js';
import { mergeDefaultSnapshot, InMemoryPolicyRepository } from './repository.js';

/**
 * Shared EPA repository surface (memory or Postgres-backed cache).
 */
export interface PolicyRepository {
  getSnapshot(): PackSnapshot;
  listActivePolicies(phase: 'input' | 'output'): PackPolicyMeta[];
  listActiveOverlays(phase?: 'input' | 'output'): PackPolicyMeta[];
  findByInterpreter(
    interpreter: PackPolicyMeta['interpreter'],
  ): PackPolicyMeta | undefined;
  getPolicy(policyId: string): PackPolicyMeta | undefined;
  setPolicyStatus(
    policyId: string,
    status: PackPolicyMeta['status'],
  ): PackPolicyMeta | undefined | Promise<PackPolicyMeta | undefined>;
  setPackStatus(
    packId: string,
    status: string,
  ): PackSnapshot['packs'][number] | undefined | Promise<PackSnapshot['packs'][number] | undefined>;
  reload?(): Promise<void>;
  /** Persist evaluation explanation (including provenance) when supported. */
  recordEvaluation?(record: import('./evaluation-record.js').PolicyEvaluationRecord): void | Promise<void>;
  getEvaluation?(
    evaluationId: string,
  ):
    | import('./evaluation-record.js').PolicyEvaluationRecord
    | undefined
    | Promise<import('./evaluation-record.js').PolicyEvaluationRecord | undefined>;
  listEvaluations?(options?: {
    policyId?: string;
    limit?: number;
  }):
    | import('./evaluation-record.js').PolicyEvaluationRecord[]
    | Promise<import('./evaluation-record.js').PolicyEvaluationRecord[]>;
  /** Persist human resolution without overwriting machine decision. */
  saveHumanResolution?(
    evaluationId: string,
    resolution: import('./decision-resolution.js').HumanResolution,
  ):
    | import('./evaluation-record.js').PolicyEvaluationRecord
    | undefined
    | Promise<import('./evaluation-record.js').PolicyEvaluationRecord | undefined>;
  /** Retain live request payload for post-AUTHORIZE resume (REVIEW only). */
  attachHeldRequest?(
    evaluationId: string,
    held: import('./decision-resume.js').HeldRequestSnapshot,
  ):
    | import('./evaluation-record.js').PolicyEvaluationRecord
    | undefined
    | Promise<import('./evaluation-record.js').PolicyEvaluationRecord | undefined>;
  /** Persist resume execution state without mutating machine decision. */
  saveExecution?(
    evaluationId: string,
    execution: import('./decision-resume.js').EvaluationExecution,
  ):
    | import('./evaluation-record.js').PolicyEvaluationRecord
    | undefined
    | Promise<import('./evaluation-record.js').PolicyEvaluationRecord | undefined>;
}

/**
 * Postgres-backed EPA repository with in-memory working set.
 * Loads packs/policies/versions from EPA tables; falls back to default snapshot if empty.
 */
export class PostgresPolicyRepository implements PolicyRepository {
  private memory: InMemoryPolicyRepository;

  constructor(private readonly db: PgQueryable) {
    this.memory = new InMemoryPolicyRepository(mergeDefaultSnapshot());
  }

  static async create(db: PgQueryable): Promise<PostgresPolicyRepository> {
    const repo = new PostgresPolicyRepository(db);
    await repo.reload();
    return repo;
  }

  async reload(): Promise<void> {
    try {
      const packsRes = await this.db.query(
        `SELECT pack_id, name, domain, status FROM policy_packs ORDER BY pack_id`,
      );
      const policiesRes = await this.db.query(
        `SELECT p.policy_id, p.pack_id, p.name, p.domain,
                v.version, v.status, v.phase, v.rules
         FROM epa_policies p
         JOIN policy_versions v ON v.policy_id = p.policy_id
         WHERE v.version = (
           SELECT MAX(v2.version) FROM policy_versions v2 WHERE v2.policy_id = p.policy_id
         )
         ORDER BY p.policy_id`,
      );

      if (packsRes.rows.length === 0) {
        this.memory = new InMemoryPolicyRepository(mergeDefaultSnapshot());
        return;
      }

      const policies: PackPolicyMeta[] = [];
      for (const row of policiesRes.rows) {
        const rules = row.rules as Array<{ interpreter?: string }> | null;
        const interpreter = (Array.isArray(rules) && rules[0]?.interpreter
          ? String(rules[0].interpreter)
          : 'framework_stub') as PackPolicyMeta['interpreter'];
        const statusRaw = String(row.status);
        const status: PackPolicyMeta['status'] =
          statusRaw === 'active'
            ? 'active'
            : statusRaw === 'approved'
              ? 'approved'
              : statusRaw === 'retired'
                ? 'retired'
                : 'suspended';
        policies.push({
          policy_id: String(row.policy_id),
          version: Number(row.version),
          pack_id: String(row.pack_id ?? 'pack_enterprise_baseline'),
          name: String(row.name),
          phase: row.phase === 'output' ? 'output' : 'input',
          status,
          interpreter,
        });
      }

      this.memory = new InMemoryPolicyRepository({
        packs: packsRes.rows.map((r) => ({
          pack_id: String(r.pack_id),
          name: String(r.name),
          domain: String(r.domain),
          status: String(r.status),
        })),
        policies,
      });
    } catch {
      // Tables may not exist yet on old volumes — keep defaults.
      this.memory = new InMemoryPolicyRepository(mergeDefaultSnapshot());
    }
  }

  getSnapshot(): PackSnapshot {
    return this.memory.getSnapshot();
  }

  listActivePolicies(phase: 'input' | 'output'): PackPolicyMeta[] {
    return this.memory.listActivePolicies(phase);
  }

  listActiveOverlays(phase: 'input' | 'output' = 'input'): PackPolicyMeta[] {
    return this.memory.listActiveOverlays(phase);
  }

  findByInterpreter(
    interpreter: PackPolicyMeta['interpreter'],
  ): PackPolicyMeta | undefined {
    return this.memory.findByInterpreter(interpreter);
  }

  getPolicy(policyId: string): PackPolicyMeta | undefined {
    return this.memory.getPolicy(policyId);
  }

  async setPolicyStatus(
    policyId: string,
    status: PackPolicyMeta['status'],
  ): Promise<PackPolicyMeta | undefined> {
    const updated = this.memory.setPolicyStatus(policyId, status);
    if (!updated) return undefined;
    const dbStatus =
      status === 'active'
        ? 'active'
        : status === 'approved'
          ? 'approved'
          : status === 'retired'
            ? 'retired'
            : 'suspended';
    try {
      await this.db.query(
        `UPDATE policy_versions
         SET status = $2
         WHERE policy_id = $1
           AND version = (
             SELECT MAX(version) FROM policy_versions pv WHERE pv.policy_id = $1
           )`,
        [policyId, dbStatus],
      );
    } catch {
      // best-effort persist
    }
    return updated;
  }

  async setPackStatus(
    packId: string,
    status: string,
  ): Promise<PackSnapshot['packs'][number] | undefined> {
    const updated = this.memory.setPackStatus(packId, status);
    if (!updated) return undefined;
    try {
      await this.db.query(`UPDATE policy_packs SET status = $2, updated_at = now() WHERE pack_id = $1`, [
        packId,
        status,
      ]);
    } catch {
      // best-effort
    }
    return updated;
  }

  recordEvaluation(record: import('./evaluation-record.js').PolicyEvaluationRecord): void {
    this.memory.recordEvaluation(record);
    void this.persistEvaluationRow(record);
  }

  async getEvaluation(evaluationId: string) {
    const cached = this.memory.getEvaluation(evaluationId);
    if (cached) return cached;
    const load = async (withRestrictions: boolean) => {
      const res = await this.db.query(
        withRestrictions
          ? `SELECT evaluation_id, request_id, phase, organization_id,
                    subject, resource, action, context, ai_context, evidence_in,
                    decision, reason, applicable_policies, obligations, explanation,
                    human_resolution, held_request, execution, restrictions, created_at
             FROM policy_evaluations
             WHERE evaluation_id = $1`
          : `SELECT evaluation_id, request_id, phase, organization_id,
                    subject, resource, action, context, ai_context, evidence_in,
                    decision, reason, applicable_policies, obligations, explanation,
                    human_resolution, held_request, execution, created_at
             FROM policy_evaluations
             WHERE evaluation_id = $1`,
        [evaluationId],
      );
      return res.rows[0];
    };
    try {
      let row: Record<string, unknown> | undefined;
      try {
        row = (await load(true)) as Record<string, unknown> | undefined;
      } catch {
        row = (await load(false)) as Record<string, unknown> | undefined;
      }
      if (!row) return undefined;
      const { rowToEvaluationRecord } = await import('./evaluation-query.js');
      const record = rowToEvaluationRecord(row);
      this.memory.recordEvaluation(record);
      return record;
    } catch {
      return undefined;
    }
  }

  async listEvaluations(options: { policyId?: string; limit?: number } = {}) {
    const limit = options.limit ?? 50;
    try {
      // Prefer Postgres as authoritative historical store.
      const res = options.policyId
        ? await this.db.query(
            `SELECT evaluation_id, request_id, phase, organization_id,
                    subject, resource, action, context, ai_context, evidence_in,
                    decision, reason, applicable_policies, obligations, explanation,
                    human_resolution, held_request, execution, restrictions, created_at
             FROM policy_evaluations
             WHERE EXISTS (
               SELECT 1
               FROM jsonb_array_elements(applicable_policies) AS elem
               WHERE elem->>'policy_id' = $1
             )
             ORDER BY created_at DESC
             LIMIT $2`,
            [options.policyId, limit],
          )
        : await this.db.query(
            `SELECT evaluation_id, request_id, phase, organization_id,
                    subject, resource, action, context, ai_context, evidence_in,
                    decision, reason, applicable_policies, obligations, explanation,
                    human_resolution, held_request, execution, restrictions, created_at
             FROM policy_evaluations
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit],
          );
      const { rowToEvaluationRecord } = await import('./evaluation-query.js');
      const rows = res.rows.map((r) =>
        rowToEvaluationRecord(r as Record<string, unknown>),
      );
      // Contains filter on JSONB array of objects is exact-element match;
      // also include memory rows that mention policy_id in any applicable policy.
      if (options.policyId) {
        const fromMem = this.memory.listEvaluations({
          policyId: options.policyId,
          limit,
        });
        const seen = new Set(rows.map((r) => r.evaluation_id));
        for (const m of fromMem) {
          if (!seen.has(m.evaluation_id)) rows.push(m);
        }
        rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return rows.slice(0, limit);
      }
      return rows;
    } catch {
      return this.memory.listEvaluations(options);
    }
  }

  private async persistEvaluationRow(
    record: import('./evaluation-record.js').PolicyEvaluationRecord,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO policy_evaluations (
           evaluation_id, request_id, phase, organization_id,
           subject, resource, action, context, ai_context, evidence_in,
           decision, reason, applicable_policies, obligations, explanation,
           human_resolution, held_request, execution, restrictions, created_at
         ) VALUES (
           $1, $2, $3, $4,
           $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10::jsonb,
           $11, $12, $13::jsonb, $14::jsonb, $15::jsonb,
           $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::timestamptz
         )
         ON CONFLICT (evaluation_id) DO UPDATE SET
           explanation = EXCLUDED.explanation,
           decision = EXCLUDED.decision,
           reason = EXCLUDED.reason,
           applicable_policies = EXCLUDED.applicable_policies,
           obligations = EXCLUDED.obligations,
           evidence_in = EXCLUDED.evidence_in,
           restrictions = COALESCE(EXCLUDED.restrictions, policy_evaluations.restrictions),
           human_resolution = COALESCE(EXCLUDED.human_resolution, policy_evaluations.human_resolution),
           held_request = COALESCE(EXCLUDED.held_request, policy_evaluations.held_request),
           execution = COALESCE(EXCLUDED.execution, policy_evaluations.execution)`,
        [
          record.evaluation_id,
          record.request_id ?? null,
          record.phase,
          record.organization_id ?? null,
          JSON.stringify(record.subject),
          JSON.stringify(record.resource),
          record.action ?? null,
          JSON.stringify(record.context),
          JSON.stringify(record.ai_context),
          JSON.stringify(record.evidence_in),
          record.decision,
          record.reason ?? null,
          JSON.stringify(record.applicable_policies),
          JSON.stringify(record.obligations),
          JSON.stringify(record.explanation),
          record.human_resolution
            ? JSON.stringify(record.human_resolution)
            : null,
          record.held_request ? JSON.stringify(record.held_request) : null,
          record.execution ? JSON.stringify(record.execution) : null,
          record.restrictions
            ? JSON.stringify(record.restrictions)
            : null,
          record.created_at,
        ],
      );
    } catch {
      // Fallback without held_request / execution / human_resolution columns (older schemas).
      try {
        await this.db.query(
          `INSERT INTO policy_evaluations (
             evaluation_id, request_id, phase, organization_id,
             subject, resource, action, context, ai_context, evidence_in,
             decision, reason, applicable_policies, obligations, explanation, created_at
           ) VALUES (
             $1, $2, $3, $4,
             $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10::jsonb,
             $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::timestamptz
           )
           ON CONFLICT (evaluation_id) DO UPDATE SET
             explanation = EXCLUDED.explanation,
             decision = EXCLUDED.decision,
             reason = EXCLUDED.reason,
             applicable_policies = EXCLUDED.applicable_policies,
             obligations = EXCLUDED.obligations,
             evidence_in = EXCLUDED.evidence_in`,
          [
            record.evaluation_id,
            record.request_id ?? null,
            record.phase,
            record.organization_id ?? null,
            JSON.stringify(record.subject),
            JSON.stringify(record.resource),
            record.action ?? null,
            JSON.stringify(record.context),
            JSON.stringify(record.ai_context),
            JSON.stringify(record.evidence_in),
            record.decision,
            record.reason ?? null,
            JSON.stringify(record.applicable_policies),
            JSON.stringify(record.obligations),
            JSON.stringify({
              ...record.explanation,
              ...(record.human_resolution
                ? { human_resolution: record.human_resolution }
                : {}),
              ...(record.held_request
                ? { _enigma_held_request: record.held_request }
                : {}),
            }),
            record.created_at,
          ],
        );
      } catch {
        // best-effort — schema may be absent in some environments
      }
    }
  }

  async saveHumanResolution(
    evaluationId: string,
    resolution: import('./decision-resolution.js').HumanResolution,
  ) {
    const updated = this.memory.saveHumanResolution(evaluationId, resolution);
    if (!updated) return undefined;
    try {
      await this.db.query(
        `UPDATE policy_evaluations
         SET human_resolution = $1::jsonb
         WHERE evaluation_id = $2`,
        [JSON.stringify(resolution), evaluationId],
      );
    } catch {
      // Fallback: nest under explanation without touching decision.
      try {
        await this.db.query(
          `UPDATE policy_evaluations
           SET explanation = jsonb_set(
             COALESCE(explanation, '{}'::jsonb),
             '{human_resolution}',
             $1::jsonb,
             true
           )
           WHERE evaluation_id = $2`,
          [JSON.stringify(resolution), evaluationId],
        );
      } catch {
        // memory still holds the resolution
      }
    }
    return updated;
  }

  async attachHeldRequest(
    evaluationId: string,
    held: import('./decision-resume.js').HeldRequestSnapshot,
  ) {
    const updated = this.memory.attachHeldRequest(evaluationId, held);
    if (!updated) return undefined;
    try {
      await this.db.query(
        `UPDATE policy_evaluations
         SET held_request = $1::jsonb
         WHERE evaluation_id = $2`,
        [JSON.stringify(held), evaluationId],
      );
    } catch {
      try {
        await this.db.query(
          `UPDATE policy_evaluations
           SET explanation = jsonb_set(
             COALESCE(explanation, '{}'::jsonb),
             '{_enigma_held_request}',
             $1::jsonb,
             true
           )
           WHERE evaluation_id = $2`,
          [JSON.stringify(held), evaluationId],
        );
      } catch {
        // memory retains the hold
      }
    }
    return updated;
  }

  async saveExecution(
    evaluationId: string,
    execution: import('./decision-resume.js').EvaluationExecution,
  ) {
    const updated = this.memory.saveExecution(evaluationId, execution);
    if (!updated) return undefined;
    try {
      await this.db.query(
        `UPDATE policy_evaluations
         SET execution = $1::jsonb
         WHERE evaluation_id = $2`,
        [JSON.stringify(execution), evaluationId],
      );
    } catch {
      try {
        await this.db.query(
          `UPDATE policy_evaluations
           SET explanation = jsonb_set(
             COALESCE(explanation, '{}'::jsonb),
             '{_enigma_execution}',
             $1::jsonb,
             true
           )
           WHERE evaluation_id = $2`,
          [JSON.stringify(execution), evaluationId],
        );
      } catch {
        // memory retains execution
      }
    }
    return updated;
  }
}
