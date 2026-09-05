import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  PART2_PACK_META,
  PART2_PROVENANCE_GRAPH,
  PART2_RULES,
  type Part2CompiledRule,
} from './compiled-bundle.js';
import { loadPart2PackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadPart2PackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : PART2_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? PART2_PROVENANCE_GRAPH;

export type Part2PackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
  authorization_context?: string;
  release_conditions_satisfied?: boolean;
  part2_redisclosure_ok?: boolean;
};

function isCloudModel(modelId: string): boolean {
  return (
    modelId.startsWith('cloud-') ||
    modelId.includes('public') ||
    modelId.includes('openai') ||
    modelId.includes('anthropic')
  );
}

function part2Applicable(facts: Part2PackFacts): boolean {
  if (facts.regulatory_applicability?.includes('PART2')) return true;
  const cls = facts.classification.toUpperCase();
  return cls === 'PART2' || cls === 'PART2_RECORD';
}

function processingEnvironment(
  facts: Part2PackFacts,
  current: InterpretedResult,
): 'unauthorized_external' | 'local_or_private' {
  if (facts.requested_model && isCloudModel(facts.requested_model)) {
    return 'unauthorized_external';
  }
  if (current.eligible_models.some((m) => isCloudModel(m))) {
    return 'unauthorized_external';
  }
  if (
    current.eligible_models.length > 0 &&
    current.eligible_models.every((m) => m.startsWith('local-') || m.includes('private'))
  ) {
    return 'local_or_private';
  }
  if (
    facts.requested_model?.startsWith('local-') ||
    facts.requested_model?.includes('private') ||
    facts.processing_location === 'local' ||
    facts.processing_location === 'private'
  ) {
    return 'local_or_private';
  }
  return 'unauthorized_external';
}

/**
 * Consent evidence for Part 2.
 * - part2_consent / part2_consent_tpo / consented → satisfied
 * - unknown / part2_consent_unknown → unknown (REVIEW path)
 * - absent / other → not satisfied
 */
function consentState(
  facts: Part2PackFacts,
): 'satisfied' | 'unknown' | 'absent' {
  const auth = (facts.authorization_context ?? '').trim().toLowerCase();
  if (
    auth === 'part2_consent' ||
    auth === 'part2_consent_tpo' ||
    auth === 'consented' ||
    auth === 'tpo_consent'
  ) {
    return 'satisfied';
  }
  if (auth === 'unknown' || auth === 'part2_consent_unknown') {
    return 'unknown';
  }
  return 'absent';
}

function redisclosureOk(facts: Part2PackFacts): boolean {
  if (facts.part2_redisclosure_ok === true) return true;
  if (facts.part2_redisclosure_ok === false) return false;
  // Default: redisclosure OK only when consent satisfied and release conditions met
  return consentState(facts) === 'satisfied' && facts.release_conditions_satisfied === true;
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) next.push({ code });
  }
  return next;
}

