/**
 * Generic overlay interpreter registry.
 * Packs register apply functions by interpreter id — no HIPAA/HITECH forks in the PDP loop.
 * Multi-pack outcomes are collected independently then resolved by the generic resolver.
 */

import type { BaselineFacts, InterpretedResult, PackPolicyMeta, PackSnapshot } from './packs/baseline.js';
import {
  contributionFromInterpretedResult,
  materializeResolvedOutcome,
  resolvePackContributions,
} from './policy-resolution.js';

export type OverlayApplyFn = (
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta,
) => InterpretedResult;

export type PackContribution = Pick<PackSnapshot, 'packs' | 'policies'>;

const OVERLAY_REGISTRY = new Map<string, OverlayApplyFn>();

export function registerOverlayInterpreter(
  interpreter: string,
  apply: OverlayApplyFn,
): void {
  OVERLAY_REGISTRY.set(interpreter, apply);
}

export function unregisterOverlayInterpreter(interpreter: string): void {
  OVERLAY_REGISTRY.delete(interpreter);
}

export function getOverlayInterpreter(interpreter: string): OverlayApplyFn | undefined {
  return OVERLAY_REGISTRY.get(interpreter);
}

export function listRegisteredOverlayInterpreters(): string[] {
  return [...OVERLAY_REGISTRY.keys()].sort();
}

/** Merge pack contributions into one snapshot slice (order preserved). */
export function mergePackContributions(
  ...contributions: PackContribution[]
): PackContribution {
  const packs: PackContribution['packs'] = [];
  const policies: PackContribution['policies'] = [];
  const seenPacks = new Set<string>();
  const seenPolicies = new Set<string>();
  for (const c of contributions) {
    for (const p of c.packs) {
      if (seenPacks.has(p.pack_id)) continue;
      seenPacks.add(p.pack_id);
      packs.push(p);
    }
    for (const pol of c.policies) {
      if (seenPolicies.has(pol.policy_id)) continue;
      seenPolicies.add(pol.policy_id);
      policies.push(pol);
    }
  }
  return { packs, policies };
}

function cloneInterpreted(result: InterpretedResult): InterpretedResult {
  return {
    ...result,
    reason_codes: [...result.reason_codes],
    eligible_models: [...result.eligible_models],
    transforms: result.transforms.map((t) => ({
      type: t.type,
      targets: [...t.targets],
    })),
    obligations: result.obligations.map((o) => ({ ...o, parameters: o.parameters ? { ...o.parameters } : undefined })),
    matched: [...result.matched],
    provenance: result.provenance
      ? {
          ...result.provenance,
          matched_rules: [...(result.provenance.matched_rules ?? [])],
          sources: result.provenance.sources ? [...result.provenance.sources] : undefined,
          controls: result.provenance.controls ? [...result.provenance.controls] : undefined,
        }
      : undefined,
  };
}

/**
 * Apply all active overlays using the registry.
 *
 * Each pack is evaluated independently against the baseline result, then
 * applicable contributions are resolved generically. Single-pack paths remain
 * equivalent to direct apply. Unknown interpreters are skipped.
 */
export function applyRegisteredOverlays(
  result: InterpretedResult,
  facts: BaselineFacts,
  overlays: PackPolicyMeta[],
): InterpretedResult {
  const active = overlays.filter((m) => m.status === 'active');
  if (active.length === 0) return result;

  const skipMatched: string[] = [];
  const contributions = [];

  for (const meta of active) {
    const apply = OVERLAY_REGISTRY.get(meta.interpreter);
    if (!apply) continue;
    const before = cloneInterpreted(result);
    const after = apply(cloneInterpreted(result), facts, meta);
    const contribution = contributionFromInterpretedResult(meta, before, after);
    if (contribution.applicable) {
      contributions.push(contribution);
    } else {
      skipMatched.push(...contribution.matched);
    }
  }

  if (contributions.length === 0) {
    return {
      ...result,
      matched: [...result.matched, ...skipMatched],
    };
  }

  // Single applicable pack: materialize that pack's independent apply (parity with prior sequential apply).
  if (contributions.length === 1) {
    const only = contributions[0]!;
    const apply = OVERLAY_REGISTRY.get(
      active.find((m) => m.pack_id === only.pack_id)?.interpreter ?? '',
    );
    const meta = active.find((m) => m.pack_id === only.pack_id);
    if (apply && meta) {
      const after = apply(cloneInterpreted(result), facts, meta);
      return {
        ...after,
        matched: [...after.matched, ...skipMatched],
        resolution: resolvePackContributions(contributions),
      };
    }
  }

  const resolved = resolvePackContributions(contributions);
  const materialized = materializeResolvedOutcome(result, resolved, skipMatched);
  return {
    ...materialized,
    resolution: resolved,
  };
}
