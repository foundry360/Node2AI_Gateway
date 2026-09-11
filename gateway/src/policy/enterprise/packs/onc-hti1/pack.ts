import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  ONC_HTI1_PACK_META,
  ONC_HTI1_PROVENANCE_GRAPH,
  ONC_HTI1_RULES,
  type OncHti1CompiledRule,
} from './compiled-bundle.js';
import { loadOncHti1PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadOncHti1PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : ONC_HTI1_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? ONC_HTI1_PROVENANCE_GRAPH;

export type OncHti1PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

type Dsi = Record<string, unknown> | undefined;

function dsiObj(facts: OncHti1PackFacts): Dsi {
  const raw = facts.governance_context?.predictive_dsi as Dsi;
  return raw && typeof raw === 'object' ? raw : undefined;
}

function dsiBool(dsi: Dsi, key: string): boolean {
  return dsi?.[key] === true;
}

function dsiStr(dsi: Dsi, key: string): string | undefined {
  const v = dsi?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function oncTagPresent(facts: OncHti1PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('ONC_HTI1');
}

/**
 * Derive ONC HTI-1 evaluation gates from governance_context.predictive_dsi.
 * Does not infer HTI-1 applicability from Healthcare+AI alone.
 */
export function deriveOncHti1Gates(facts: OncHti1PackFacts): {
  onc_applicability: 'applicable' | 'not_applicable' | 'unknown';
  clinical_predictive: boolean;
  high_risk: boolean;
  has_algorithm_identity: boolean;
  has_intended_use: boolean;
  transparency_sufficient: boolean;
  faves_sufficient: boolean;
  risk_management_sufficient: boolean;
  human_oversight_sufficient: boolean;
  version_governance_current: boolean;
  onc_controls_satisfied: boolean;
} {
  const dsi = dsiObj(facts);
  const role = (dsiStr(dsi, 'organization_role') ?? '').toLowerCase();
  const certified = dsiBool(dsi, 'certified_health_it_context');
  let onc_applicability = (dsiStr(dsi, 'applicability') ?? 'unknown').toLowerCase() as
    | 'applicable'
    | 'not_applicable'
    | 'unknown';
  if (
    onc_applicability !== 'applicable' &&
    onc_applicability !== 'not_applicable' &&
    onc_applicability !== 'unknown'
  ) {
    onc_applicability = 'unknown';
  }

  // Payer / non-certified environments default to not_applicable unless explicitly applicable.
  if (
    onc_applicability === 'unknown' &&
    (role === 'payer' || role === 'non_certified' || (role === 'health_it_developer' && !certified))
  ) {
    onc_applicability = 'not_applicable';
  }
  if (onc_applicability === 'unknown' && certified) {
    onc_applicability = 'applicable';
  }

  const useClass = (dsiStr(dsi, 'use_class') ?? '').toLowerCase();
  const intendedUse = (dsiStr(dsi, 'intended_use') ?? '').toLowerCase();
  const clinicalUses = [
    'clinical_decision_support',
    'risk_prediction',
    'care_management',
    'clinical',
    'cds',
  ];
  const clinical_predictive =
    useClass === 'clinical' ||
    clinicalUses.some((u) => intendedUse === u || intendedUse.includes(u));

  const riskTier = (dsiStr(dsi, 'risk_tier') ?? dsiStr(dsi, 'risk_level') ?? '').toLowerCase();
  // High risk only when explicitly declared — do not infer from Healthcare + AI alone.
  const high_risk = riskTier === 'high';

  const has_algorithm_identity = !!(
    dsiStr(dsi, 'algorithm_id') ||
    dsiStr(dsi, 'model_id') ||
    (typeof facts.requested_model === 'string' &&
      dsiBool(dsi, 'identity_from_requested_model') &&
      facts.requested_model.trim() !== '')
  );

  const has_intended_use = !!dsiStr(dsi, 'intended_use');

  const transparency_sufficient =
    dsiBool(dsi, 'transparency_sufficient') ||
    dsiBool(dsi, 'source_attributes_documented') ||
    (!!dsiStr(dsi, 'intended_use') &&
      !!dsiStr(dsi, 'intended_users') &&
      !!dsiStr(dsi, 'population') &&
      (dsiBool(dsi, 'development_info_available') ||
        dsiBool(dsi, 'evaluation_info_available') ||
        dsiBool(dsi, 'performance_info_available')));

  const faves = (dsi?.faves as Record<string, unknown> | undefined) ?? undefined;
  const favesStatus = (dsiStr(dsi, 'faves_status') ?? '').toLowerCase();
  const faves_sufficient =
    favesStatus === 'sufficient' ||
    favesStatus === 'complete' ||
    (faves?.fair === true &&
      faves?.appropriate === true &&
      faves?.valid === true &&
      faves?.effective === true &&
      faves?.safe === true);

  const rmStatus = (dsiStr(dsi, 'risk_management_status') ?? '').toLowerCase();
  const risk_management_sufficient =
    dsiBool(dsi, 'risk_management_sufficient') ||
    rmStatus === 'sufficient' ||
    rmStatus === 'complete';

  const oversightStatus = (dsiStr(dsi, 'human_oversight_status') ?? '').toLowerCase();
  const human_oversight_sufficient =
    dsiBool(dsi, 'human_oversight') ||
    oversightStatus === 'sufficient' ||
    oversightStatus === 'present' ||
    oversightStatus === 'required_and_present';

  // Default current unless explicitly stale / changed without re-governance.
  const governanceStatus = (dsiStr(dsi, 'governance_status') ?? '').toLowerCase();
  const version_governance_current =
    dsi?.version_governance_current === false ||
    dsiBool(dsi, 'version_changed') ||
    governanceStatus === 'stale'
      ? false
      : true;

  let onc_controls_satisfied = false;
  if (onc_applicability === 'applicable') {
    if (clinical_predictive && high_risk) {
      onc_controls_satisfied =
        has_algorithm_identity &&
        has_intended_use &&
        transparency_sufficient &&
        faves_sufficient &&
        risk_management_sufficient &&
        human_oversight_sufficient &&
        version_governance_current;
    } else if (high_risk) {
      onc_controls_satisfied =
        has_algorithm_identity &&
        risk_management_sufficient &&
        version_governance_current;
    } else {
      // Low-risk administrative / reduced requirements
      onc_controls_satisfied = version_governance_current;
    }
  }

  return {
    onc_applicability,
    clinical_predictive,
    high_risk,
    has_algorithm_identity,
    has_intended_use,
    transparency_sufficient,
    faves_sufficient,
    risk_management_sufficient,
    human_oversight_sufficient,
    version_governance_current,
    onc_controls_satisfied,
  };
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code });
  }
  return next;
}

