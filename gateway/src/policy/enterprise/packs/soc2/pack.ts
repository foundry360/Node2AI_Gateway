import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  SOC2_PACK_META,
  SOC2_PROVENANCE_GRAPH,
  SOC2_RULES,
  type Soc2CompiledRule,
} from './compiled-bundle.js';
import { loadSoc2PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadSoc2PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : SOC2_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? SOC2_PROVENANCE_GRAPH;

export type Soc2PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

/**
 * Derive SOC 2-informed assurance gates from generic governance_context.assurance.
 * Missing attestation → false → REVIEW (except privacy, which requires applicability).
 */
export function deriveSoc2AssuranceGates(facts: Soc2PackFacts): {
  control_environment_documented: boolean;
  access_controls_verified: boolean;
  change_management_controls_verified: boolean;
  logical_access_controls_verified: boolean;
  data_protection_controls_verified: boolean;
  system_monitoring_controls_verified: boolean;
  incident_response_controls_verified: boolean;
  availability_controls_verified: boolean;
  processing_integrity_controls_verified: boolean;
  confidentiality_controls_verified: boolean;
  privacy_category_applicable: boolean;
  privacy_controls_verified: boolean;
} {
  const a = facts.governance_context?.assurance;
  return {
    control_environment_documented: a?.control_environment_documented === true,
    access_controls_verified: a?.access_controls_verified === true,
    change_management_controls_verified: a?.change_management_controls_verified === true,
    logical_access_controls_verified: a?.logical_access_controls_verified === true,
    data_protection_controls_verified: a?.data_protection_controls_verified === true,
    system_monitoring_controls_verified: a?.system_monitoring_controls_verified === true,
    incident_response_controls_verified: a?.incident_response_controls_verified === true,
    availability_controls_verified: a?.availability_controls_verified === true,
    processing_integrity_controls_verified: a?.processing_integrity_controls_verified === true,
    confidentiality_controls_verified: a?.confidentiality_controls_verified === true,
    privacy_category_applicable: a?.privacy_category_applicable === true,
    privacy_controls_verified: a?.privacy_controls_verified === true,
  };
}

function soc2Applicable(facts: Soc2PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('SOC_2');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: Soc2CompiledRule,
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
        matched: [...matched, 'soc2_review_skipped_prior_deny'],
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
  rule: Soc2CompiledRule,
  facts: Soc2PackFacts,
  gates: ReturnType<typeof deriveSoc2AssuranceGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'SOC_2' && !soc2Applicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'control_environment_documented',
    'access_controls_verified',
    'change_management_controls_verified',
    'logical_access_controls_verified',
    'data_protection_controls_verified',
    'system_monitoring_controls_verified',
    'incident_response_controls_verified',
    'availability_controls_verified',
    'processing_integrity_controls_verified',
    'confidentiality_controls_verified',
    'privacy_category_applicable',
    'privacy_controls_verified',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: Soc2CompiledRule, facts: Soc2PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'SOC_2' && !soc2Applicable(facts)) return false;
  return true;
}

export function applySoc2PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: SOC2_PACK_META.input_policy_id,
    version: SOC2_PACK_META.input_version,
    pack_id: SOC2_PACK_META.pack_id,
    name: 'SOC 2 input governance',
    phase: 'input',
    status: 'active',
    interpreter: SOC2_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const soc2Facts = facts as Soc2PackFacts;
  if (!soc2Applicable(soc2Facts)) {
    return {
      ...current,
      matched: [...current.matched, 'soc2_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveSoc2AssuranceGates(soc2Facts);
  const inputRules = [...rulesBundle]
    .filter((r) => r.phase === 'input')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of inputRules) {
    if (!matchInputRule(rule, soc2Facts, gates)) continue;
    result = applyRule(rule, meta, result);
    if (result.decision === 'REVIEW' || result.decision === 'DENY') break;
  }
  return result;
}

export function applySoc2PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: SOC2_PACK_META.output_policy_id,
    version: SOC2_PACK_META.output_version,
    pack_id: SOC2_PACK_META.pack_id,
    name: 'SOC 2 output governance',
    phase: 'output',
    status: 'active',
    interpreter: SOC2_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const soc2Facts = facts as Soc2PackFacts;
  if (!soc2Applicable(soc2Facts)) {
    return {
      ...current,
      matched: [...current.matched, 'soc2_pack_v1_output_skip_not_applicable'],
    };
  }

  const outputRules = [...rulesBundle]
    .filter((r) => r.phase === 'output')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of outputRules) {
    if (!matchOutputRule(rule, soc2Facts)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
