import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  NIST_AI_RMF_PACK_META,
  NIST_AI_RMF_PROVENANCE_GRAPH,
  NIST_AI_RMF_RULES,
  type NistCompiledRule,
} from './compiled-bundle.js';
import { loadNistAiRmfPackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadNistAiRmfPackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : NIST_AI_RMF_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? NIST_AI_RMF_PROVENANCE_GRAPH;

export type NistAiRmfPackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
  /** Explicit documentation gates for AI RMF Core functions (Enigma control inputs). */
  nist_governance_documented?: boolean;
  nist_map_context_documented?: boolean;
  nist_measure_documented?: boolean;
  nist_manage_response_documented?: boolean;
};

function nistApplicable(facts: NistAiRmfPackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('NIST_AI_RMF');
}

/**
 * Derive documentation gates from explicit flags, governance_context, or
 * common BaselineFacts signals (purpose / source_system).
 * Does NOT read authorization_context — that is consent/authorization only.
 * Absent/unknown documentation → false (REVIEW path when pack applies).
 */
export function deriveNistDocumentationGates(facts: NistAiRmfPackFacts): {
  governance: boolean;
  map: boolean;
  measure: boolean;
  manage: boolean;
} {
  const gov = facts.governance_context;
  const purposeOk =
    !!facts.purpose &&
    facts.purpose.trim() !== '' &&
    facts.purpose.trim().toLowerCase() !== 'unknown';
  const sourceOk = !!facts.source_system && facts.source_system.trim() !== '';

  const governance =
    facts.nist_governance_documented ??
    gov?.accountability_documented ??
    (gov ? false : purposeOk);
  const map =
    facts.nist_map_context_documented ??
    gov?.system_context_documented ??
    (gov ? false : sourceOk && purposeOk);
  const measure =
    facts.nist_measure_documented ??
    gov?.measurement_documented ??
    (gov ? false : facts.evidence_sufficient !== false);
  const manage =
    facts.nist_manage_response_documented ??
    gov?.risk_response_documented ??
    false;

  return { governance, map, measure, manage };
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: NistCompiledRule,
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
    // Do not weaken a prior DENY; REVIEW is more restrictive than ALLOW/TOKENIZE.
    if (current.decision === 'DENY') {
      return {
        ...current,
        matched: [...matched, 'nist_review_skipped_prior_deny'],
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
  rule: NistCompiledRule,
  facts: NistAiRmfPackFacts,
  gates: ReturnType<typeof deriveNistDocumentationGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'NIST_AI_RMF' && !nistApplicable(facts)) return false;
  if (c.nist_governance_documented === true && !gates.governance) return false;
  if (c.nist_governance_documented === false && gates.governance) return false;
  if (c.nist_map_context_documented === true && !gates.map) return false;
  if (c.nist_map_context_documented === false && gates.map) return false;
  if (c.nist_measure_documented === true && !gates.measure) return false;
  if (c.nist_measure_documented === false && gates.measure) return false;
  if (c.nist_manage_response_documented === true && !gates.manage) return false;
  if (c.nist_manage_response_documented === false && gates.manage) return false;
  return true;
}

function matchOutputRule(rule: NistCompiledRule, facts: NistAiRmfPackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'NIST_AI_RMF' && !nistApplicable(facts)) return false;
  return true;
}

export function applyNistAiRmfPackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: NIST_AI_RMF_PACK_META.input_policy_id,
    version: NIST_AI_RMF_PACK_META.input_version,
    pack_id: NIST_AI_RMF_PACK_META.pack_id,
    name: 'NIST AI RMF input governance',
    phase: 'input',
    status: 'active',
    interpreter: NIST_AI_RMF_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const nistFacts = facts as NistAiRmfPackFacts;
  if (!nistApplicable(nistFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'nist_ai_rmf_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveNistDocumentationGates(nistFacts);
  const inputRules = [...rulesBundle]
    .filter((r) => r.phase === 'input')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of inputRules) {
    if (!matchInputRule(rule, nistFacts, gates)) continue;
    result = applyRule(rule, meta, result);
    // First matching restrictive REVIEW wins for this pack pass.
    if (result.decision === 'REVIEW' || result.decision === 'DENY') break;
  }
  return result;
}

export function applyNistAiRmfPackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: NIST_AI_RMF_PACK_META.output_policy_id,
    version: NIST_AI_RMF_PACK_META.output_version,
    pack_id: NIST_AI_RMF_PACK_META.pack_id,
    name: 'NIST AI RMF output monitoring governance',
    phase: 'output',
    status: 'active',
    interpreter: NIST_AI_RMF_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const nistFacts = facts as NistAiRmfPackFacts;
  if (!nistApplicable(nistFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'nist_ai_rmf_pack_v1_output_skip_not_applicable'],
    };
  }

  const outputRules = [...rulesBundle]
    .filter((r) => r.phase === 'output')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of outputRules) {
    if (!matchOutputRule(rule, nistFacts)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
