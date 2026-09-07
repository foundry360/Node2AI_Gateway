import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  ISO_42001_PACK_META,
  ISO_42001_PROVENANCE_GRAPH,
  ISO_42001_RULES,
  type Iso42001CompiledRule,
} from './compiled-bundle.js';
import { loadIso42001PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadIso42001PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : ISO_42001_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? ISO_42001_PROVENANCE_GRAPH;

export type Iso42001PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

/**
 * Derive ISO 42001-informed management-system gates from generic
 * governance_context.management_system. Missing attestation → false → REVIEW.
 */
export function deriveIso42001ManagementGates(facts: Iso42001PackFacts): {
  aims_governance_established: boolean;
  ai_system_inventory_documented: boolean;
  risk_management_established: boolean;
  impact_assessment_completed: boolean;
  data_governance_established: boolean;
  human_oversight_defined: boolean;
  operational_controls_defined: boolean;
  monitoring_evaluation_established: boolean;
  incident_process_established: boolean;
  continual_improvement_process_established: boolean;
} {
  const ms = facts.governance_context?.management_system;
  return {
    aims_governance_established:
      ms?.ai_policy_established === true &&
      ms?.roles_responsibilities_documented === true,
    ai_system_inventory_documented: ms?.ai_system_inventory_documented === true,
    risk_management_established:
      ms?.risk_process_established === true &&
      ms?.risk_assessment_completed === true &&
      ms?.risk_treatment_documented === true,
    impact_assessment_completed: ms?.impact_assessment_completed === true,
    data_governance_established: ms?.data_governance_established === true,
    human_oversight_defined: ms?.human_oversight_defined === true,
    operational_controls_defined: ms?.operational_controls_defined === true,
    monitoring_evaluation_established:
      ms?.monitoring_established === true &&
      ms?.performance_evaluation_established === true,
    incident_process_established: ms?.incident_process_established === true,
    continual_improvement_process_established:
      ms?.continual_improvement_process_established === true,
  };
}

function isoApplicable(facts: Iso42001PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('ISO_42001');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: Iso42001CompiledRule,
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
        matched: [...matched, 'iso_42001_review_skipped_prior_deny'],
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
  rule: Iso42001CompiledRule,
  facts: Iso42001PackFacts,
  gates: ReturnType<typeof deriveIso42001ManagementGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'ISO_42001' && !isoApplicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'aims_governance_established',
    'ai_system_inventory_documented',
    'risk_management_established',
    'impact_assessment_completed',
    'data_governance_established',
    'human_oversight_defined',
    'operational_controls_defined',
    'monitoring_evaluation_established',
    'incident_process_established',
    'continual_improvement_process_established',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: Iso42001CompiledRule, facts: Iso42001PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'ISO_42001' && !isoApplicable(facts)) return false;
  return true;
}

export function applyIso42001PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_42001_PACK_META.input_policy_id,
    version: ISO_42001_PACK_META.input_version,
    pack_id: ISO_42001_PACK_META.pack_id,
    name: 'ISO/IEC 42001 input governance',
    phase: 'input',
    status: 'active',
    interpreter: ISO_42001_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const isoFacts = facts as Iso42001PackFacts;
  if (!isoApplicable(isoFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_42001_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveIso42001ManagementGates(isoFacts);
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

export function applyIso42001PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_42001_PACK_META.output_policy_id,
    version: ISO_42001_PACK_META.output_version,
    pack_id: ISO_42001_PACK_META.pack_id,
    name: 'ISO/IEC 42001 output governance',
    phase: 'output',
    status: 'active',
    interpreter: ISO_42001_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const isoFacts = facts as Iso42001PackFacts;
  if (!isoApplicable(isoFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_42001_pack_v1_output_skip_not_applicable'],
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
