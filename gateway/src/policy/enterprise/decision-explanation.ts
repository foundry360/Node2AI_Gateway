/**
 * Pack-agnostic operator explanation helpers.
 * Derives human-readable decision intelligence from structured evaluation data.
 * No regulatory-specific branches.
 */

import type {
  PolicyDecision,
  PolicyExplanation,
  PolicyResolutionEvidence,
  MatchedRuleProvenanceEvidence,
} from './types.js';

export type OperatorFlowStep =
  | 'REQUEST'
  | 'CLASSIFICATION'
  | 'POLICY_EVALUATION'
  | 'MULTI_PACK_RESOLUTION'
  /** Machine decision after pack resolution — not human final decision. */
  | 'MACHINE_DECISION'
  /** @deprecated Prefer MACHINE_DECISION; kept for historical operator payloads. */
  | 'FINAL_DECISION'
  | 'GATEWAY_ENFORCEMENT';

export interface OperatorContributionView {
  pack_id: string;
  pack_name: string;
  pack_version?: string;
  policy_id: string;
  policy_name?: string;
  policy_version: number;
  decision: string;
  rule_ids: string[];
  obligation_ids: string[];
  obligations: string[];
  controls: Array<{ control_id: string; control_type?: string }>;
  reason_codes: string[];
  has_provenance: boolean;
  matched_rules: MatchedRuleProvenanceEvidence[];
}

export interface OperatorAuthorityView {
  source_id: string;
  authority: string;
  citation?: string;
  authority_tier?: number;
  authority_type?: string;
  legal_authority?: boolean;
  pack_ids: string[];
}

export interface OperatorDecisionExplanation {
  /**
   * Machine decision after policy/pack resolution.
   * Distinct from human_resolution.final_decision (enforceable intent after review).
   * Field name retained for API stability.
   */
  final_decision: string;
  resolution_category?: PolicyResolutionEvidence['category'];
  resolution_basis?: string;
  resolution_label: string;
  basis_label: string;
  narrative: string;
  contributing_pack_ids: string[];
  contributions: OperatorContributionView[];
  authorities: OperatorAuthorityView[];
  enforcement_controls: Array<{ control_id: string; control_type?: string }>;
  enforcement_actions: string[];
  enigma_obligations: string[];
  flow: OperatorFlowStep[];
  conflict_detail?: string;
}

const RESOLUTION_LABELS: Record<string, string> = {
  NONE: 'Single contribution',
  AGREEMENT: 'Agreement',
  COMPLEMENTARY: 'Complementary controls',
  RESTRICTIVE: 'Restrictive outcome',
  CONFLICT: 'Policy conflict',
  UNRESOLVED: 'Unresolved policy conflict',
};

const BASIS_LABELS: Record<string, string> = {
  AGREEMENT: 'Contributing policies reached the same decision.',
  COMPOSE_RESTRICTIVE:
    'Compatible outcomes were composed; the more restrictive result applies.',
  CONSEQUENCE_DENY:
    'An applicable policy required denial; permissive contributions cannot weaken that consequence.',
  DECLARED_POLICY_PRECEDENCE:
    'A declared policy precedence relationship resolved the conflict.',
  PACK_PRIORITY: 'Pack priority resolved the conflict.',
  UNRESOLVED_NO_PRECEDENCE:
    'No valid declared precedence relationship resolved the conflict.',
  SINGLE_CONTRIBUTION: 'Only one policy pack contributed to this evaluation.',
  BASELINE_ONLY: 'No applicable pack overlays contributed beyond baseline.',
};

const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1 — Primary legal authority',
  2: 'Tier 2 — Official regulatory guidance',
  3: 'Tier 3 — Federal guidance',
  4: 'Tier 4 — Implementation guidance',
  5: 'Tier 5 — Recognized standard',
  6: 'Tier 6 — Secondary',
};

/** Human label for authority tier (generic). */
export function authorityTierLabel(tier: number | undefined): string {
  if (tier == null || Number.isNaN(tier)) return 'Authority tier unknown';
  return TIER_LABELS[tier] ?? `Tier ${tier}`;
}

