import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  NIST_CSF_2_PACK_META,
  NIST_CSF_2_PROVENANCE_GRAPH,
  NIST_CSF_2_RULES,
  type NistCsf2CompiledRule,
} from './compiled-bundle.js';
import { loadNistCsf2PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadNistCsf2PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : NIST_CSF_2_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? NIST_CSF_2_PROVENANCE_GRAPH;

export type NistCsf2PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

/**
 * Derive NIST CSF 2.0-informed gates from generic governance_context.cybersecurity.
 * Nested CSF Functions flatten to decision-relevant boolean evidence families.
 */
export function deriveNistCsf2Gates(facts: NistCsf2PackFacts): {
  govern_accountability: boolean;
  govern_policy: boolean;
  identify_assets: boolean;
  identify_risk: boolean;
  protect_access: boolean;
  protect_data: boolean;
  detect_monitoring: boolean;
  detect_events: boolean;
  respond_plan: boolean;
  respond_communication: boolean;
  recover_plan: boolean;
  recover_improvement: boolean;
} {
  const cs = facts.governance_context?.cybersecurity;
  return {
    govern_accountability: cs?.govern?.accountability_documented === true,
    govern_policy:
      cs?.govern?.cybersecurity_roles_defined === true &&
      cs?.govern?.cybersecurity_policy_documented === true,
    identify_assets:
      cs?.identify?.assets_identified === true &&
      cs?.identify?.dependencies_identified === true,
    identify_risk: cs?.identify?.cybersecurity_risk_identified === true,
    protect_access:
      cs?.protect?.access_controls_documented === true &&
      cs?.protect?.safeguards_implemented === true,
    protect_data: cs?.protect?.data_protection_documented === true,
    detect_monitoring: cs?.detect?.monitoring_established === true,
    detect_events:
      cs?.detect?.anomalous_activity_detection === true &&
      cs?.detect?.cybersecurity_events_logged === true,
    respond_plan:
      cs?.respond?.response_plan_documented === true &&
      cs?.respond?.incident_response_process === true,
    respond_communication: cs?.respond?.communication_process === true,
    recover_plan:
      cs?.recover?.recovery_plan_documented === true &&
      cs?.recover?.recovery_process === true,
    recover_improvement: cs?.recover?.lessons_learned_process === true,
  };
}

function csfApplicable(facts: NistCsf2PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('NIST_CSF_2');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: NistCsf2CompiledRule,
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
        matched: [...matched, 'nist_csf_2_review_skipped_prior_deny'],
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
  rule: NistCsf2CompiledRule,
  facts: NistCsf2PackFacts,
  gates: ReturnType<typeof deriveNistCsf2Gates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'NIST_CSF_2' && !csfApplicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'govern_accountability',
    'govern_policy',
    'identify_assets',
    'identify_risk',
    'protect_access',
    'protect_data',
    'detect_monitoring',
    'detect_events',
    'respond_plan',
    'respond_communication',
    'recover_plan',
    'recover_improvement',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: NistCsf2CompiledRule, facts: NistCsf2PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'NIST_CSF_2' && !csfApplicable(facts)) return false;
  return true;
}

export function applyNistCsf2PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: NIST_CSF_2_PACK_META.input_policy_id,
    version: NIST_CSF_2_PACK_META.input_version,
    pack_id: NIST_CSF_2_PACK_META.pack_id,
    name: 'NIST CSF 2.0 input governance',
    phase: 'input',
    status: 'active',
    interpreter: NIST_CSF_2_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const csfFacts = facts as NistCsf2PackFacts;
  if (!csfApplicable(csfFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'nist_csf_2_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveNistCsf2Gates(csfFacts);
  const inputRules = [...rulesBundle]
    .filter((r) => r.phase === 'input')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of inputRules) {
    if (!matchInputRule(rule, csfFacts, gates)) continue;
    result = applyRule(rule, meta, result);
    if (result.decision === 'REVIEW' || result.decision === 'DENY') break;
  }
  return result;
}

export function applyNistCsf2PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: NIST_CSF_2_PACK_META.output_policy_id,
    version: NIST_CSF_2_PACK_META.output_version,
    pack_id: NIST_CSF_2_PACK_META.pack_id,
    name: 'NIST CSF 2.0 output governance',
    phase: 'output',
    status: 'active',
    interpreter: NIST_CSF_2_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const csfFacts = facts as NistCsf2PackFacts;
  if (!csfApplicable(csfFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'nist_csf_2_pack_v1_output_skip_not_applicable'],
    };
  }

  const outputRules = [...rulesBundle]
    .filter((r) => r.phase === 'output')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of outputRules) {
    if (!matchOutputRule(rule, csfFacts)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
