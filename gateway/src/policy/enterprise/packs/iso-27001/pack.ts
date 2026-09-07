import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  ISO_27001_PACK_META,
  ISO_27001_PROVENANCE_GRAPH,
  ISO_27001_RULES,
  type Iso27001CompiledRule,
} from './compiled-bundle.js';
import { loadIso27001PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadIso27001PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : ISO_27001_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? ISO_27001_PROVENANCE_GRAPH;

export type Iso27001PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

/**
 * Derive ISO/IEC 27001-informed gates from governance_context.information_security.
 * Residual-risk review ≠ Enigma AUTHORIZE for a held request.
 */
export function deriveIso27001Gates(facts: Iso27001PackFacts): {
  isms_context: boolean;
  risk_process: boolean;
  risk_treatment: boolean;
  assets: boolean;
  access: boolean;
  operations: boolean;
  supplier: boolean;
  incident: boolean;
  continuity: boolean;
  people: boolean;
  monitoring: boolean;
  improvement: boolean;
} {
  const is = facts.governance_context?.information_security;
  return {
    isms_context:
      is?.isms?.scope_defined === true &&
      is?.isms?.context_established === true &&
      is?.isms?.interested_parties_identified === true &&
      is?.isms?.information_security_objectives_defined === true,
    risk_process:
      is?.risk?.risk_process_established === true &&
      is?.risk?.risks_identified === true &&
      is?.risk?.risks_assessed === true,
    risk_treatment:
      is?.risk?.risk_treatment_defined === true &&
      is?.risk?.risk_treatment_implemented === true &&
      is?.risk?.residual_risk_reviewed === true,
    assets:
      is?.information_assets?.assets_identified === true &&
      is?.information_assets?.information_classification_defined === true &&
      is?.information_assets?.asset_ownership_defined === true,
    access:
      is?.access?.access_control_defined === true &&
      is?.access?.identity_management_established === true &&
      is?.access?.privileged_access_controlled === true &&
      is?.access?.access_review_established === true,
    operations:
      is?.operations?.operational_controls_established === true &&
      is?.operations?.change_management_established === true &&
      is?.operations?.logging_monitoring_established === true &&
      is?.operations?.backup_recovery_established === true,
    supplier:
      is?.supplier_security?.supplier_risk_controls_established === true &&
      is?.supplier_security?.third_party_security_requirements_defined === true &&
      is?.supplier_security?.supplier_monitoring_established === true,
    incident:
      is?.incident?.incident_management_established === true &&
      is?.incident?.incident_response_defined === true &&
      is?.incident?.incident_learning_established === true,
    continuity:
      is?.continuity?.business_continuity_security_defined === true &&
      is?.continuity?.resilience_controls_established === true &&
      is?.continuity?.recovery_capability_established === true,
    people:
      is?.people?.security_roles_defined === true &&
      is?.people?.security_awareness_established === true &&
      is?.people?.personnel_security_controls_established === true,
    monitoring:
      is?.monitoring?.security_performance_monitored === true &&
      is?.monitoring?.internal_review_established === true &&
      is?.monitoring?.management_review_established === true,
    improvement:
      is?.improvement?.nonconformities_managed === true &&
      is?.improvement?.corrective_actions_managed === true &&
      is?.improvement?.continual_improvement_established === true,
  };
}

function iso27001Applicable(facts: Iso27001PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('ISO_27001');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: Iso27001CompiledRule,
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
        matched: [...matched, 'iso_27001_review_skipped_prior_deny'],
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
  rule: Iso27001CompiledRule,
  facts: Iso27001PackFacts,
  gates: ReturnType<typeof deriveIso27001Gates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'ISO_27001' && !iso27001Applicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'isms_context',
    'risk_process',
    'risk_treatment',
    'assets',
    'access',
    'operations',
    'supplier',
    'incident',
    'continuity',
    'people',
    'monitoring',
    'improvement',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: Iso27001CompiledRule, facts: Iso27001PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'ISO_27001' && !iso27001Applicable(facts)) return false;
  return true;
}

export function applyIso27001PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_27001_PACK_META.input_policy_id,
    version: ISO_27001_PACK_META.input_version,
    pack_id: ISO_27001_PACK_META.pack_id,
    name: 'ISO/IEC 27001 input governance',
    phase: 'input',
    status: 'active',
    interpreter: ISO_27001_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const packFacts = facts as Iso27001PackFacts;
  if (!iso27001Applicable(packFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_27001_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveIso27001Gates(packFacts);
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

export function applyIso27001PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_27001_PACK_META.output_policy_id,
    version: ISO_27001_PACK_META.output_version,
    pack_id: ISO_27001_PACK_META.pack_id,
    name: 'ISO/IEC 27001 output governance',
    phase: 'output',
    status: 'active',
    interpreter: ISO_27001_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const packFacts = facts as Iso27001PackFacts;
  if (!iso27001Applicable(packFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_27001_pack_v1_output_skip_not_applicable'],
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
