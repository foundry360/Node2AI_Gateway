import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  ISO_23894_PACK_META,
  ISO_23894_PROVENANCE_GRAPH,
  ISO_23894_RULES,
  type Iso23894CompiledRule,
} from './compiled-bundle.js';
import { loadIso23894PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadIso23894PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : ISO_23894_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? ISO_23894_PROVENANCE_GRAPH;

export type Iso23894PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

/**
 * Derive ISO 23894-informed risk-management gates from generic
 * governance_context.ai_risk. Missing attestation → false → REVIEW.
 * Distinct from ISO 42001 management_system gates.
 */
export function deriveIso23894RiskGates(facts: Iso23894PackFacts): {
  risk_management_established: boolean;
  risk_context_defined: boolean;
  risk_identification_completed: boolean;
  risk_analysis_completed: boolean;
  risk_evaluation_completed: boolean;
  risk_treatment_established: boolean;
  residual_risk_accepted: boolean;
  risk_monitoring_established: boolean;
  risk_communication_established: boolean;
  risk_review_established: boolean;
} {
  const ar = facts.governance_context?.ai_risk;
  return {
    risk_management_established: ar?.risk_management_established === true,
    risk_context_defined: ar?.risk_context_defined === true,
    risk_identification_completed: ar?.risk_identification_completed === true,
    risk_analysis_completed: ar?.risk_analysis_completed === true,
    risk_evaluation_completed: ar?.risk_evaluation_completed === true,
    risk_treatment_established:
      ar?.risk_treatment_defined === true && ar?.risk_treatment_implemented === true,
    residual_risk_accepted: ar?.residual_risk_accepted === true,
    risk_monitoring_established: ar?.risk_monitoring_established === true,
    risk_communication_established: ar?.risk_communication_established === true,
    risk_review_established: ar?.risk_review_established === true,
  };
}

function isoApplicable(facts: Iso23894PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('ISO_23894');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: Iso23894CompiledRule,
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
        matched: [...matched, 'iso_23894_review_skipped_prior_deny'],
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
  rule: Iso23894CompiledRule,
  facts: Iso23894PackFacts,
  gates: ReturnType<typeof deriveIso23894RiskGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'ISO_23894' && !isoApplicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'risk_management_established',
    'risk_context_defined',
    'risk_identification_completed',
    'risk_analysis_completed',
    'risk_evaluation_completed',
    'risk_treatment_established',
    'residual_risk_accepted',
    'risk_monitoring_established',
    'risk_communication_established',
    'risk_review_established',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: Iso23894CompiledRule, facts: Iso23894PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'ISO_23894' && !isoApplicable(facts)) return false;
  return true;
}

export function applyIso23894PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_23894_PACK_META.input_policy_id,
    version: ISO_23894_PACK_META.input_version,
    pack_id: ISO_23894_PACK_META.pack_id,
    name: 'ISO/IEC 23894 input governance',
    phase: 'input',
    status: 'active',
    interpreter: ISO_23894_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const isoFacts = facts as Iso23894PackFacts;
  if (!isoApplicable(isoFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_23894_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveIso23894RiskGates(isoFacts);
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

export function applyIso23894PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_23894_PACK_META.output_policy_id,
    version: ISO_23894_PACK_META.output_version,
    pack_id: ISO_23894_PACK_META.pack_id,
    name: 'ISO/IEC 23894 output governance',
    phase: 'output',
    status: 'active',
    interpreter: ISO_23894_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const isoFacts = facts as Iso23894PackFacts;
  if (!isoApplicable(isoFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_23894_pack_v1_output_skip_not_applicable'],
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
