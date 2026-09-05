/**
 * Generic multi-pack policy resolution.
 * Packs contribute; the platform resolves. No regulatory-specific branches.
 *
 * Authority tier ≠ precedence.
 * DENY + DENY = agreement (not conflict).
 * ALLOW + DENY = conflict (unless declared precedence resolves it).
 */

import type { Obligation, PolicyConflictRecord } from './types.js';
import type { DecisionProvenance } from './provenance.js';
import type { InterpretedResult, PackPolicyMeta } from './packs/baseline.js';

/** Smallest useful conflict taxonomy. */
export type ConflictCategory =
  | 'NONE'
  | 'AGREEMENT'
  | 'COMPLEMENTARY'
  | 'RESTRICTIVE'
  | 'CONFLICT'
  | 'UNRESOLVED';

export type ResolutionDecision =
  | 'ALLOW'
  | 'DENY'
  | 'TOKENIZE'
  | 'REDACT'
  | 'BLOCK_OUTPUT'
  | 'REVIEW';

export type PrecedenceBasis =
  | 'DECLARED_POLICY_PRECEDENCE'
  | 'PACK_PRIORITY'
  | 'COMPOSE_RESTRICTIVE'
  | 'AGREEMENT'
  | 'SINGLE_CONTRIBUTION'
  | 'UNRESOLVED_NO_PRECEDENCE'
  | 'BASELINE_ONLY';

/** Declared on PackPolicyMeta — explicit, not derived from authority_tier. */
export interface PrecedenceDeclaration {
  /** Higher number wins when resolving CONFLICT between packs. */
  priority: number;
  basis: 'DECLARED_POLICY_PRECEDENCE' | 'PACK_PRIORITY';
  /** Optional explicit override list (pack_ids this policy may override). */
  overrides_pack_ids?: string[];
}

export interface PackEvaluationContribution {
  pack_id: string;
  pack_version?: string;
  policy_id: string;
  policy_version: number;
  decision: ResolutionDecision;
  reason_codes: string[];
  rule_ids: string[];
  obligation_ids: string[];
  obligations: Obligation[];
  controls: Array<{ control_id: string; control_type?: string }>;
  transforms: Array<{ type: string; targets: string[] }>;
  eligible_models: string[];
  matched: string[];
  provenance?: DecisionProvenance;
  applicable: boolean;
  precedence?: PrecedenceDeclaration;
  authorize_detokenization?: boolean;
}

export interface ResolutionExplanation {
  category: ConflictCategory;
  basis: PrecedenceBasis;
  contributing_pack_ids: string[];
  contributions: PackEvaluationContribution[];
  conflict_pairs?: Array<{
    pack_a: string;
    pack_b: string;
    policy_a: string;
    policy_b: string;
    category: ConflictCategory;
    detail: string;
  }>;
  detail: string;
}

export interface ResolvedPolicyOutcome {
  decision: ResolutionDecision;
  reason_codes: string[];
  obligations: Obligation[];
  transforms: Array<{ type: string; targets: string[] }>;
  eligible_models: string[];
  matched: string[];
  provenance?: DecisionProvenance;
  authorize_detokenization?: boolean;
  policy_id: string;
  policy_version: number;
  pack_id: string;
  applicable_policies: Array<{
    policy_id: string;
    version: number;
    pack_id: string;
  }>;
  conflicts: PolicyConflictRecord[];
  resolution: ResolutionExplanation;
}

const DENYING = new Set<ResolutionDecision>(['DENY', 'BLOCK_OUTPUT']);
const TRANSFORMING = new Set<ResolutionDecision>(['TOKENIZE', 'REDACT']);
const ALLOWING = new Set<ResolutionDecision>(['ALLOW']);

function decisionFamily(
  d: ResolutionDecision,
): 'deny' | 'review' | 'transform' | 'allow' {
  if (DENYING.has(d)) return 'deny';
  if (d === 'REVIEW') return 'review';
  if (TRANSFORMING.has(d)) return 'transform';
  return 'allow';
}

/** Restrictiveness rank for compatible merge (higher = more restrictive). */
function restrictiveness(d: ResolutionDecision): number {
  switch (d) {
    case 'DENY':
    case 'BLOCK_OUTPUT':
      return 40;
    case 'REVIEW':
      return 30;
    case 'TOKENIZE':
    case 'REDACT':
      return 20;
    case 'ALLOW':
    default:
      return 10;
  }
}