function applyRule(
  rule: OncHti1CompiledRule,
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
  if (rule.decision === 'DENY') enforcementActions.push('DENY');
  if (rule.decision === 'BLOCK_OUTPUT') enforcementActions.push('BLOCK_OUTPUT');
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

  if (rule.decision === 'DENY') {
    return {
      ...current,
      decision: 'DENY',
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      eligible_models: [],
      transforms: [],
      obligations: mergeObligations(
        [{ code: 'LOG_GOVERNANCE_EVENT' }],
        rule.enigma_obligations,
      ),
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
      provenance,
    };
  }

  if (rule.decision === 'REVIEW') {
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

  if (rule.decision === 'BLOCK_OUTPUT') {
    return {
      ...current,
      decision: 'BLOCK_OUTPUT',
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      obligations: mergeObligations(
        [...current.obligations, { code: 'LOG_GOVERNANCE_EVENT' }],
        rule.enigma_obligations,
      ),
      authorize_detokenization: false,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
      provenance,
    };
  }

  return { ...current, matched, provenance };
}

function gateMatches(
  expected: unknown,
  actual: boolean | string,
): boolean {
  if (expected === undefined) return true;
  return expected === actual;
}

function matchInputRule(
  rule: OncHti1CompiledRule,
  facts: OncHti1PackFacts,
  gates: ReturnType<typeof deriveOncHti1Gates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'ONC_HTI1' && !oncTagPresent(facts)) return false;
  if (!gateMatches(c.onc_applicability, gates.onc_applicability)) return false;
  if (!gateMatches(c.clinical_predictive, gates.clinical_predictive)) return false;
  if (!gateMatches(c.high_risk, gates.high_risk)) return false;
  if (!gateMatches(c.has_algorithm_identity, gates.has_algorithm_identity)) return false;
  if (!gateMatches(c.has_intended_use, gates.has_intended_use)) return false;
  if (!gateMatches(c.transparency_sufficient, gates.transparency_sufficient)) return false;
  if (!gateMatches(c.faves_sufficient, gates.faves_sufficient)) return false;
  if (!gateMatches(c.risk_management_sufficient, gates.risk_management_sufficient)) {
    return false;
  }
  if (!gateMatches(c.human_oversight_sufficient, gates.human_oversight_sufficient)) {
    return false;
  }
  if (!gateMatches(c.version_governance_current, gates.version_governance_current)) {
    return false;
  }
  if (!gateMatches(c.onc_controls_satisfied, gates.onc_controls_satisfied)) return false;
  return true;
}

