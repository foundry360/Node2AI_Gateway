import type { Obligation, ObligationCode } from '../types.js';

/** Facts bag for baseline pack interpreters (input + output). */
export interface BaselineFacts {
  trust_level: string;
  application_status: string;
  application_type: string;
  allowed_operations: string[];
  allowed_models: string[];
  operation: string;
  classification: string;
  deployment_mode: 'connected' | 'airgap' | string;
  roles: string[];
  requested_model?: string;
  available_models: string[];
  /** Output phase */
  inspection_sensitivity?: string;
  tool_or_action?: boolean;
  contains_tokens?: boolean;
  input_was_tokenized?: boolean;
  allow_detokenization?: boolean;
}

export interface PackPolicyMeta {
  policy_id: string;
  version: number;
  pack_id: string;
  name: string;
  phase: 'input' | 'output';
  status: 'active' | 'suspended' | 'retired' | 'disabled';
  interpreter:
    | 'baseline_input_v2'
    | 'baseline_output_v5'
    | 'hipaa_overlay_v1'
    | 'financial_overlay_v1'
    | 'legal_overlay_v1'
    | 'framework_stub';
}

export interface PackSnapshot {
  packs: Array<{ pack_id: string; status: string; name: string; domain: string }>;
  policies: PackPolicyMeta[];
}

export interface InterpretedResult {
  decision:
    | 'ALLOW'
    | 'DENY'
    | 'TOKENIZE'
    | 'REDACT'
    | 'BLOCK_OUTPUT';
  reason_codes: string[];
  eligible_models: string[];
  transforms: Array<{ type: string; targets: string[] }>;
  obligations: Obligation[];
  authorize_detokenization?: boolean;
  policy_id: string;
  policy_version: number;
  pack_id: string;
  matched: string[];
}

function isCloudModel(modelId: string): boolean {
  return (
    modelId.startsWith('cloud-') ||
    modelId.includes('public') ||
    modelId.includes('openai') ||
    modelId.includes('anthropic')
  );
}

function deny(
  meta: PackPolicyMeta,
  reason_codes: string[],
  matched: string[],
): InterpretedResult {
  return {
    decision: 'DENY',
    reason_codes,
    eligible_models: [],
    transforms: [],
    obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
    policy_id: meta.policy_id,
    policy_version: meta.version,
    pack_id: meta.pack_id,
    matched,
  };
}

/**
 * Baseline input interpreter v2 — data-driven via PackPolicyMeta; semantics match
 * legacy DeterministicPolicyEngine for M2 parity / comparison.
 * Production path for Enterprise AI Baseline pack until rule-DSL compiler lands.
 */
export function interpretBaselineInput(
  facts: BaselineFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  const matched: string[] = [];

  if (meta.status !== 'active') {
    return deny(meta, ['POLICY_DISABLED'], ['policy_inactive']);
  }

  if (facts.trust_level === 'untrusted') {
    matched.push('trust_level=untrusted');
    return deny(meta, ['UNTRUSTED_APPLICATION'], matched);
  }

  if (facts.application_status !== 'active') {
    matched.push('application_status!=active');
    return deny(meta, ['APPLICATION_INACTIVE'], matched);
  }

  if (!facts.allowed_operations.includes(facts.operation)) {
    matched.push('operation_not_allowed');
    return deny(meta, ['OPERATION_NOT_ALLOWED'], matched);
  }

  if (facts.classification === 'Credential') {
    matched.push('classification=Credential');
    return deny(meta, ['CREDENTIAL_CONTENT_BLOCKED'], matched);
  }

  let eligible = facts.available_models.filter((m) =>
    facts.allowed_models.includes(m),
  );
  matched.push('eligible=app_allowlist');

  if (facts.deployment_mode === 'airgap') {
    eligible = eligible.filter((m) => m.startsWith('local-'));
    matched.push('airgap_local_only');
  }

  if (facts.classification === 'PHI') {
    matched.push('classification=PHI');
    const cloudRequested =
      !!facts.requested_model && isCloudModel(facts.requested_model);
    if (cloudRequested) {
      matched.push('requested_cloud');
      return deny(meta, ['PHI_PUBLIC_CLOUD_BLOCKED'], matched);
    }

    eligible = eligible.filter((m) => m.startsWith('local-'));
    matched.push('phi_local_only');
    if (eligible.length === 0) {
      return deny(meta, ['PHI_REQUIRES_LOCAL_MODEL'], matched);
    }

    const clinicalOk =
      facts.application_type === 'clinical' && facts.roles.includes('clinician');
    if (!clinicalOk) {
      matched.push('phi_app_not_authorized');
      return deny(meta, ['PHI_APPLICATION_NOT_AUTHORIZED'], matched);
    }
  }

  if (eligible.length === 0) {
    matched.push('no_eligible_models');
    return deny(meta, ['MODEL_NOT_ELIGIBLE'], matched);
  }

  if (facts.requested_model) {
    if (!eligible.includes(facts.requested_model)) {
      matched.push('requested_not_eligible');
      return {
        ...deny(meta, ['MODEL_NOT_ELIGIBLE'], matched),
        eligible_models: eligible,
      };
    }
    eligible = [facts.requested_model];
    matched.push('restrict_to_requested');
  }

  const obligations: Obligation[] = [{ code: 'LOG_GOVERNANCE_EVENT' }];
  if (eligible.every((m) => m.startsWith('local-'))) {
    obligations.push({ code: 'LOCAL_MODEL_ONLY' });
  }

  if (facts.classification === 'PII' || facts.classification === 'Financial') {
    matched.push(`classification=${facts.classification}`);
    const hasExternal = eligible.some((m) => isCloudModel(m));
    obligations.push({
      code: 'TOKENIZE_PII' as ObligationCode,
      parameters: { targets: [facts.classification] },
    });
    if (hasExternal) {
      obligations.push({ code: 'NO_EXTERNAL_TRANSMISSION' });
    }
    return {
      decision: 'TOKENIZE',
      reason_codes: hasExternal
        ? ['PII_REQUIRES_TOKENIZE', 'EXTERNAL_MODEL_PRESENT']
        : ['PII_REQUIRES_TOKENIZE'],
      eligible_models: eligible,
      transforms: [{ type: 'tokenize', targets: [facts.classification] }],
      obligations,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
    };
  }

  matched.push('policy_allow');
  return {
    decision: 'ALLOW',
    reason_codes: ['POLICY_ALLOW'],
    eligible_models: eligible,
    transforms: [],
    obligations,
    policy_id: meta.policy_id,
    policy_version: meta.version,
    pack_id: meta.pack_id,
    matched,
  };
}