function applyRule(
  rule: Part2CompiledRule,
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
  if (rule.decision === 'AUTHORIZED_DETOKENIZATION') {
    enforcementActions.push('AUTHORIZE_DETOKENIZATION');
  }

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
    rule.authorize_detokenization,
  );

  if (rule.decision === 'DENY') {
    return {
      ...current,
      decision: 'DENY',
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      eligible_models: [],
      transforms: [],
      obligations: mergeObligations(
        [
          { code: 'LOG_GOVERNANCE_EVENT' },
          { code: 'NO_EXTERNAL_TRANSMISSION' },
          { code: 'LOCAL_MODEL_ONLY' },
        ],
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
      eligible_models: current.eligible_models.filter(
        (m) => m.startsWith('local-') || m.includes('private'),
      ),
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

  if (rule.decision === 'AUTHORIZED_DETOKENIZATION') {
    if (current.decision === 'BLOCK_OUTPUT' || current.decision === 'DENY') {
      return { ...current, matched: [...matched, 'enigma_detok_skipped_blocked'] };
    }
    return {
      ...current,
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      obligations: mergeObligations(current.obligations, rule.enigma_obligations),
      authorize_detokenization: true,
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
  rule: Part2CompiledRule,
  facts: Part2PackFacts,
  env: string,
  consent: 'satisfied' | 'unknown' | 'absent',
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'PART2' && !part2Applicable(facts)) return false;
  if (c.processing_environment && c.processing_environment !== env) return false;
  if (c.part2_consent_satisfied === true && consent !== 'satisfied') return false;
  if (c.part2_consent_satisfied === false && consent === 'satisfied') return false;
  if (c.part2_consent_unknown === true && consent !== 'unknown') return false;
  if (c.part2_consent_unknown === false && consent === 'unknown') return false;
  if (Array.isArray(c.operation_in) && !c.operation_in.includes(facts.operation)) {
    return false;
  }
  return true;
}

function matchOutputRule(rule: Part2CompiledRule, facts: Part2PackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'PART2' && !part2Applicable(facts)) return false;
  const releaseOk = facts.release_conditions_satisfied === true;
  const redisOk = redisclosureOk(facts);
  if (c.part2_redisclosure_ok === true && !redisOk) return false;
  if (c.part2_redisclosure_ok === false && redisOk) return false;
  if (c.release_conditions_satisfied === true && !releaseOk) return false;
  if (c.release_conditions_satisfied === false && releaseOk) return false;
  if (c.inspection_sensitivity) {
    if (
      String(facts.inspection_sensitivity).toUpperCase() !==
      String(c.inspection_sensitivity).toUpperCase()
    ) {
      return false;
    }
  }
  if (c.contains_tokens === true && !facts.contains_tokens) return false;
  if (c.input_was_tokenized === true && !facts.input_was_tokenized) return false;
  return true;
}

export function applyPart2PackV1Input(
  current: InterpretedResult,
  facts: Part2PackFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (meta.status !== 'active') return current;

  if (!part2Applicable(facts)) {
    return {
      ...current,
      matched: [...current.matched, 'part2_pack_v1_skip_not_applicable'],
    };
  }

  if (current.decision === 'DENY') {
    return {
      ...current,
      obligations: mergeObligations(current.obligations, [
        'LOCAL_MODEL_ONLY',
        'NO_EXTERNAL_TRANSMISSION',
        'LOG_GOVERNANCE_EVENT',
      ]),
      matched: [...current.matched, 'part2_pack_v1_reinforces_deny'],
    };
  }

  const env = processingEnvironment(facts, current);
  const consent = consentState(facts);

  let result: InterpretedResult = {
    ...current,
    matched: [
      ...current.matched,
      'part2_pack_v1',
      `processing_environment:${env}`,
      `part2_consent:${consent}`,
      `pack:${PART2_PACK_META.pack_id}`,
    ],
  };

  const inputRules = rulesBundle
    .filter((r) => r.phase === 'input')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const rule of inputRules) {
    if (!matchInputRule(rule, facts, env, consent)) continue;
    result = applyRule(rule, meta, result);
    if (
      result.decision === 'DENY' ||
      result.decision === 'REVIEW' ||
      result.decision === 'TOKENIZE'
    ) {
      break;
    }
  }
  return result;
}

export function applyPart2PackV1Output(
  current: InterpretedResult,
  facts: Part2PackFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (meta.status !== 'active') return current;
  if (!part2Applicable(facts) && String(facts.inspection_sensitivity).toUpperCase() !== 'PART2') {
    return {
      ...current,
      matched: [...current.matched, 'part2_pack_v1_output_skip_not_applicable'],
    };
  }

  const outputRules = rulesBundle
    .filter((r) => r.phase === 'output')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  let result: InterpretedResult = {
    ...current,
    matched: [
      ...current.matched,
      'part2_pack_v1_output',
      `part2_redisclosure_ok:${redisclosureOk(facts)}`,
      `pack:${PART2_PACK_META.pack_id}`,
    ],
  };

  // Ensure PART2 applicability for output rules when inspection is PART2
  const factsOut: Part2PackFacts = {
    ...facts,
    regulatory_applicability: [
      ...(facts.regulatory_applicability ?? []),
      ...(String(facts.inspection_sensitivity).toUpperCase() === 'PART2' ? ['PART2'] : []),
    ],
  };

  for (const rule of outputRules) {
    if (!matchOutputRule(rule, factsOut)) continue;
    result = applyRule(rule, meta, result);
    if (result.decision === 'BLOCK_OUTPUT') break;
    if (result.authorize_detokenization) break;
  }
  return result;
}
