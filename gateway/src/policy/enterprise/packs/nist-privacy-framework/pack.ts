import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  NIST_PRIVACY_FRAMEWORK_PACK_META,
  NIST_PRIVACY_FRAMEWORK_PROVENANCE_GRAPH,
  NIST_PRIVACY_FRAMEWORK_RULES,
  type NistPrivacyFrameworkCompiledRule,
} from './compiled-bundle.js';
import { loadNistPrivacyFrameworkPackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadNistPrivacyFrameworkPackSources();
const rulesBundle =
  packRuntime.rules.length > 0 ? packRuntime.rules : NIST_PRIVACY_FRAMEWORK_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? NIST_PRIVACY_FRAMEWORK_PROVENANCE_GRAPH;

export type NistPrivacyFrameworkPackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

/**
 * Derive NIST Privacy Framework-informed gates from governance_context.privacy.nist_pf.
 * Does not read ISO/IEC 27701 PIMS fields — frameworks remain complementary, not equivalent.
 */
export function deriveNistPrivacyFrameworkGates(facts: NistPrivacyFrameworkPackFacts): {
  identify_processing: boolean;
  identify_privacy_risk: boolean;
  identify_data_actions: boolean;
  govern_policies: boolean;
  govern_roles: boolean;
  govern_risk: boolean;
  control_data_actions: boolean;
  control_individual_choice: boolean;
  communicate_transparency: boolean;
  communicate_expectations: boolean;
  protect_privacy_risk: boolean;
} {
  const pf = facts.governance_context?.privacy?.nist_pf;
  return {
    identify_processing: pf?.identify?.processing_context_documented === true,
    identify_privacy_risk: pf?.identify?.privacy_risk_identified === true,
    identify_data_actions: pf?.identify?.data_actions_documented === true,
    govern_policies: pf?.govern?.policies_documented === true,
    govern_roles: pf?.govern?.roles_documented === true,
    govern_risk: pf?.govern?.risk_governance_documented === true,
    control_data_actions: pf?.control?.data_actions_controlled === true,
    control_individual_choice: pf?.control?.individual_choice_addressed === true,
    communicate_transparency: pf?.communicate?.transparency_documented === true,
    communicate_expectations: pf?.communicate?.expectations_documented === true,
    protect_privacy_risk: pf?.protect?.privacy_risk_mitigation_documented === true,
  };
}

function nistPfApplicable(facts: NistPrivacyFrameworkPackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('NIST_PRIVACY_FRAMEWORK');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: NistPrivacyFrameworkCompiledRule,
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
        matched: [...matched, 'nist_privacy_framework_review_skipped_prior_deny'],
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
  rule: NistPrivacyFrameworkCompiledRule,
  facts: NistPrivacyFrameworkPackFacts,
  gates: ReturnType<typeof deriveNistPrivacyFrameworkGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'NIST_PRIVACY_FRAMEWORK' && !nistPfApplicable(facts)) {
    return false;
  }

  const boolGates: Array<keyof typeof gates> = [
    'identify_processing',
    'identify_privacy_risk',
    'identify_data_actions',
    'govern_policies',
    'govern_roles',
    'govern_risk',
    'control_data_actions',
    'control_individual_choice',
    'communicate_transparency',
    'communicate_expectations',
    'protect_privacy_risk',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(
  rule: NistPrivacyFrameworkCompiledRule,
  facts: NistPrivacyFrameworkPackFacts,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'NIST_PRIVACY_FRAMEWORK' && !nistPfApplicable(facts)) {
    return false;
  }
  return true;
}

export function applyNistPrivacyFrameworkPackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: NIST_PRIVACY_FRAMEWORK_PACK_META.input_policy_id,
    version: NIST_PRIVACY_FRAMEWORK_PACK_META.input_version,
    pack_id: NIST_PRIVACY_FRAMEWORK_PACK_META.pack_id,
    name: 'NIST Privacy Framework input governance',
    phase: 'input',
    status: 'active',
    interpreter: NIST_PRIVACY_FRAMEWORK_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const packFacts = facts as NistPrivacyFrameworkPackFacts;
  if (!nistPfApplicable(packFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'nist_privacy_framework_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveNistPrivacyFrameworkGates(packFacts);
  const inputRules = [...rulesBundle]
    .filter((r) => r.phase === 'input')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of inputRules) {
    if (!matchInputRule(rule, packFacts, gates)) continue;
    result = applyRule(rule, meta, result);
    if (result.decision === 'REVIEW' || result.decision === 'DENY') break;
  }
  return result;
}

export function applyNistPrivacyFrameworkPackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: NIST_PRIVACY_FRAMEWORK_PACK_META.output_policy_id,
    version: NIST_PRIVACY_FRAMEWORK_PACK_META.output_version,
    pack_id: NIST_PRIVACY_FRAMEWORK_PACK_META.pack_id,
    name: 'NIST Privacy Framework output governance',
    phase: 'output',
    status: 'active',
    interpreter: NIST_PRIVACY_FRAMEWORK_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const packFacts = facts as NistPrivacyFrameworkPackFacts;
  if (!nistPfApplicable(packFacts)) {
    return {
      ...current,
      matched: [
        ...current.matched,
        'nist_privacy_framework_pack_v1_output_skip_not_applicable',
      ],
    };
  }

  const outputRules = [...rulesBundle]
    .filter((r) => r.phase === 'output')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of outputRules) {
    if (!matchOutputRule(rule, packFacts)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
