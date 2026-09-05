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
  ): import('./evaluation-record.js').PolicyEvaluationRecord | undefined | Promise<
    import('./evaluation-record.js').PolicyEvaluationRecord | undefined
  >;
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

  getEvaluation(evaluationId: string) {
    return this.memory.getEvaluation(evaluationId);
  }

  private async persistEvaluationRow(
    record: import('./evaluation-record.js').PolicyEvaluationRecord,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO policy_evaluations (
           evaluation_id, request_id, phase, organization_id,
           subject, resource, action, context, ai_context, evidence_in,
           decision, reason, applicable_policies, obligations, explanation
         ) VALUES (
           $1, $2, $3, $4,
           $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10::jsonb,
           $11, $12, $13::jsonb, $14::jsonb, $15::jsonb
         )
         ON CONFLICT (evaluation_id) DO UPDATE SET
           explanation = EXCLUDED.explanation,
           decision = EXCLUDED.decision,
           reason = EXCLUDED.reason,
           applicable_policies = EXCLUDED.applicable_policies,
           obligations = EXCLUDED.obligations`,
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
        ],
      );
    } catch {
      // best-effort — schema may be absent in some environments
    }
  }
}
