import {
  defaultPackSnapshot,
  type PackPolicyMeta,
  type PackSnapshot,
} from './packs/baseline.js';
import { regulatoryPackExtras } from './packs/regulatory.js';
import type { PolicyEvaluationRecord } from './evaluation-record.js';

export function mergeDefaultSnapshot(): PackSnapshot {
  const base = defaultPackSnapshot();
  const reg = regulatoryPackExtras();
  return {
    packs: [...base.packs, ...reg.packs],
    policies: [...base.policies, ...reg.policies],
  };
}

/** In-memory EPA policy repository (Production for appliance memory mode). */
export class InMemoryPolicyRepository {
  private snapshot: PackSnapshot;
  private evaluations = new Map<string, PolicyEvaluationRecord>();

  constructor(snapshot: PackSnapshot = mergeDefaultSnapshot()) {
    this.snapshot = structuredClone(snapshot);
  }

  getSnapshot(): PackSnapshot {
    return structuredClone(this.snapshot);
  }

  listActivePolicies(phase: 'input' | 'output'): PackPolicyMeta[] {
    return this.snapshot.policies.filter(
      (p) => p.status === 'active' && p.phase === phase,
    );
  }

  listActiveOverlays(phase: 'input' | 'output' = 'input'): PackPolicyMeta[] {
    const baseline = new Set(['baseline_input_v2', 'baseline_output_v5', 'framework_stub']);
    return this.listActivePolicies(phase).filter((p) => !baseline.has(p.interpreter));
  }

  findByInterpreter(
    interpreter: PackPolicyMeta['interpreter'],
  ): PackPolicyMeta | undefined {
    return this.snapshot.policies.find((p) => p.interpreter === interpreter);
  }

  getPolicy(policyId: string): PackPolicyMeta | undefined {
    return this.snapshot.policies.find((p) => p.policy_id === policyId);
  }

  setPolicyStatus(
    policyId: string,
    status: PackPolicyMeta['status'],
  ): PackPolicyMeta | undefined {
    const p = this.snapshot.policies.find((x) => x.policy_id === policyId);
    if (!p) return undefined;
    p.status = status;
    return { ...p };
  }

  setPackStatus(
    packId: string,
    status: string,
  ): PackSnapshot['packs'][number] | undefined {
    const pack = this.snapshot.packs.find((p) => p.pack_id === packId);
    if (!pack) return undefined;
    pack.status = status;
    return { ...pack };
  }

  recordEvaluation(record: PolicyEvaluationRecord): void {
    this.evaluations.set(record.evaluation_id, structuredClone(record));
  }

  getEvaluation(evaluationId: string): PolicyEvaluationRecord | undefined {
    const row = this.evaluations.get(evaluationId);
    return row ? structuredClone(row) : undefined;
  }
}
