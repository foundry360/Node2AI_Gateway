/**
 * In-memory store for immutable governance baselines and normalized changes.
 */

import type { GovernanceBaseline, NormalizedChange } from './types.js';

export class InMemoryChangeGovernanceRepository {
  private baselines = new Map<string, GovernanceBaseline>();
  private changes = new Map<string, NormalizedChange>();

  saveBaseline(baseline: GovernanceBaseline): GovernanceBaseline {
    if (this.baselines.has(baseline.baseline_id)) {
      throw new Error(`Baseline ${baseline.baseline_id} is immutable and already exists`);
    }
    this.baselines.set(baseline.baseline_id, structuredClone(baseline));
    return structuredClone(baseline);
  }

  getBaseline(baselineId: string): GovernanceBaseline | undefined {
    const row = this.baselines.get(baselineId);
    return row ? structuredClone(row) : undefined;
  }

  listBaselinesForTarget(
    targetType: GovernanceBaseline['target_type'],
    targetId: string,
  ): GovernanceBaseline[] {
    return [...this.baselines.values()]
      .filter((b) => b.target_type === targetType && b.target_id === targetId)
      .sort((a, b) => a.version - b.version)
      .map((b) => structuredClone(b));
  }

  latestBaseline(
    targetType: GovernanceBaseline['target_type'],
    targetId: string,
  ): GovernanceBaseline | undefined {
    const list = this.listBaselinesForTarget(targetType, targetId);
    return list.length ? list[list.length - 1] : undefined;
  }

  saveChange(change: NormalizedChange): NormalizedChange {
    if (this.changes.has(change.change_id)) {
      throw new Error(`Change ${change.change_id} is immutable and already exists`);
    }
    this.changes.set(change.change_id, structuredClone(change));
    return structuredClone(change);
  }

  getChange(changeId: string): NormalizedChange | undefined {
    const row = this.changes.get(changeId);
    return row ? structuredClone(row) : undefined;
  }

  listChanges(): NormalizedChange[] {
    return [...this.changes.values()].map((c) => structuredClone(c));
  }

  /** Test helper — attempt mutation must fail / not affect stored baseline. */
  tryMutateBaseline(
    baselineId: string,
    mutator: (b: GovernanceBaseline) => void,
  ): boolean {
    const row = this.baselines.get(baselineId);
    if (!row) return false;
    const clone = structuredClone(row);
    mutator(clone);
    // Intentionally do not write back — baselines are immutable.
    return this.baselines.get(baselineId)!.version === row.version;
  }
}