function matchOutputRule(
  rule: OncHti1CompiledRule,
  facts: OncHti1PackFacts,
  gates: ReturnType<typeof deriveOncHti1Gates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'ONC_HTI1' && !oncTagPresent(facts)) return false;
  if (!gateMatches(c.onc_applicability, gates.onc_applicability)) return false;
  if (!gateMatches(c.onc_controls_satisfied, gates.onc_controls_satisfied)) return false;
  return true;
}

export function applyOncHti1PackV1Input(
  current: InterpretedResult,
  facts: OncHti1PackFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (meta.status !== 'active') return current;

  if (!oncTagPresent(facts)) {
    return {
      ...current,
      matched: [...current.matched, 'onc_hti1_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveOncHti1Gates(facts);

  if (gates.onc_applicability === 'not_applicable') {
    return {
      ...current,
      matched: [
        ...current.matched,
        'onc_hti1_pack_v1_skip_not_applicable',
        'onc_applicability:not_applicable',
      ],
      reason_codes: [...current.reason_codes, 'ONC_DSI_NOT_APPLICABLE'],
    };
  }

  if (current.decision === 'DENY') {
    return {
      ...current,
      obligations: mergeObligations(current.obligations, ['LOG_GOVERNANCE_EVENT']),
      matched: [...current.matched, 'onc_hti1_pack_v1_reinforces_deny'],
    };
  }

  let result: InterpretedResult = {
    ...current,
    matched: [
      ...current.matched,
      'onc_hti1_pack_v1',
      `onc_applicability:${gates.onc_applicability}`,
      `clinical_predictive:${gates.clinical_predictive}`,
      `high_risk:${gates.high_risk}`,
      `pack:${ONC_HTI1_PACK_META.pack_id}`,
    ],
  };

  const inputRules = rulesBundle
    .filter((r) => r.phase === 'input')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const rule of inputRules) {
    if (!matchInputRule(rule, facts, gates)) continue;
    result = applyRule(rule, meta, result);
    if (result.decision === 'DENY' || result.decision === 'REVIEW') {
      break;
    }
  }
  return result;
}

export function applyOncHti1PackV1Output(
  current: InterpretedResult,
  facts: OncHti1PackFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (meta.status !== 'active') return current;

  if (!oncTagPresent(facts)) {
    return {
      ...current,
      matched: [...current.matched, 'onc_hti1_pack_v1_output_skip_not_applicable'],
    };
  }

  const gates = deriveOncHti1Gates(facts);
  if (gates.onc_applicability === 'not_applicable') {
    return {
      ...current,
      matched: [
        ...current.matched,
        'onc_hti1_pack_v1_output_skip_not_applicable',
        'onc_applicability:not_applicable',
      ],
    };
  }

  const outputRules = rulesBundle
    .filter((r) => r.phase === 'output')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  let result: InterpretedResult = {
    ...current,
    matched: [
      ...current.matched,
      'onc_hti1_pack_v1_output',
      `onc_controls_satisfied:${gates.onc_controls_satisfied}`,
      `pack:${ONC_HTI1_PACK_META.pack_id}`,
    ],
  };

  for (const rule of outputRules) {
    if (!matchOutputRule(rule, facts, gates)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
