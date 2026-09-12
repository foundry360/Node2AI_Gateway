import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  CMS_PACK_META,
  CMS_PROVENANCE_GRAPH,
  CMS_RULES,
  type CmsCompiledRule,
} from './compiled-bundle.js';
import { loadCmsPackSources } from './compile.js';
import {
  appendRuleProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';

const packRuntime = loadCmsPackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : CMS_RULES;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? CMS_PROVENANCE_GRAPH;

export type CmsPackFacts = BaselineFacts & {
  regulatory_applicability?: string[];
};

type Interop = Record<string, unknown> | undefined;

function interopObj(facts: CmsPackFacts): Interop {
  const raw = facts.governance_context?.healthcare_interop as Interop;
  return raw && typeof raw === 'object' ? raw : undefined;
}

function iBool(i: Interop, key: string): boolean {
  return i?.[key] === true;
}

function iStr(i: Interop, key: string): string | undefined {
  const v = i?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function cmsTagPresent(facts: CmsPackFacts): boolean {
  return !!facts.regulatory_applicability?.includes('CMS');
}

function isCloudModel(modelId: string | undefined): boolean {
  if (!modelId) return false;
  return (
    modelId.startsWith('cloud-') ||
    modelId.includes('public') ||
    modelId.includes('openai') ||
    modelId.includes('anthropic')
  );
}

/**
 * Derive CMS interoperability gates from governance_context.healthcare_interop
 * plus existing agent/tool governance facts. Does not infer CMS from Healthcare alone.
 */
export function deriveCmsGates(facts: CmsPackFacts): {
  cms_applicability: 'applicable' | 'not_applicable' | 'unknown';
  workflow: string;
  patient_authorized: boolean;
  application_authorized: boolean;
  purpose_permitted: boolean;
  data_scope_excessive: boolean;
  provider_identity_verified: boolean;
  provider_authorized: boolean;
  agent_present: boolean;
  agent_authorized: boolean;
  payer_exchange_authorized: boolean;
  destination_authorized: boolean;
  cloud_model_restricted: boolean;
  uses_cloud_model: boolean;
  prior_auth_stage: string;
  prior_auth_authorized: boolean;
  api_client_authorized: boolean;
  fhir_access_permitted: boolean;
  agent_or_tool_unauthorized: boolean;
  cms_controls_satisfied: boolean;
} {
  const i = interopObj(facts);
  let cms_applicability = (iStr(i, 'applicability') ?? 'unknown').toLowerCase() as
    | 'applicable'
    | 'not_applicable'
    | 'unknown';
  if (
    cms_applicability !== 'applicable' &&
    cms_applicability !== 'not_applicable' &&
    cms_applicability !== 'unknown'
  ) {
    cms_applicability = 'unknown';
  }

  const role = (iStr(i, 'organization_role') ?? '').toLowerCase();
  const program = (iStr(i, 'program') ?? '').toLowerCase();
  // Explicit not_applicable wins. Unknown stays unknown (no auto-REVIEW).
  if (
    cms_applicability === 'unknown' &&
    (role === 'non_cms' || role === 'unregulated' || program === 'none')
  ) {
    cms_applicability = 'not_applicable';
  }

  const workflow = (iStr(i, 'workflow') ?? '').toLowerCase();

  const patient_authorized = iBool(i, 'patient_authorized') || iBool(i, 'member_authorized');
  const application_authorized = iBool(i, 'application_authorized');
  const purpose_permitted =
    i?.purpose_permitted === true
      ? true
      : i?.purpose_permitted === false
        ? false
        : !!facts.purpose &&
          !['marketing', 'research', 'unknown', ''].includes(
            (facts.purpose ?? '').toLowerCase(),
          );

  const data_scope_excessive = iBool(i, 'data_scope_excessive');

  const provider_identity_verified = iBool(i, 'provider_identity_verified');
  const provider_authorized = iBool(i, 'provider_authorized');

  const agent_present = !!(facts.agent_id && facts.agent_id.trim() !== '');
  const agent_authorized =
    facts.governance_context?.agent_authorized === true || iBool(i, 'agent_authorized');
  const tool_present = !!(facts.tool_id && facts.tool_id.trim() !== '');
  const tool_authorized =
    facts.governance_context?.tool_authorized === true || iBool(i, 'tool_authorized');

  const payer_exchange_authorized = iBool(i, 'payer_exchange_authorized');
  const destination_authorized = iBool(i, 'destination_authorized');
  const cloud_model_restricted = iBool(i, 'cloud_model_restricted');
  const uses_cloud_model = isCloudModel(facts.requested_model);

  const prior_auth_stage = (iStr(i, 'prior_auth_stage') ?? '').toLowerCase();
  const prior_auth_authorized = iBool(i, 'prior_auth_authorized');

  const api_client_authorized = iBool(i, 'api_client_authorized');
  const fhir_access_permitted = iBool(i, 'fhir_access_permitted');

  const agent_or_tool_unauthorized =
    (agent_present && !agent_authorized) || (tool_present && !tool_authorized);

  let cms_controls_satisfied = false;
  if (cms_applicability === 'applicable') {
    if (workflow === 'patient_access') {
      cms_controls_satisfied =
        patient_authorized &&
        application_authorized &&
        purpose_permitted &&
        !data_scope_excessive;
    } else if (workflow === 'provider_access') {
      cms_controls_satisfied =
        provider_identity_verified &&
        provider_authorized &&
        (!agent_present || agent_authorized) &&
        !data_scope_excessive;
    } else if (workflow === 'payer_to_payer') {
      cms_controls_satisfied =
        payer_exchange_authorized &&
        destination_authorized &&
        !data_scope_excessive &&
        !(cloud_model_restricted && uses_cloud_model);
    } else if (workflow === 'prior_auth') {
      cms_controls_satisfied =
        prior_auth_authorized &&
        (prior_auth_stage === 'prepare' ||
          prior_auth_stage === 'generate' ||
          prior_auth_stage === 'retrieve' ||
          prior_auth_stage === 'submit' ||
          prior_auth_stage === 'receive' ||
          prior_auth_stage === 'additional_info');
    } else if (workflow === 'api_fhir') {
      cms_controls_satisfied = api_client_authorized && fhir_access_permitted;
    } else if (workflow === 'ai_agent') {
      cms_controls_satisfied = !agent_or_tool_unauthorized && agent_present;
    } else if (workflow === 'data_exchange') {
      cms_controls_satisfied =
        destination_authorized &&
        purpose_permitted &&
        !data_scope_excessive;
    } else {
      // Generic applicable CMS request without specialized workflow
      cms_controls_satisfied = iBool(i, 'controls_satisfied') || iBool(i, 'authorized');
    }
  }

  return {
    cms_applicability,
    workflow,
    patient_authorized,
    application_authorized,
    purpose_permitted,
    data_scope_excessive,
    provider_identity_verified,
    provider_authorized,
    agent_present,
    agent_authorized,
    payer_exchange_authorized,
    destination_authorized,
    cloud_model_restricted,
    uses_cloud_model,
    prior_auth_stage,
    prior_auth_authorized,
    api_client_authorized,
    fhir_access_permitted,
    agent_or_tool_unauthorized,
    cms_controls_satisfied,
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
  rule: CmsCompiledRule,
  meta: PackPolicyMeta,
  current: InterpretedResult,
): InterpretedResult {
  const matched = [
    ...current.matched,
    rule.rule_id,
    ...(rule.obligation_ids ?? []).map((id) => `obligation:${id}`),
    ...(rule.sources ?? []).map((id) => `source:${id}`),
    ...(rule.requirement_type ? [`requirement_type:${rule.requirement_type}`] : []),
  ];

  const enforcementActions = [...(rule.enigma_obligations ?? [])];
  if (rule.decision === 'DENY') enforcementActions.push('DENY');
  if (rule.decision === 'REVIEW') enforcementActions.push('REVIEW');
  if (rule.decision === 'TOKENIZE') enforcementActions.push('TOKENIZE');
  if (rule.decision === 'REDACT') enforcementActions.push('REDACT');
  if (rule.decision === 'BLOCK_OUTPUT') enforcementActions.push('BLOCK_OUTPUT');

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

  if (rule.decision === 'TOKENIZE' || rule.decision === 'REDACT') {
    if (current.decision === 'DENY' || current.decision === 'REVIEW') {
      return { ...current, matched };
    }
    return {
      ...current,
      decision: rule.decision,
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      transforms:
        rule.decision === 'TOKENIZE'
          ? [{ type: 'TOKENIZE', targets: ['PII', 'PHI'] }]
          : [{ type: 'REDACT', targets: ['PII', 'PHI'] }],
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
          : current.decision === 'TOKENIZE' || current.decision === 'REDACT'
            ? current.decision
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

function gateMatches(expected: unknown, actual: boolean | string): boolean {
  if (expected === undefined) return true;
  return expected === actual;
}

function matchInputRule(
  rule: CmsCompiledRule,
  facts: CmsPackFacts,
  gates: ReturnType<typeof deriveCmsGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'CMS' && !cmsTagPresent(facts)) return false;
  if (!gateMatches(c.cms_applicability, gates.cms_applicability)) return false;
  if (c.workflow !== undefined && c.workflow !== gates.workflow) return false;
  if (!gateMatches(c.patient_authorized, gates.patient_authorized)) return false;
  if (!gateMatches(c.application_authorized, gates.application_authorized)) return false;
  if (!gateMatches(c.purpose_permitted, gates.purpose_permitted)) return false;
  if (!gateMatches(c.data_scope_excessive, gates.data_scope_excessive)) return false;
  if (!gateMatches(c.provider_identity_verified, gates.provider_identity_verified)) {
    return false;
  }
  if (!gateMatches(c.provider_authorized, gates.provider_authorized)) return false;
  if (!gateMatches(c.agent_present, gates.agent_present)) return false;
  if (!gateMatches(c.agent_authorized, gates.agent_authorized)) return false;
  if (!gateMatches(c.payer_exchange_authorized, gates.payer_exchange_authorized)) {
    return false;
  }
  if (!gateMatches(c.destination_authorized, gates.destination_authorized)) return false;
  if (!gateMatches(c.cloud_model_restricted, gates.cloud_model_restricted)) return false;
  if (!gateMatches(c.uses_cloud_model, gates.uses_cloud_model)) return false;
  if (c.prior_auth_stage !== undefined && c.prior_auth_stage !== gates.prior_auth_stage) {
    return false;
  }
  if (!gateMatches(c.prior_auth_authorized, gates.prior_auth_authorized)) return false;
  if (!gateMatches(c.api_client_authorized, gates.api_client_authorized)) return false;
  if (!gateMatches(c.fhir_access_permitted, gates.fhir_access_permitted)) return false;
  if (!gateMatches(c.agent_or_tool_unauthorized, gates.agent_or_tool_unauthorized)) {
    return false;
  }
  if (!gateMatches(c.cms_controls_satisfied, gates.cms_controls_satisfied)) return false;
  return true;
}

function matchOutputRule(
  rule: CmsCompiledRule,
  facts: CmsPackFacts,
  gates: ReturnType<typeof deriveCmsGates>,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  if (c.regulatory_applicability === 'CMS' && !cmsTagPresent(facts)) return false;
  if (!gateMatches(c.cms_applicability, gates.cms_applicability)) return false;
  if (!gateMatches(c.cms_controls_satisfied, gates.cms_controls_satisfied)) return false;
  return true;
}

export function applyCmsPackV1Input(
  current: InterpretedResult,
  facts: CmsPackFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (meta.status !== 'active') return current;

  if (!cmsTagPresent(facts)) {
    return {
      ...current,
      matched: [...current.matched, 'cms_pack_v1_skip_not_applicable'],
    };
  }

  const gates = deriveCmsGates(facts);

  if (gates.cms_applicability === 'not_applicable') {
    return {
      ...current,
      matched: [
        ...current.matched,
        'cms_pack_v1_skip_not_applicable',
        'cms_applicability:not_applicable',
      ],
      reason_codes: [...current.reason_codes, 'CMS_NOT_APPLICABLE'],
    };
  }

  if (gates.cms_applicability === 'unknown') {
    // Unknown does not auto-REVIEW; restrictive rules require applicable.
    return {
      ...current,
      matched: [
        ...current.matched,
        'cms_pack_v1',
        'cms_applicability:unknown',
        `pack:${CMS_PACK_META.pack_id}`,
      ],
      reason_codes: [...current.reason_codes, 'CMS_APPLICABILITY_UNKNOWN'],
    };
  }

  if (current.decision === 'DENY') {
    return {
      ...current,
      obligations: mergeObligations(current.obligations, ['LOG_GOVERNANCE_EVENT']),
      matched: [...current.matched, 'cms_pack_v1_reinforces_deny'],
    };
  }

  let result: InterpretedResult = {
    ...current,
    matched: [
      ...current.matched,
      'cms_pack_v1',
      `cms_applicability:${gates.cms_applicability}`,
      `workflow:${gates.workflow || 'none'}`,
      `pack:${CMS_PACK_META.pack_id}`,
    ],
  };

  const inputRules = rulesBundle
    .filter((r) => r.phase === 'input')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const rule of inputRules) {
    if (!matchInputRule(rule, facts, gates)) continue;
    result = applyRule(rule, meta, result);
    if (
      result.decision === 'DENY' ||
      result.decision === 'REVIEW' ||
      result.decision === 'TOKENIZE' ||
      result.decision === 'REDACT'
    ) {
      break;
    }
  }
  return result;
}

export function applyCmsPackV1Output(
  current: InterpretedResult,
  facts: CmsPackFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (meta.status !== 'active') return current;

  if (!cmsTagPresent(facts)) {
    return {
      ...current,
      matched: [...current.matched, 'cms_pack_v1_output_skip_not_applicable'],
    };
  }

  const gates = deriveCmsGates(facts);
  if (gates.cms_applicability === 'not_applicable' || gates.cms_applicability === 'unknown') {
    return {
      ...current,
      matched: [
        ...current.matched,
        'cms_pack_v1_output_skip_not_applicable',
        `cms_applicability:${gates.cms_applicability}`,
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
      'cms_pack_v1_output',
      `cms_controls_satisfied:${gates.cms_controls_satisfied}`,
      `pack:${CMS_PACK_META.pack_id}`,
    ],
  };

  for (const rule of outputRules) {
    if (!matchOutputRule(rule, facts, gates)) continue;
    result = applyRule(rule, meta, result);
  }
  return result;
}
