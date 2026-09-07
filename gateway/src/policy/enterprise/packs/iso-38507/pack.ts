import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  ISO_38507_PACK_META,
  ISO_38507_PROVENANCE_GRAPH,
  ISO_38507_RULES,
  type Iso38507CompiledRule,
} from './compiled-bundle.js';
import { loadIso38507PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadIso38507PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : ISO_38507_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? ISO_38507_PROVENANCE_GRAPH;

export type Iso38507PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

/**
 * Derive ISO/IEC 38507-informed gates from governance_context.organizational_governance.
 * Organizational evidence ≠ Enigma AUTHORIZE for a held request.
 */
export function deriveIso38507Gates(facts: Iso38507PackFacts): {
  accountability: boolean;
  executive_accountability: boolean;
  governance_direction: boolean;
  strategic_alignment: boolean;
  decision_rights: boolean;
  oversight: boolean;
  stakeholder: boolean;
  stakeholder_impact: boolean;
  human_accountability: boolean;
  escalation: boolean;
  governance_monitoring: boolean;
} {
  const og = facts.governance_context?.organizational_governance;
  return {
    accountability:
      og?.accountability?.governing_body_accountable === true &&
      og?.accountability?.ai_responsibilities_defined === true,
    executive_accountability:
      og?.accountability?.executive_accountability_defined === true,
    governance_direction:
      og?.direction?.ai_governance_policy_defined === true &&
      og?.direction?.acceptable_use_direction_defined === true,
    strategic_alignment: og?.direction?.strategic_alignment_documented === true,
    decision_rights: og?.oversight?.decision_rights_defined === true,
    oversight:
      og?.oversight?.ai_oversight_established === true &&
      og?.oversight?.reporting_path_defined === true,
    stakeholder: og?.stakeholder?.relevant_stakeholders_identified === true,
    stakeholder_impact:
      og?.stakeholder?.stakeholder_impacts_considered === true &&
      og?.stakeholder?.stakeholder_communication_defined === true,
    human_accountability:
      og?.decision_governance?.human_accountability_defined === true,
    escalation: og?.decision_governance?.escalation_path_defined === true,
    governance_monitoring:
      og?.organizational_effectiveness?.performance_monitoring_established === true &&
      og?.organizational_effectiveness?.governance_review_established === true,
  };
}

function iso38507Applicable(facts: Iso38507PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('ISO_38507');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: Iso38507CompiledRule,
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
        matched: [...matched, 'iso_38507_review_skipped_prior_deny'],
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
  rule: Iso38507CompiledRule,
  facts: Iso38507PackFacts,
  gates: ReturnType<typeof deriveIso38507Gates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'ISO_38507' && !iso38507Applicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'accountability',
    'executive_accountability',
    'governance_direction',
    'strategic_alignment',
    'decision_rights',
    'oversight',
    'stakeholder',
    'stakeholder_impact',
    'human_accountability',
    'escalation',
    'governance_monitoring',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: Iso38507CompiledRule, facts: Iso38507PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'ISO_38507' && !iso38507Applicable(facts)) return false;
  return true;
}

export function applyIso38507PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_38507_PACK_META.input_policy_id,
    version: ISO_38507_PACK_META.input_version,
    pack_id: ISO_38507_PACK_META.pack_id,
    name: 'ISO/IEC 38507 input governance',
    phase: 'input',
    status: 'active',
    interpreter: ISO_38507_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const packFacts = facts as Iso38507PackFacts;
  if (!iso38507Applicable(packFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_38507_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveIso38507Gates(packFacts);
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

export function applyIso38507PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_38507_PACK_META.output_policy_id,
    version: ISO_38507_PACK_META.output_version,
    pack_id: ISO_38507_PACK_META.pack_id,
    name: 'ISO/IEC 38507 output governance',
    phase: 'output',
    status: 'active',
    interpreter: ISO_38507_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const packFacts = facts as Iso38507PackFacts;
  if (!iso38507Applicable(packFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_38507_pack_v1_output_skip_not_applicable'],
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
