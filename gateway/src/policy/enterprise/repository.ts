import {
  defaultPackSnapshot,
  type PackPolicyMeta,
  type PackSnapshot,
} from './packs/baseline.js';
import { regulatoryPackExtras } from './packs/regulatory.js';

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
    return this.listActivePolicies(phase).filter((p) =>
      p.interpreter.endsWith('_overlay_v1'),
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

  setPackStatus(
    packId: string,
    status: string,
  ): PackSnapshot['packs'][number] | undefined {
    const pack = this.snapshot.packs.find((p) => p.pack_id === packId);
    if (!pack) return undefined;
    pack.status = status;
    return { ...pack };
  }
}