export function resolutionCategoryLabel(
  category: string | undefined,
): string {
  if (!category) return 'No multi-pack resolution';
  return RESOLUTION_LABELS[category] ?? category;
}

export function resolutionBasisLabel(basis: string | undefined): string {
  if (!basis) return 'Resolution basis not recorded.';
  return BASIS_LABELS[basis] ?? basis.replace(/_/g, ' ').toLowerCase();
}

function displayPackName(packId: string, packName?: string): string {
  if (packName && packName.trim()) return packName.trim();
  return packId.replace(/^pack_/, '').replace(/_/g, ' ');
}

function contributionDecisionLine(c: OperatorContributionView): string {
  const name = c.pack_name || c.pack_id;
  return `${name} evaluated to ${c.decision}`;
}

/**
 * Build a pack-agnostic narrative from structured decision data.
 * Never hard-codes regulatory authority names.
 */
export function buildOperatorNarrative(
  decision: string,
  resolution: PolicyResolutionEvidence | undefined,
  contributions: OperatorContributionView[],
): string {
  if (!resolution || contributions.length === 0) {
    return `Enigma decided ${decision} based on the applicable policy evaluation.`;
  }

  const lines = contributions.map(contributionDecisionLine);
  const category = resolution.category;

  if (category === 'AGREEMENT') {
    return (
      `Independent contributing policies agreed on the decision. ` +
      `${lines.join('; ')}. ` +
      `Machine decision: ${decision}.`
    );
  }

  if (category === 'COMPLEMENTARY') {
    return (
      `Contributing policies produced compatible allow/transform outcomes with distinct controls. ` +
      `${lines.join('; ')}. ` +
      `Compatible controls were combined. Machine decision: ${decision}.`
    );
  }

  if (category === 'RESTRICTIVE' && resolution.basis === 'CONSEQUENCE_DENY') {
    return (
      `An applicable policy required denial. ` +
      `${lines.join('; ')}. ` +
      `Permissive contributions cannot weaken an explicit denial consequence. Machine decision: ${decision}.`
    );
  }

  if (category === 'RESTRICTIVE') {
    return (
      `One or more contributing policies imposed additional restrictions. ` +
      `${lines.join('; ')}. ` +
      `Enigma composed the more restrictive compatible outcome. Machine decision: ${decision}.`
    );
  }

  if (category === 'CONFLICT' && resolution.basis === 'DECLARED_POLICY_PRECEDENCE') {
    return (
      `Contributing policies produced incompatible decisions. ` +
      `${lines.join('; ')}. ` +
      `A declared policy precedence relationship resolved the conflict. Machine decision: ${decision}.`
    );
  }

  if (category === 'UNRESOLVED' || category === 'CONFLICT') {
    return (
      `Contributing policies produced incompatible decisions. ` +
      `${lines.join('; ')}. ` +
      `No declared precedence relationship resolves the conflict, so Enigma fails safely to ${decision}.`
    );
  }

  if (category === 'NONE') {
    return (
      `A single policy pack contributed to this evaluation. ` +
      `${lines.join('; ')}. Machine decision: ${decision}.`
    );
  }

  return (
    `${resolution.detail || 'Multi-pack resolution applied'}. ` +
    `${lines.join('; ')}. Machine decision: ${decision}.`
  );
}

function rulesForContribution(
  ruleIds: string[],
  provenanceRules: MatchedRuleProvenanceEvidence[] | undefined,
): MatchedRuleProvenanceEvidence[] {
  if (!provenanceRules?.length) return [];
  if (!ruleIds.length) return [];
  const set = new Set(ruleIds);
  return provenanceRules.filter((r) => set.has(r.rule_id));
}

function packIdsForSource(
  sourceId: string,
  contributions: OperatorContributionView[],
): string[] {
  const packs = new Set<string>();
  for (const c of contributions) {
    if (c.matched_rules.some((r) => r.source_ids.includes(sourceId))) {
      packs.add(c.pack_id);
    }
  }
  return [...packs];
}

/**
 * Project a PolicyDecision into an operator-facing explanation view model.
 */
