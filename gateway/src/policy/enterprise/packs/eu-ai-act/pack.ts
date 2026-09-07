import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  EU_AI_ACT_PACK_META,
  EU_AI_ACT_PROVENANCE_GRAPH,
  EU_AI_ACT_RULES,
  type EuAiActCompiledRule,
} from './compiled-bundle.js';
import { loadEuAiActPackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadEuAiActPackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : EU_AI_ACT_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? EU_AI_ACT_PROVENANCE_GRAPH;

export type EuAiActPackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
  evaluation_as_of?: string;
};

/** Declared Art. 5 practice codes Enigma accepts as established prohibitions. */
export const EU_AI_ACT_PROHIBITED_PRACTICE_CODES = [
  'subliminal_manipulation',
  'vulnerability_exploitation',
  'social_scoring',
  'untargeted_facial_scraping',
  'emotion_recognition_workplace_education',
  'biometric_categorisation_sensitive',
  'predictive_policing_individual',
  'real_time_remote_biometric_identification',
] as const;

function euApplicable(facts: EuAiActPackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('EU_AI_ACT');
}

function asOfDate(facts: EuAiActPackFacts): string | null {
  const raw = facts.evaluation_as_of?.trim();
  if (!raw) return null;
  // Normalize to YYYY-MM-DD for date-only comparison.
  const d = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function obligationInForce(rule: EuAiActCompiledRule, facts: EuAiActPackFacts): boolean {
  if (!rule.application_date) return true;
  const asOf = asOfDate(facts);
  // Without an evaluation timestamp, do not enforce phased obligations early;
  // a dedicated REVIEW path may still fire via other gates when needed.
  if (!asOf) return false;
  return asOf >= rule.application_date;
}

type Reg = Record<string, unknown> | undefined;

function regBool(reg: Reg, key: string): boolean {
  return reg?.[key] === true;
}

function regStr(reg: Reg, key: string): string | undefined {
  const v = reg?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/**
 * Derive EU AI Act evaluation gates from generic governance_context.regulatory
 * and evaluation_as_of. Does not invent legal classifications from free text.
 */
export function deriveEuAiActGates(facts: EuAiActPackFacts): {
  prohibited_practice_established: boolean;
  prohibited_practice_uncertain: boolean;
  high_risk_established: boolean;
  high_risk_applicability_uncertain: boolean;
  high_risk_obligations_satisfied: boolean;
  high_risk_art6_1_declared: boolean;
  art50_interaction_applicable: boolean;
  art50_synthetic_applicable: boolean;
  art50_deepfake_applicable: boolean;
  art50_public_interest_text_applicable: boolean;
  art50_any_applicable: boolean;
  art50_obligations_satisfied: boolean;
  ai_interaction_disclosure: boolean;
  synthetic_content_marking: boolean;
  deepfake_labeling: boolean;
  human_review_or_editorial_control: boolean;
  gpai_model: boolean;
  gpai_provider: boolean;
  gpai_systemic_risk_provider: boolean;
  gpai_provider_obligations_satisfied: boolean;
  gpai_systemic_risk_obligations_satisfied: boolean;
  gpai_systemic_risk_gate_ok: boolean;
  actor_role_missing: boolean;
  jurisdiction_facts_missing: boolean;
  minimal_or_no_risk: boolean;
  no_elevated_eu_gates: boolean;
} {
  const reg = facts.governance_context?.regulatory as Reg;
  const category = (regStr(reg, 'regulatory_risk_category') ?? 'UNKNOWN').toUpperCase();
  const practice = (regStr(reg, 'prohibited_practice_code') ?? '').toLowerCase();
  const actorRole = (regStr(reg, 'actor_role') ?? '').toLowerCase();

  const prohibited_practice_established =
    (EU_AI_ACT_PROHIBITED_PRACTICE_CODES as readonly string[]).includes(practice) ||
    (category === 'PROHIBITED' && practice !== 'uncertain' && practice !== 'none');

  const prohibited_practice_uncertain =
    practice === 'uncertain' ||
    (category === 'PROHIBITED' &&
      !prohibited_practice_established &&
      practice !== 'none');

  // High-risk only when explicitly declared — never inferred from sector keywords.
  const high_risk_established =
    category === 'HIGH_RISK' || regBool(reg, 'high_risk_use_declared');
  const high_risk_applicability_uncertain =
    regStr(reg, 'high_risk_applicability')?.toLowerCase() === 'uncertain';

  const high_risk_art6_1_declared =
    regStr(reg, 'high_risk_pathway')?.toLowerCase() === 'art6_1' ||
    regBool(reg, 'high_risk_art6_1');

  const high_risk_obligations_satisfied =
    regBool(reg, 'risk_management_system') &&
    regBool(reg, 'data_governance') &&
    regBool(reg, 'technical_documentation') &&
    regBool(reg, 'logging_record_keeping') &&
    regBool(reg, 'deployer_transparency') &&
    regBool(reg, 'human_oversight') &&
    regBool(reg, 'accuracy_robustness_cybersecurity');

  const art50_interaction_applicable = regBool(reg, 'direct_ai_interaction');
  const art50_synthetic_applicable = regBool(reg, 'synthetic_or_manipulated_content');
  const art50_deepfake_applicable = regBool(reg, 'deepfake_content');
  const art50_public_interest_text_applicable = regBool(reg, 'public_interest_ai_text');
  const art50_any_applicable =
    art50_interaction_applicable ||
    art50_synthetic_applicable ||
    art50_deepfake_applicable ||
    art50_public_interest_text_applicable;

  const ai_interaction_disclosure = regBool(reg, 'ai_interaction_disclosure');
  const synthetic_content_marking = regBool(reg, 'synthetic_content_marking');
  const deepfake_labeling = regBool(reg, 'deepfake_labeling');
  const human_review_or_editorial_control = regBool(
    reg,
    'human_review_or_editorial_control',
  );

  const art50_obligations_satisfied =
    art50_any_applicable &&
    (!art50_interaction_applicable || ai_interaction_disclosure) &&
    (!art50_synthetic_applicable || synthetic_content_marking) &&
    (!art50_deepfake_applicable || deepfake_labeling) &&
    (!art50_public_interest_text_applicable || human_review_or_editorial_control);

  const gpai_model = regBool(reg, 'gpai_model') || category === 'GPAI';
  const actor_role_missing = !actorRole;
  const gpai_provider = gpai_model && actorRole === 'provider';
  const gpai_systemic_risk = regBool(reg, 'gpai_systemic_risk');
  const gpai_systemic_risk_provider = gpai_provider && gpai_systemic_risk;

  const gpai_provider_obligations_satisfied =
    regBool(reg, 'gpai_technical_documentation') &&
    regBool(reg, 'gpai_downstream_information') &&
    regBool(reg, 'gpai_copyright_policy') &&
    regBool(reg, 'gpai_training_content_summary');

  const gpai_systemic_risk_obligations_satisfied =
    regBool(reg, 'gpai_systemic_risk_assessment') &&
    regBool(reg, 'gpai_systemic_risk_mitigation') &&
    regBool(reg, 'gpai_incident_reporting') &&
    regBool(reg, 'gpai_cybersecurity');

  const gpai_systemic_risk_gate_ok =
    !gpai_systemic_risk_provider || gpai_systemic_risk_obligations_satisfied;

  const hasAnyJurisdiction = !!(
    regStr(reg, 'deployment_jurisdiction') ||
    regStr(reg, 'market_placement_jurisdiction') ||
    regStr(reg, 'affected_person_jurisdiction') ||
    regStr(reg, 'provider_jurisdiction')
  );
  const jurisdiction_facts_missing = !hasAnyJurisdiction;

  const minimal_or_no_risk = category === 'MINIMAL_OR_NO_RISK';
  const no_elevated_eu_gates =
    !prohibited_practice_established &&
    !prohibited_practice_uncertain &&
    !high_risk_established &&
    !high_risk_applicability_uncertain &&
    !gpai_model &&
    !art50_any_applicable;

  return {
    prohibited_practice_established,
    prohibited_practice_uncertain:
      prohibited_practice_uncertain && !prohibited_practice_established,
    high_risk_established,
    high_risk_applicability_uncertain,
    high_risk_obligations_satisfied,
    high_risk_art6_1_declared,
    art50_interaction_applicable,
    art50_synthetic_applicable,
    art50_deepfake_applicable,
    art50_public_interest_text_applicable,
    art50_any_applicable,
    art50_obligations_satisfied,
    ai_interaction_disclosure,
    synthetic_content_marking,
    deepfake_labeling,
    human_review_or_editorial_control,
    gpai_model,
    gpai_provider,
    gpai_systemic_risk_provider,
    gpai_provider_obligations_satisfied,
    gpai_systemic_risk_obligations_satisfied,
    gpai_systemic_risk_gate_ok,
    actor_role_missing,
    jurisdiction_facts_missing,
    minimal_or_no_risk,
    no_elevated_eu_gates,
  };
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: EuAiActCompiledRule,
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
    ...(rule.application_date ? [`application_date:${rule.application_date}`] : []),
  ];

  const enforcementActions = [...(rule.enigma_obligations ?? [])];
  if (rule.decision === 'DENY') enforcementActions.push('DENY');
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
      obligations: mergeObligations(current.obligations, rule.enigma_obligations),
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
      provenance,
    };
  }

  if (rule.decision === 'REVIEW') {
    if (current.decision === 'DENY') {
      return {
        ...current,
        matched: [...matched, 'eu_ai_act_review_skipped_prior_deny'],
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

  if (rule.decision === 'ALLOW_WITH_CONTROLS' || rule.decision === 'ALLOW') {
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

function matchBoolGates(
  c: Record<string, unknown>,
  gates: ReturnType<typeof deriveEuAiActGates>,
): boolean {
  for (const [key, expected] of Object.entries(c)) {
    if (key === 'regulatory_applicability') continue;
    if (typeof expected !== 'boolean') continue;
    const actual = gates[key as keyof typeof gates];
    if (typeof actual !== 'boolean') continue;
    if (expected !== actual) return false;
  }
  return true;
}

function matchInputRule(
  rule: EuAiActCompiledRule,
  facts: EuAiActPackFacts,
  gates: ReturnType<typeof deriveEuAiActGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'EU_AI_ACT' && !euApplicable(facts)) return false;
  if (!obligationInForce(rule, facts)) return false;
  return matchBoolGates(c, gates);
}

function matchOutputRule(rule: EuAiActCompiledRule, facts: EuAiActPackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'EU_AI_ACT' && !euApplicable(facts)) return false;
  if (!obligationInForce(rule, facts)) return false;
  return true;
}

export function applyEuAiActPackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: EU_AI_ACT_PACK_META.input_policy_id,
    version: EU_AI_ACT_PACK_META.input_version,
    pack_id: EU_AI_ACT_PACK_META.pack_id,
    name: 'EU AI Act input governance',
    phase: 'input',
    status: 'active',
    interpreter: EU_AI_ACT_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const euFacts = facts as EuAiActPackFacts;
  if (!euApplicable(euFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'eu_ai_act_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveEuAiActGates(euFacts);
  const inputRules = [...rulesBundle]
    .filter((r) => r.phase === 'input')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of inputRules) {
    if (!matchInputRule(rule, euFacts, gates)) continue;
    result = applyRule(rule, meta, result);
    if (result.decision === 'REVIEW' || result.decision === 'DENY') break;
  }
  return result;
}

export function applyEuAiActPackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: EU_AI_ACT_PACK_META.output_policy_id,
    version: EU_AI_ACT_PACK_META.output_version,
    pack_id: EU_AI_ACT_PACK_META.pack_id,
    name: 'EU AI Act output governance',
    phase: 'output',
    status: 'active',
    interpreter: EU_AI_ACT_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const euFacts = facts as EuAiActPackFacts;
  if (!euApplicable(euFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'eu_ai_act_pack_v1_output_skip_not_applicable'],
    };
  }

  const outputRules = [...rulesBundle]
    .filter((r) => r.phase === 'output')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of outputRules) {
    if (!matchOutputRule(rule, euFacts)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