export function classifyDecisionPair(
  a: ResolutionDecision,
  b: ResolutionDecision,
): ConflictCategory {
  if (a === b) return 'AGREEMENT';
  const fa = decisionFamily(a);
  const fb = decisionFamily(b);
  if (fa === fb) {
    if (fa === 'deny' || fa === 'allow' || fa === 'transform') return 'AGREEMENT';
    return 'COMPLEMENTARY';
  }
  // ALLOW + TOKENIZE → restrictive (compatible stronger control)
  if (
    (fa === 'allow' && fb === 'transform') ||
    (fa === 'transform' && fb === 'allow')
  ) {
    return 'RESTRICTIVE';
  }
  // REVIEW + ALLOW → restrictive toward REVIEW
  if (
    (fa === 'review' && fb === 'allow') ||
    (fa === 'allow' && fb === 'review')
  ) {
    return 'RESTRICTIVE';
  }
  // REVIEW + transform → restrictive toward REVIEW
  if (
    (fa === 'review' && fb === 'transform') ||
    (fa === 'transform' && fb === 'review')
  ) {
    return 'RESTRICTIVE';
  }
  // REVIEW + DENY → restrictive toward DENY (both non-allow)
  if (
    (fa === 'review' && fb === 'deny') ||
    (fa === 'deny' && fb === 'review')
  ) {
    return 'RESTRICTIVE';
  }
  // DENY + ALLOW / DENY + TOKENIZE → conflict
  if (fa === 'deny' || fb === 'deny') return 'CONFLICT';
  return 'CONFLICT';
}

function mergeObligations(lists: Obligation[][]): Obligation[] {
  const out: Obligation[] = [];
  for (const list of lists) {
    for (const o of list) {
      if (!out.some((x) => x.code === o.code)) out.push(o);
    }
  }
  return out;
}

function mergeTransforms(
  lists: Array<Array<{ type: string; targets: string[] }>>,
): Array<{ type: string; targets: string[] }> {
  const out: Array<{ type: string; targets: string[] }> = [];
  for (const list of lists) {
    for (const t of list) {
      const existing = out.find((x) => x.type === t.type);
      if (!existing) {
        out.push({ type: t.type, targets: [...t.targets] });
      } else {
        for (const target of t.targets) {
          if (!existing.targets.includes(target)) existing.targets.push(target);
        }
      }
    }
  }
  return out;
}

function mergeProvenance(
  contributions: PackEvaluationContribution[],
): DecisionProvenance | undefined {
  const matched_rules = contributions.flatMap(
    (c) => c.provenance?.matched_rules ?? [],
  );
  if (matched_rules.length === 0 && contributions.every((c) => !c.provenance)) {
    return undefined;
  }
  const sources = contributions.flatMap((c) => c.provenance?.sources ?? []);
  const seen = new Set<string>();
  const dedupSources = sources.filter((s) => {
    if (seen.has(s.source_id)) return false;
    seen.add(s.source_id);
    return true;
  });
  const controls = contributions.flatMap((c) => [
    ...(c.provenance?.controls ?? []),
    ...c.controls,
  ]);
  const actions = contributions.flatMap(
    (c) => c.provenance?.enforcement?.actions ?? [],
  );
  const authorize = contributions.some(
    (c) => c.authorize_detokenization || c.provenance?.enforcement?.authorize_detokenization,
  );
  return {
    matched_rules,
    sources: dedupSources.length > 0 ? dedupSources : undefined,
    classification: contributions.map((c) => c.provenance?.classification).find(Boolean),
    controls: controls.length > 0 ? controls : undefined,
    enforcement: {
      actions: [...new Set(actions)],
      authorize_detokenization: authorize || undefined,
    },
  };
}

function pickMostRestrictiveCompatible(
  decisions: ResolutionDecision[],
): ResolutionDecision {
  return decisions.reduce((best, d) =>
    restrictiveness(d) >= restrictiveness(best) ? d : best,
  );
}

function declaredWinner(
  a: PackEvaluationContribution,
  b: PackEvaluationContribution,
): PackEvaluationContribution | undefined {
  const pa = a.precedence;
  const pb = b.precedence;
  if (!pa && !pb) return undefined;

  if (pa?.overrides_pack_ids?.includes(b.pack_id)) return a;
  if (pb?.overrides_pack_ids?.includes(a.pack_id)) return b;

  if (pa && pb) {
    if (pa.priority === pb.priority) return undefined;
    return pa.priority > pb.priority ? a : b;
  }
  // Single declared precedence is not enough to override the other unless
  // overrides_pack_ids is set — avoids silent authority-like wins.
  return undefined;
}

