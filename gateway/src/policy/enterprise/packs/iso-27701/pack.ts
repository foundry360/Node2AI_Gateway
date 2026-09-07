import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  ISO_27701_PACK_META,
  ISO_27701_PROVENANCE_GRAPH,
  ISO_27701_RULES,
  type Iso27701CompiledRule,
} from './compiled-bundle.js';
import { loadIso27701PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadIso27701PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : ISO_27701_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? ISO_27701_PROVENANCE_GRAPH;

export type Iso27701PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

const DEFINED_PROCESSING_ROLES = new Set([
  'controller',
  'processor',
  'joint_controller',
  'other_defined_role',
]);

/**
 * Derive ISO/IEC 27701-informed gates from governance_context.privacy.
 * Residual privacy-risk review ≠ Enigma AUTHORIZE for a held request.
 * Distinct from information_security — privacy is not just data security.
 */
export function deriveIso27701Gates(facts: Iso27701PackFacts): {
  pims: boolean;
  pii_processing: boolean;
  privacy_risk: boolean;
  privacy_impact: boolean;
  data_lifecycle: boolean;
  transparency: boolean;
  privacy_rights: boolean;
  controller_processor: boolean;
  third_party: boolean;
  privacy_incident: boolean;
  monitoring: boolean;
  improvement: boolean;
} {
  const p = facts.governance_context?.privacy;
  const role = p?.processing_role;
  const roleDefined =
    p?.pii_governance?.controller_processor_role_defined === true ||
    (typeof role === 'string' && DEFINED_PROCESSING_ROLES.has(role));
  const roleUnknown = role === 'unknown';
  const purposeUnknown = p?.purpose_status === 'unknown';

  return {
    pims:
      p?.pims?.scope_defined === true &&
      p?.pims?.privacy_context_established === true &&
      p?.pims?.roles_responsibilities_defined === true &&
      p?.pims?.privacy_objectives_defined === true,
    pii_processing:
      p?.pii_governance?.pii_processing_inventory_established === true &&
      p?.pii_governance?.processing_purposes_defined === true &&
      p?.pii_governance?.processing_roles_defined === true &&
      !purposeUnknown,
    privacy_risk:
      p?.privacy_risk?.privacy_risk_process_established === true &&
      p?.privacy_risk?.privacy_risks_identified === true &&
      p?.privacy_risk?.privacy_risks_assessed === true &&
      p?.privacy_risk?.privacy_risk_treatment_defined === true &&
      p?.privacy_risk?.residual_privacy_risk_reviewed === true,
    privacy_impact:
      p?.privacy_impact?.privacy_impact_assessment_established === true &&
      p?.privacy_impact?.potential_impacts_identified === true &&
      p?.privacy_impact?.affected_individuals_considered === true &&
      p?.privacy_impact?.mitigations_defined === true &&
      p?.privacy_impact?.residual_impact_reviewed === true,
    data_lifecycle:
      p?.data_lifecycle?.collection_governance_established === true &&
      p?.data_lifecycle?.use_governance_established === true &&
      p?.data_lifecycle?.sharing_governance_established === true &&
      p?.data_lifecycle?.retention_governance_established === true &&
      p?.data_lifecycle?.deletion_disposal_governance_established === true,
    transparency:
      p?.transparency?.privacy_information_provided === true &&
      p?.transparency?.processing_transparency_established === true &&
      p?.transparency?.notice_governance_established === true,
    privacy_rights:
      p?.rights?.privacy_rights_process_established === true &&
      p?.rights?.rights_request_handling_established === true &&
      p?.rights?.identity_verification_for_rights_established === true &&
      p?.rights?.response_process_established === true,
    controller_processor:
      roleDefined &&
      !roleUnknown &&
      p?.pii_governance?.processing_responsibilities_defined === true,
    third_party:
      p?.third_party?.processor_requirements_defined === true &&
      p?.third_party?.third_party_privacy_requirements_defined === true &&
      p?.third_party?.processor_monitoring_established === true,
    privacy_incident:
      p?.privacy_incident?.privacy_incident_process_established === true &&
      p?.privacy_incident?.privacy_breach_response_established === true &&
      p?.privacy_incident?.notification_process_established === true,
    monitoring:
      p?.monitoring?.privacy_performance_monitored === true &&
      p?.monitoring?.privacy_review_established === true &&
      p?.monitoring?.management_review_established === true,
    improvement:
      p?.improvement?.privacy_nonconformities_managed === true &&
      p?.improvement?.corrective_actions_managed === true &&
      p?.improvement?.continual_improvement_established === true,
  };
}

function iso27701Applicable(facts: Iso27701PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('ISO_27701');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: Iso27701CompiledRule,
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
        matched: [...matched, 'iso_27701_review_skipped_prior_deny'],
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
  rule: Iso27701CompiledRule,
  facts: Iso27701PackFacts,
  gates: ReturnType<typeof deriveIso27701Gates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'ISO_27701' && !iso27701Applicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'pims',
    'pii_processing',
    'privacy_risk',
    'privacy_impact',
    'data_lifecycle',
    'transparency',
    'privacy_rights',
    'controller_processor',
    'third_party',
    'privacy_incident',
    'monitoring',
    'improvement',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: Iso27701CompiledRule, facts: Iso27701PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'ISO_27701' && !iso27701Applicable(facts)) return false;
  return true;
}

export function applyIso27701PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_27701_PACK_META.input_policy_id,
    version: ISO_27701_PACK_META.input_version,
    pack_id: ISO_27701_PACK_META.pack_id,
    name: 'ISO/IEC 27701 input governance',
    phase: 'input',
    status: 'active',
    interpreter: ISO_27701_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const packFacts = facts as Iso27701PackFacts;
  if (!iso27701Applicable(packFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_27701_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveIso27701Gates(packFacts);
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

export function applyIso27701PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: ISO_27701_PACK_META.output_policy_id,
    version: ISO_27701_PACK_META.output_version,
    pack_id: ISO_27701_PACK_META.pack_id,
    name: 'ISO/IEC 27701 output governance',
    phase: 'output',
    status: 'active',
    interpreter: ISO_27701_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const packFacts = facts as Iso27701PackFacts;
  if (!iso27701Applicable(packFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'iso_27701_pack_v1_output_skip_not_applicable'],
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