export function interpretBaselineOutput(
  facts: BaselineFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  const matched: string[] = [];

  if (meta.status !== 'active') {
    return {
      decision: 'BLOCK_OUTPUT',
      reason_codes: ['POLICY_DISABLED'],
      eligible_models: [],
      transforms: [],
      obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      authorize_detokenization: false,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched: ['policy_inactive'],
    };
  }

  if (facts.tool_or_action) {
    matched.push('tool_or_action');
    return {
      decision: 'BLOCK_OUTPUT',
      reason_codes: ['RESPONSE_TOOL_OR_ACTION_BLOCKED'],
      eligible_models: [],
      transforms: [],
      obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      authorize_detokenization: false,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
    };
  }

  if (facts.inspection_sensitivity === 'Credential') {
    matched.push('response_credential');
    return {
      decision: 'BLOCK_OUTPUT',
      reason_codes: ['RESPONSE_CREDENTIAL_BLOCKED'],
      eligible_models: [],
      transforms: [],
      obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      authorize_detokenization: false,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
    };
  }

  if (facts.inspection_sensitivity === 'PHI') {
    matched.push('response_phi');
    return {
      decision: 'BLOCK_OUTPUT',
      reason_codes: ['RESPONSE_PHI_BLOCKED'],
      eligible_models: [],
      transforms: [],
      obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      authorize_detokenization: false,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
    };
  }

  if (
    facts.inspection_sensitivity === 'PII' ||
    facts.inspection_sensitivity === 'Financial'
  ) {
    matched.push('response_pii_redact');
    return {
      decision: 'REDACT',
      reason_codes: ['RESPONSE_PII_REDACT'],
      eligible_models: [],
      transforms: [
        { type: 'redact', targets: [String(facts.inspection_sensitivity)] },
      ],
      obligations: [
        { code: 'REDACT_CREDENTIALS', parameters: { targets: [facts.inspection_sensitivity] } },
        { code: 'LOG_GOVERNANCE_EVENT' },
      ],
      authorize_detokenization: false,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
    };
  }

  const authorize =
    !!facts.allow_detokenization &&
    !!facts.contains_tokens &&
    !!facts.input_was_tokenized &&
    facts.trust_level === 'trusted';

  const reason_codes = authorize
    ? ['RESPONSE_RELEASE', 'DETOKENIZE_AUTHORIZED']
    : ['RESPONSE_RELEASE'];
  const obligations: Obligation[] = [{ code: 'LOG_GOVERNANCE_EVENT' }];
  if (authorize) {
    obligations.push({ code: 'AUTHORIZE_DETOKENIZATION' });
    matched.push('detokenize_authorized');
  } else {
    matched.push('response_release');
  }

  return {
    decision: 'ALLOW',
    reason_codes,
    eligible_models: [],
    transforms: [],
    obligations,
    authorize_detokenization: authorize,
    policy_id: meta.policy_id,
    policy_version: meta.version,
    pack_id: meta.pack_id,
    matched,
  };
}

export function defaultPackSnapshot(): PackSnapshot {
  // Regulatory extras merged in repository constructor / mergeDefaultSnapshot.
  return {
    packs: [
      {
        pack_id: 'pack_enterprise_baseline',
        status: 'active',
        name: 'Enterprise AI Baseline',
        domain: 'enterprise',
      },
      {
        pack_id: 'pack_response_governance',
        status: 'active',
        name: 'Response Governance',
        domain: 'enterprise',
      },
    ],
    policies: [
      {
        policy_id: 'pol_phase2_core',
        version: 2,
        pack_id: 'pack_enterprise_baseline',
        name: 'Request governance',
        phase: 'input',
        status: 'active',
        interpreter: 'baseline_input_v2',
      },
      {
        policy_id: 'pol_phase5_response',
        version: 5,
        pack_id: 'pack_response_governance',
        name: 'Response governance',
        phase: 'output',
        status: 'active',
        interpreter: 'baseline_output_v5',
      },
    ],
  };
}
