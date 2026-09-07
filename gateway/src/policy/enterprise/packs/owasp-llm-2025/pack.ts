import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  OWASP_LLM_2025_PACK_META,
  OWASP_LLM_2025_PROVENANCE_GRAPH,
  OWASP_LLM_2025_RULES,
  type OwaspCompiledRule,
} from './compiled-bundle.js';
import { loadOwaspLlm2025PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadOwaspLlm2025PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : OWASP_LLM_2025_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? OWASP_LLM_2025_PROVENANCE_GRAPH;

export type OwaspLlm2025PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

const HIGH_IMPACT_OPS = new Set([
  'write',
  'export',
  'share',
  'transmit',
  'execute',
  'update',
  'delete',
]);

/**
 * Derive OWASP-informed security control gates from generic governance_context.
 * Missing attestation → false (REVIEW when pack applies).
 * Does NOT inspect prompts or invent detectors.
 */
export function deriveOwaspSecurityControlGates(facts: OwaspLlm2025PackFacts): {
  prompt_injection_controls: boolean;
  sensitive_data_controls: boolean;
  supply_chain_controls: boolean;
  poisoning_controls: boolean;
  output_validation_controls: boolean;
  agency_controls: boolean;
  system_prompt_protection: boolean;
  retrieval_security_controls: boolean;
  grounding_controls: boolean;
  resource_limits: boolean;
  high_impact_agency: boolean;
} {
  const sc = facts.governance_context?.security_controls;
  return {
    prompt_injection_controls: sc?.prompt_injection_controls === true,
    sensitive_data_controls: sc?.sensitive_data_controls === true,
    supply_chain_controls: sc?.supply_chain_controls === true,
    poisoning_controls: sc?.poisoning_controls === true,
    output_validation_controls: sc?.output_validation_controls === true,
    agency_controls: sc?.agency_controls === true,
    system_prompt_protection: sc?.system_prompt_protection === true,
    retrieval_security_controls: sc?.retrieval_security_controls === true,
    grounding_controls: sc?.grounding_controls === true,
    resource_limits: sc?.resource_limits === true,
    high_impact_agency: HIGH_IMPACT_OPS.has((facts.operation ?? '').toLowerCase()),
  };
}

function owaspApplicable(facts: OwaspLlm2025PackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('OWASP_LLM_2025');
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code: code as Obligation['code'] });
  }
  return next;
}

function applyRule(
  rule: OwaspCompiledRule,
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
        matched: [...matched, 'owasp_review_skipped_prior_deny'],
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
  rule: OwaspCompiledRule,
  facts: OwaspLlm2025PackFacts,
  gates: ReturnType<typeof deriveOwaspSecurityControlGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'OWASP_LLM_2025' && !owaspApplicable(facts)) return false;

  const boolGates: Array<keyof typeof gates> = [
    'prompt_injection_controls',
    'sensitive_data_controls',
    'supply_chain_controls',
    'poisoning_controls',
    'output_validation_controls',
    'agency_controls',
    'system_prompt_protection',
    'retrieval_security_controls',
    'grounding_controls',
    'resource_limits',
    'high_impact_agency',
  ];
  for (const key of boolGates) {
    if (c[key] === true && !gates[key]) return false;
    if (c[key] === false && gates[key]) return false;
  }
  return true;
}

function matchOutputRule(rule: OwaspCompiledRule, facts: OwaspLlm2025PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'OWASP_LLM_2025' && !owaspApplicable(facts)) return false;
  return true;
}

export function applyOwaspLlm2025PackV1Input(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: OWASP_LLM_2025_PACK_META.input_policy_id,
    version: OWASP_LLM_2025_PACK_META.input_version,
    pack_id: OWASP_LLM_2025_PACK_META.pack_id,
    name: 'OWASP LLM Top 10 2025 input governance',
    phase: 'input',
    status: 'active',
    interpreter: OWASP_LLM_2025_PACK_META.input_interpreter,
  },
): InterpretedResult {
  const owaspFacts = facts as OwaspLlm2025PackFacts;
  if (!owaspApplicable(owaspFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'owasp_llm_2025_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveOwaspSecurityControlGates(owaspFacts);
  const inputRules = [...rulesBundle]
    .filter((r) => r.phase === 'input')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of inputRules) {
    if (!matchInputRule(rule, owaspFacts, gates)) continue;
    result = applyRule(rule, meta, result);
    if (result.decision === 'REVIEW' || result.decision === 'DENY') break;
  }
  return result;
}

export function applyOwaspLlm2025PackV1Output(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta = {
    policy_id: OWASP_LLM_2025_PACK_META.output_policy_id,
    version: OWASP_LLM_2025_PACK_META.output_version,
    pack_id: OWASP_LLM_2025_PACK_META.pack_id,
    name: 'OWASP LLM Top 10 2025 output governance',
    phase: 'output',
    status: 'active',
    interpreter: OWASP_LLM_2025_PACK_META.output_interpreter,
  },
): InterpretedResult {
  const owaspFacts = facts as OwaspLlm2025PackFacts;
  if (!owaspApplicable(owaspFacts)) {
    return {
      ...current,
      matched: [...current.matched, 'owasp_llm_2025_pack_v1_output_skip_not_applicable'],
    };
  }

  const outputRules = [...rulesBundle]
    .filter((r) => r.phase === 'output')
    .sort((a, b) => b.priority - a.priority);

  let result = current;
  for (const rule of outputRules) {
    if (!matchOutputRule(rule, owaspFacts)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
