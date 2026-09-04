import {
  defaultPackSnapshot,
  type PackPolicyMeta,
  type PackSnapshot,
} from './packs/baseline.js';

/** In-memory EPA policy repository (Prototype → Production for appliance memory mode). */
export class InMemoryPolicyRepository {
  private snapshot: PackSnapshot;

  constructor(snapshot: PackSnapshot = defaultPackSnapshot()) {
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
}