/**
 * Resolve independent pack contributions into one platform decision.
 * Does not use authority_tier as precedence.
 */
export function resolvePackContributions(
  contributions: PackEvaluationContribution[],
): ResolvedPolicyOutcome {
  const applicable = contributions.filter((c) => c.applicable);

  if (applicable.length === 0) {
    return {
      decision: 'ALLOW',
      reason_codes: ['NO_APPLICABLE_PACK_CONTRIBUTIONS'],
      obligations: [],
      transforms: [],
      eligible_models: [],
      matched: [],
      policy_id: 'none',
      policy_version: 0,
      pack_id: 'none',
      applicable_policies: [],
      conflicts: [],
      resolution: {
        category: 'NONE',
        basis: 'BASELINE_ONLY',
        contributing_pack_ids: [],
        contributions: [],
        detail: 'No applicable pack contributions',
      },
    };
  }

  if (applicable.length === 1) {
    const only = applicable[0]!;
    return {
      decision: only.decision,
      reason_codes: only.reason_codes,
      obligations: only.obligations,
      transforms: only.transforms,
      eligible_models: only.eligible_models,
      matched: only.matched,
      provenance: only.provenance,
      authorize_detokenization: only.authorize_detokenization,
      policy_id: only.policy_id,
      policy_version: only.policy_version,
      pack_id: only.pack_id,
      applicable_policies: [
        {
          policy_id: only.policy_id,
          version: only.policy_version,
          pack_id: only.pack_id,
        },
      ],
      conflicts: [],
      resolution: {
        category: 'NONE',
        basis: 'SINGLE_CONTRIBUTION',
        contributing_pack_ids: [only.pack_id],
        contributions: applicable,
        detail: `Single applicable pack: ${only.pack_id}`,
      },
    };
  }

  const conflictPairs: NonNullable<ResolutionExplanation['conflict_pairs']> = [];
  let overall: ConflictCategory = 'AGREEMENT';

  for (let i = 0; i < applicable.length; i++) {
    for (let j = i + 1; j < applicable.length; j++) {
      const a = applicable[i]!;
      const b = applicable[j]!;
      const cat = classifyDecisionPair(a.decision, b.decision);
      if (cat === 'AGREEMENT' || cat === 'COMPLEMENTARY' || cat === 'RESTRICTIVE') {
        if (overall === 'AGREEMENT' && cat !== 'AGREEMENT') overall = cat;
        else if (overall === 'COMPLEMENTARY' && cat === 'RESTRICTIVE') overall = cat;
        conflictPairs.push({
          pack_a: a.pack_id,
          pack_b: b.pack_id,
          policy_a: a.policy_id,
          policy_b: b.policy_id,
          category: cat,
          detail: `${a.decision} vs ${b.decision} → ${cat}`,
        });
        continue;
      }
      if (cat === 'CONFLICT') {
        overall = 'CONFLICT';
        conflictPairs.push({
          pack_a: a.pack_id,
          pack_b: b.pack_id,
          policy_a: a.policy_id,
          policy_b: b.policy_id,
          category: 'CONFLICT',
          detail: `${a.decision} vs ${b.decision} cannot both be satisfied`,
        });
      }
    }
  }

  // Upgrade AGREEMENT → COMPLEMENTARY when obligations/controls differ across packs
  if (overall === 'AGREEMENT' && applicable.length > 1) {
    const obligationKeys = applicable.map((c) =>
      c.obligations
        .map((o) => o.code)
        .sort()
        .join(','),
    );
    const controlKeys = applicable.map((c) =>
      c.controls
        .map((x) => x.control_id)
        .sort()
        .join(','),
    );
    const obligationsDiffer = new Set(obligationKeys).size > 1;
    const controlsDiffer = new Set(controlKeys).size > 1;
    if (obligationsDiffer || controlsDiffer) {
      overall = 'COMPLEMENTARY';
      for (const pair of conflictPairs) {
        if (pair.category === 'AGREEMENT') {
          pair.category = 'COMPLEMENTARY';
          pair.detail = `${pair.detail} (distinct obligations/controls)`;
        }
      }
    }
  }

  const applicable_policies = applicable.map((c) => ({
    policy_id: c.policy_id,
    version: c.policy_version,
    pack_id: c.pack_id,
  }));

  // --- CONFLICT path ---
  if (overall === 'CONFLICT') {
    const conflicts: PolicyConflictRecord[] = [];
    let winner: PackEvaluationContribution | undefined;

    for (const pair of conflictPairs.filter((p) => p.category === 'CONFLICT')) {
      const a = applicable.find((c) => c.pack_id === pair.pack_a)!;
      const b = applicable.find((c) => c.pack_id === pair.pack_b)!;
      const w = declaredWinner(a, b);
      if (w) {
        winner = w;
        conflicts.push({
          conflict_type: 'decision',
          policy_a: a.policy_id,
          policy_b: b.policy_id,
          pack_a: a.pack_id,
          pack_b: b.pack_id,
          detail: pair.detail,
          resolution: 'precedence',
          category: 'CONFLICT',
          resolution_basis:
            w.precedence?.basis ?? 'DECLARED_POLICY_PRECEDENCE',
        });
      } else {
        conflicts.push({
          conflict_type: 'decision',
          policy_a: a.policy_id,
          policy_b: b.policy_id,
          pack_a: a.pack_id,
          pack_b: b.pack_id,
          detail: pair.detail,
          resolution: 'review_unresolved',
          category: 'CONFLICT',
          resolution_basis: 'UNRESOLVED_NO_PRECEDENCE',
        });
      }
    }

    const unresolved = conflicts.some((c) => c.resolution === 'review_unresolved');
    if (unresolved || !winner) {
      return {
        decision: 'REVIEW',
        reason_codes: [
          'POLICY_CONFLICT_UNRESOLVED',
          ...applicable.flatMap((c) => c.reason_codes),
        ],
        obligations: mergeObligations(applicable.map((c) => c.obligations)),
        transforms: [],
        eligible_models: [],
        matched: [
          ...applicable.flatMap((c) => c.matched),
          'resolution:UNRESOLVED',
          'resolution:REVIEW',
        ],
        provenance: mergeProvenance(applicable),
        policy_id: applicable[0]!.policy_id,
        policy_version: applicable[0]!.policy_version,
        pack_id: applicable[0]!.pack_id,
        applicable_policies,
        conflicts,
        resolution: {
          category: 'UNRESOLVED',
          basis: 'UNRESOLVED_NO_PRECEDENCE',
          contributing_pack_ids: applicable.map((c) => c.pack_id),
          contributions: applicable,
          conflict_pairs: conflictPairs,
          detail:
            'Material decision conflict without valid declared precedence — REVIEW',
        },
      };
    }

    return {
      decision: winner.decision,
      reason_codes: [
        'POLICY_CONFLICT_RESOLVED_BY_PRECEDENCE',
        ...winner.reason_codes,
      ],
      obligations: winner.obligations,
      transforms: winner.transforms,
      eligible_models: winner.eligible_models,
      matched: [
        ...applicable.flatMap((c) => c.matched),
        `resolution:PRECEDENCE:${winner.pack_id}`,
      ],
      provenance: mergeProvenance(applicable),
      authorize_detokenization: winner.authorize_detokenization,
      policy_id: winner.policy_id,
      policy_version: winner.policy_version,
      pack_id: winner.pack_id,
      applicable_policies,
      conflicts,
      resolution: {
        category: 'CONFLICT',
        basis: 'DECLARED_POLICY_PRECEDENCE',
        contributing_pack_ids: applicable.map((c) => c.pack_id),
        contributions: applicable,
        conflict_pairs: conflictPairs,
        detail: `Conflict resolved by declared precedence → ${winner.pack_id}`,
      },
    };
  }

  // --- AGREEMENT / COMPLEMENTARY / RESTRICTIVE ---
  const decision = pickMostRestrictiveCompatible(applicable.map((c) => c.decision));
  const basis: PrecedenceBasis =
    overall === 'AGREEMENT'
      ? 'AGREEMENT'
      : overall === 'RESTRICTIVE'
        ? 'COMPOSE_RESTRICTIVE'
        : 'COMPOSE_RESTRICTIVE';

  const primary =
    applicable.find((c) => c.decision === decision) ?? applicable[0]!;

  // Intersect eligible models when denying/transforming; else prefer local-safe intersection
  let eligible_models = primary.eligible_models;
  if (applicable.every((c) => c.eligible_models.length > 0)) {
    const sets = applicable.map((c) => new Set(c.eligible_models));
    eligible_models = [...sets[0]!].filter((m) => sets.every((s) => s.has(m)));
    if (eligible_models.length === 0 && !DENYING.has(decision) && decision !== 'REVIEW') {
      eligible_models = primary.eligible_models;
    }
  }

  return {
    decision,
    reason_codes: [
      ...new Set([
        `RESOLUTION_${overall}`,
        ...applicable.flatMap((c) => c.reason_codes),
      ]),
    ],
    obligations: mergeObligations(applicable.map((c) => c.obligations)),
    transforms: mergeTransforms(applicable.map((c) => c.transforms)),
    eligible_models,
    matched: [
      ...applicable.flatMap((c) => c.matched),
      `resolution:${overall}`,
    ],
    provenance: mergeProvenance(applicable),
    authorize_detokenization: applicable.some((c) => c.authorize_detokenization),
    policy_id: primary.policy_id,
    policy_version: primary.policy_version,
    pack_id: primary.pack_id,
    applicable_policies,
    conflicts: conflictPairs
      .filter((p) => p.category !== 'AGREEMENT')
      .map((p) => ({
        conflict_type: 'decision' as const,
        policy_a: p.policy_a,
        policy_b: p.policy_b,
        pack_a: p.pack_a,
        pack_b: p.pack_b,
        detail: p.detail,
        resolution: 'compose' as const,
        category: p.category,
        resolution_basis: basis,
      })),
    resolution: {
      category: overall,
      basis,
      contributing_pack_ids: applicable.map((c) => c.pack_id),
      contributions: applicable,
      conflict_pairs: conflictPairs,
      detail: `Resolved ${overall} → ${decision}`,
    },
  };
}

