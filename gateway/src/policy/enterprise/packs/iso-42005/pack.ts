import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  ISO_42005_PACK_META,
  ISO_42005_PROVENANCE_GRAPH,
  ISO_42005_RULES,
  type Iso42005CompiledRule,
} from './compiled-bundle.js';
import { loadIso42005PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadIso42005PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : ISO_42005_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? ISO_42005_PROVENANCE_GRAPH;

export type Iso42005PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

/**
 * Derive ISO 42005-informed impact-assessment gates from generic
 * governance_context.impact. Missing attestation → false → REVIEW.
 * Distinct from ISO 42001 management_system and ISO 23894 ai_risk gates.
 */
export function deriveIso42005ImpactGates(facts: Iso42005PackFacts): {
  impact_scope_defined: boolean;
  affected_stakeholders_identified: boolean;
  potential_impacts_identified: boolean;
  impact_assessment_completed: boolean;
  impact_severity_assessed: boolean;
  impact_likelihood_assessed: boolean;
  mitigations_defined: boolean;
  mitigations_implemented: boolean;
  residual_impact_reviewed: boolean;
  impact_monitoring_established: boolean;
  impact_review_established: boolean;
} {
  const impact = facts.governance_context?.impact;
  return {
    impact_scope_defined: impact?.impact_scope_defined === true,
    affected_stakeholders_identified: impact?.affected_stakeholders_identified === true,
    potential_impacts_identified: impact?.potential_impacts_identified === true,
    impact_assessment_completed: impact?.impact_assessment_completed === true,
    impact_severity_assessed: impact?.impact_severity_assessed === true,
    impact_likelihood_assessed: impact?.impact_likelihood_assessed === true,
    mitigations_defined: impact?.mitigations_defined === true,
    mitigations_implemented: impact?.mitigations_implemented === true,
    residual_impact_reviewed: impact?.residual_impact_reviewed === true,
    impact_monitoring_established: impact?.impact_monitoring_established === true,
    impact_review_established: impact?.impact_review_established === true,
  };
}

function isoApplicable(facts: Iso42005PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('ISO_42005');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: Iso42005CompiledRule,
  meta: PackPolicyMeta,
  current: InterpretedResult,
): InterpretedResult {
  const matched = [
    ...current.matched,
    rule.rule_id,
    ...(rule.obligation_ids ?? []).map((id) => `obligation:${id}`),
    ...(rule.control_ids ?? []).map((id) => `control:${id}`),
    ...(rule.sources ?? []).map((id) => `source:${id}`),
    ...(rule.requirement_type ? [`requirement_type:${rule.requirement_type}`] : []),
  ];

  const enforcementActions = [...(rule.enigma_obligations ?? [])];
  if (rule.decision === 'REVIEW') enforcementActions.push('REVIEW');

  const provenance = appendRuleProvenance(
    current.provenance,
    {
      rule_id: rule.rule_id,
      obligation_ids: rule.obligation_ids,
      sources: rule.sources,
      control_ids: rule.control_ids,
      requirement_type: rule.requirement_type,
    },
    provenanceGraph,
    enforcementActions,
  );

  if (rule.decision === 'REVIEW') {
    if (current.decision === 'DENY') {
      return {
        ...current,
        matched: [...matched, 'iso_42005_review_skipped_prior_deny'],
        provenance: appendRuleProvenance(
          current.provenance,
          {
            rule_id: rule.rule_id,
            obligation_ids: rule.obligation_ids,
            sources: rule.sources,
            control_ids: rule.control_ids,
            requirement_type: rule.requirement_type,
          },
          provenanceGraph,
          ['LOG_GOVERNANCE_EVENT'],
        ),
        obligations: mergeObligations(current.obligations, ['LOG_GOVERNANCE_EVENT']),
        reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      };
    }
    return {
      ...current,
      decision: 'REVIEW',
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      eligible_models: [],
      transforms: [],
      obligations: mergeObligations(current.obligations, rule.enigma_obligations),
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
      provenance,
    };
  }

  if (rule.decision === 'ALLOW_WITH_CONTROLS') {
    return {
      ...current,
      decision:
        current.decision === 'DENY' || current.decision === 'REVIEW'
          ? current.decision
          : current.decision === 'TOKENIZE'
            ? 'TOKENIZE'
            : 'ALLOW',
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      obligations: mergeObligations(current.obligations, rule.enigma_obligations),
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
      provenance,
    };
  }

  return { ...current, matched, provenance };
}

function matchInputRule(
  rule: Iso42005CompiledRule,
  facts: Iso42005PackFacts,
  gates: ReturnType<typeof deriveIso42005ImpactGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'ISO_42005' && !isoApplicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'impact_scope_defined',
    'affected_stakeholders_identified',
    'potential_impacts_identified',
    'impact_assessment_completed',
    'impact_severity_assessed',
    'impact_likelihood_assessed',
    'mitigations_defined',
    'mitigations_implemented',
    'residual_impact_reviewed',
    'impact_monitoring_established',
    'impact_review_established',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: Iso42005CompiledRule, facts: Iso42005PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'ISO_42005' && !isoApplicable(facts)) return false;
  return true;
}

export function applyIso42005PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_42005_PACK_META.input_policy_id,
    version: ISO_42005_PACK_META.input_version,
    pack_id: ISO_42005_PACK_META.pack_id,
    name: 'ISO/IEC 42005 input governance',
    phase: 'input',
    status: 'active',
    interpreter: ISO_42005_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const isoFacts = facts as Iso42005PackFacts;
  if (!isoApplicable(isoFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_42005_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveIso42005ImpactGates(isoFacts);
  const inputRules = [...rulesBundle]
    .filter((r) => r.phase === 'input')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of inputRules) {
    if (!matchInputRule(rule, isoFacts, gates)) continue;
    result = applyRule(rule, meta, result);
    if (result.decision === 'REVIEW' || result.decision === 'DENY') break;
  }
  return result;
}

export function applyIso42005PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_42005_PACK_META.output_policy_id,
    version: ISO_42005_PACK_META.output_version,
    pack_id: ISO_42005_PACK_META.pack_id,
    name: 'ISO/IEC 42005 output governance',
    phase: 'output',
    status: 'active',
    interpreter: ISO_42005_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const isoFacts = facts as Iso42005PackFacts;
  if (!isoApplicable(isoFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_42005_pack_v1_output_skip_not_applicable'],
    };
  }

  const outputRules = [...rulesBundle]
    .filter((r) => r.phase === 'output')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of outputRules) {
    if (!matchOutputRule(rule, isoFacts)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