export function buildOperatorDecisionExplanation(
  decision: PolicyDecision,
): OperatorDecisionExplanation {
  const resolution = decision.explanation.resolution;
  const provenance = decision.explanation.provenance;

  const contributions: OperatorContributionView[] = (
    resolution?.contributions ?? []
  ).map((c) => {
    const matched = rulesForContribution(c.rule_ids, provenance?.matched_rules);
    const packName = displayPackName(c.pack_id, c.pack_name);
    return {
      pack_id: c.pack_id,
      pack_name: packName,
      pack_version: c.pack_version,
      policy_id: c.policy_id,
      policy_name: c.policy_name,
      policy_version: c.policy_version,
      decision: c.decision,
      rule_ids: c.rule_ids,
      obligation_ids: c.obligation_ids,
      obligations: c.obligations ?? [],
      controls: c.controls ?? [],
      reason_codes: c.reason_codes ?? [],
      has_provenance: matched.length > 0,
      matched_rules: matched,
    };
  });

  // Fallback: single-pack path without resolution.contributions
  if (contributions.length === 0 && decision.applicable_policies.length > 0) {
    const primary = decision.applicable_policies[0]!;
    contributions.push({
      pack_id: primary.pack_id ?? 'unknown',
      pack_name: displayPackName(primary.pack_id ?? 'unknown', primary.name),
      policy_id: primary.policy_id,
      policy_name: primary.name,
      policy_version: primary.version,
      decision: decision.decision,
      rule_ids: provenance?.matched_rules.map((r) => r.rule_id) ?? [],
      obligation_ids:
        provenance?.matched_rules.flatMap((r) => r.obligation_ids) ?? [],
      obligations: decision.obligations.map((o) => o.code),
      controls: provenance?.controls ?? [],
      reason_codes: decision.reason_codes,
      has_provenance: (provenance?.matched_rules.length ?? 0) > 0,
      matched_rules: provenance?.matched_rules ?? [],
    });
  }

  const authorities: OperatorAuthorityView[] = (provenance?.sources ?? []).map(
    (s) => ({
      source_id: s.source_id,
      authority: s.authority,
      citation: s.citation,
      authority_tier: s.authority_tier,
      authority_type: s.authority_type,
      legal_authority: s.legal_authority,
      pack_ids: packIdsForSource(s.source_id, contributions),
    }),
  );

  const multiPack =
    (resolution?.contributing_pack_ids.length ?? 0) > 1 ||
    contributions.length > 1;

  const flow: OperatorFlowStep[] = multiPack
    ? [
        'REQUEST',
        'CLASSIFICATION',
        'POLICY_EVALUATION',
        'MULTI_PACK_RESOLUTION',
        'MACHINE_DECISION',
        'GATEWAY_ENFORCEMENT',
      ]
    : [
        'REQUEST',
        'CLASSIFICATION',
        'POLICY_EVALUATION',
        'MACHINE_DECISION',
        'GATEWAY_ENFORCEMENT',
      ];

  const category = resolution?.category;
  const basis = resolution?.basis;

  return {
    final_decision: decision.decision,
    resolution_category: category,
    resolution_basis: basis,
    resolution_label: resolutionCategoryLabel(category),
    basis_label: resolutionBasisLabel(basis),
    narrative: buildOperatorNarrative(
      decision.decision,
      resolution,
      contributions,
    ),
    contributing_pack_ids:
      resolution?.contributing_pack_ids ??
      contributions.map((c) => c.pack_id),
    contributions,
    authorities,
    enforcement_controls: provenance?.controls ?? [],
    enforcement_actions: provenance?.enforcement?.actions ?? [],
    enigma_obligations: decision.obligations.map((o) => o.code),
    flow,
    conflict_detail: resolution?.detail,
  };
}

/** Attach operator explanation onto a PolicyExplanation (mutates copy). */
export function withOperatorExplanation(
  decision: PolicyDecision,
): PolicyDecision {
  const operator = buildOperatorDecisionExplanation(decision);
  const explanation: PolicyExplanation = {
    ...decision.explanation,
    operator,
  };
  return { ...decision, explanation };
}