export function contributionFromInterpretedResult(
  meta: PackPolicyMeta,
  before: InterpretedResult,
  after: InterpretedResult,
): PackEvaluationContribution {
  const newMatched = after.matched.slice(before.matched.length);
  const skipOnly =
    newMatched.length > 0 &&
    newMatched.every(
      (m) =>
        m.includes('_skip') ||
        m.includes('skip_') ||
        m.endsWith('_not_applicable'),
    );
  const provenanceGrew =
    (after.provenance?.matched_rules?.length ?? 0) >
    (before.provenance?.matched_rules?.length ?? 0);
  const decisionChanged = after.decision !== before.decision;
  const obligationsGrew = after.obligations.length > before.obligations.length;
  const meaningfulMatched = newMatched.some(
    (m) =>
      !m.includes('_skip') &&
      !m.includes('skip_') &&
      !m.endsWith('_not_applicable'),
  );

  const applicable =
    !skipOnly &&
    (meaningfulMatched || decisionChanged || obligationsGrew || provenanceGrew);

  const rule_ids = (after.provenance?.matched_rules ?? [])
    .map((r) => r.rule_id)
    .filter(Boolean);
  for (const m of newMatched) {
    if (/^[A-Z0-9]+-R-/.test(m) || m.startsWith('MOCK-R-') || m.startsWith('HIPAA-R-')) {
      if (!rule_ids.includes(m)) rule_ids.push(m);
    }
  }

  const obligation_ids = [
    ...new Set(
      (after.provenance?.matched_rules ?? []).flatMap((r) => r.obligation_ids),
    ),
  ];

  return {
    pack_id: meta.pack_id,
    policy_id: meta.policy_id,
    policy_version: meta.version,
    decision: after.decision,
    reason_codes: [...after.reason_codes],
    rule_ids,
    obligation_ids,
    obligations: after.obligations,
    controls: after.provenance?.controls ?? [],
    transforms: after.transforms,
    eligible_models: after.eligible_models,
    matched: newMatched,
    provenance: after.provenance,
    applicable,
    precedence: meta.precedence,
    authorize_detokenization: after.authorize_detokenization,
  };
}

export function materializeResolvedOutcome(
  baseline: InterpretedResult,
  resolved: ResolvedPolicyOutcome,
  skipMatched: string[] = [],
): InterpretedResult {
  if (resolved.resolution.basis === 'BASELINE_ONLY') {
    return {
      ...baseline,
      matched: [...baseline.matched, ...skipMatched],
    };
  }

  return {
    ...baseline,
    decision: resolved.decision,
    reason_codes: [...new Set([...resolved.reason_codes, ...baseline.reason_codes])],
    obligations: resolved.obligations.length
      ? resolved.obligations
      : baseline.obligations,
    transforms: resolved.transforms.length ? resolved.transforms : baseline.transforms,
    eligible_models:
      resolved.decision === 'DENY' || resolved.decision === 'REVIEW'
        ? []
        : resolved.eligible_models.length > 0
          ? resolved.eligible_models
          : baseline.eligible_models,
    matched: [...baseline.matched, ...skipMatched, ...resolved.matched],
    provenance: resolved.provenance ?? baseline.provenance,
    authorize_detokenization: resolved.authorize_detokenization,
    policy_id: resolved.policy_id,
    policy_version: resolved.policy_version,
    pack_id: resolved.pack_id,
  };
}
