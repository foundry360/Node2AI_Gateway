import type { Obligation, ObligationCode } from '../types.js';
import type { DecisionProvenance } from '../provenance.js';
import type { ResolvedPolicyOutcome } from '../policy-resolution.js';
import type { GovernanceContext } from '../../types.js';

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
  /** Pack enrichment (HIPAA / classification profiles) */
  entity_types?: string[];
  has_entity_spans?: boolean;
  health_context?: boolean;
  /** Enigma operational — not a legal HIPAA classification. */
  health_sensitive?: boolean;
  release_authorized?: boolean;
  release_conditions_satisfied?: boolean;
  classification_profile_id?: string;
  regulatory_applicability?: string[];
  evidence_sufficient?: boolean;
  /** First-class purpose; unknown must not silently become approved. */
  purpose?: string;
  recipient?: string;
  source_system?: string;
  processing_location?: string;
  /** Authorization/consent basis only — not governance documentation. */
  authorization_context?: string;
  /** Agent identity when present on the live request. */
  agent_id?: string;
  /** Tool identity when present on the live request. */
  tool_id?: string;
  /**
   * Declared action kind from the caller (request fact, not authorization).
   * Examples: clinical_note, field_update.
   */
  action_kind?: string;
  /**
   * Declared action attributes from the caller (request fact, not authorization).
   * For field updates may include field / value.
   */
  action_attributes?: Record<string, unknown>;
  /**
   * Server-derived write governance class (HIPAA pack).
   * Never client-supplied — computed from declared action facts + allowlists.
   */
  write_governance_class?:
    | 'CLINICAL_NOTE'
    | 'ADMINISTRATIVE_LOW_RISK'
    | 'UNKNOWN';
  /** Minimum-necessary permitted entity types when scoped by the caller. */
  permitted_entity_types?: string[];
  /**
   * Generic governance evidence. Packs map these into control inputs.
   * Distinct from authorization_context.
   */
  governance_context?: GovernanceContext;
  /**
   * Evaluation timestamp (ISO-8601) for phased obligation applicability.
   * Set at the request boundary — packs compare against rule application_date.
   */
  evaluation_as_of?: string;
  /** Optional pack-local documentation gates (framework pack inputs). */
  nist_governance_documented?: boolean;
  nist_map_context_documented?: boolean;
  nist_measure_documented?: boolean;
  nist_manage_response_documented?: boolean;
}

export interface PackPolicyMeta {
  policy_id: string;
  version: number;
  pack_id: string;
  name: string;
  phase: 'input' | 'output';
  status: 'active' | 'suspended' | 'retired' | 'disabled' | 'approved' | 'draft';
  interpreter:
    | 'baseline_input_v2'
    | 'baseline_output_v5'
    | 'hipaa_overlay_v1'
    | 'hipaa_pack_v2'
    | 'hipaa_pack_v2_output'
    | 'hipaa_pack_v3'
    | 'hipaa_pack_v3_output'
    | 'financial_overlay_v1'
    | 'legal_overlay_v1'
    | 'framework_stub'
    | (string & {});
  /** Admin / catalog enrichment (optional). */
  description?: string;
  owner?: string;
  priority?: number;
  scope_tier?: string;
  domain?: string;
  content_hash?: string;
  /** Display name of the contributing pack (catalog). */
  pack_name?: string;
  /** Pack semantic version when known. */
  pack_version?: string;
  /**
   * Declared policy precedence for multi-pack conflict resolution.
   * Distinct from source authority_tier — never inferred from citations alone.
   */
  precedence?: {
    priority: number;
    basis: 'DECLARED_POLICY_PRECEDENCE' | 'PACK_PRIORITY';
    overrides_pack_ids?: string[];
  };
}

export interface PackSnapshot {
  packs: Array<{
    pack_id: string;
    status: string;
    name: string;
    domain: string;
    /** Optional link to PolicyAuthority catalog (provenance only). */
    authority_id?: string;
  }>;
  policies: PackPolicyMeta[];
}

export interface InterpretedResult {
  decision:
    | 'ALLOW'
    | 'DENY'
    | 'TOKENIZE'
    | 'REDACT'
    | 'BLOCK_OUTPUT'
    | 'REVIEW';
  reason_codes: string[];
  eligible_models: string[];
  transforms: Array<{ type: string; targets: string[] }>;
  obligations: Obligation[];
  authorize_detokenization?: boolean;
  policy_id: string;
  policy_version: number;
  pack_id: string;
  matched: string[];
  /** Pack-agnostic provenance chain attached by pack interpreters. */
  provenance?: DecisionProvenance;
  /** Multi-pack resolution outcome when the generic resolver ran. */
  resolution?: ResolvedPolicyOutcome;
}

function isCloudModel(modelId: string): boolean {
  return (
    modelId.startsWith('cloud-') ||
    modelId.includes('public') ||
    modelId.includes('openai') ||
    modelId.includes('anthropic')
  );
}

/** Explicit attestation for controlled external processing of sensitive data. */
function externalProcessingAuthorized(facts: BaselineFacts): boolean {
  return (
    facts.governance_context?.sensitive_data_processing
      ?.external_processing_authorized === true
  );
}

function tokenizationAvailable(facts: BaselineFacts): boolean {
  return !!facts.has_entity_spans || (facts.entity_types?.length ?? 0) > 0;
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
    const clinicalOk =
      facts.application_type === 'clinical' && facts.roles.includes('clinician');

    if (cloudRequested) {
      matched.push('requested_cloud');
      // Default deny: PHI + public/external model without controlled-path evidence.
      if (!externalProcessingAuthorized(facts) || !clinicalOk) {
        matched.push(
          !clinicalOk ? 'phi_app_not_authorized' : 'external_processing_not_authorized',
        );
        return deny(meta, ['PHI_PUBLIC_CLOUD_BLOCKED'], matched);
      }
      // Fail closed: authorized external path still requires tokenize capability.
      if (!tokenizationAvailable(facts)) {
        matched.push('tokenize_unavailable');
        return deny(
          meta,
          ['PHI_PUBLIC_CLOUD_BLOCKED', 'TOKENIZE_UNAVAILABLE'],
          matched,
        );
      }

      // Controlled path: TOKENIZE then allow the requested external model.
      // Fail closed if the requested external model is not on the app allowlist —
      // never silently fall back to a local model when cloud was requested.
      matched.push('phi_external_tokenize');
      let controlledEligible = eligible.filter((m) => facts.allowed_models.includes(m));
      if (
        !facts.requested_model ||
        !controlledEligible.includes(facts.requested_model)
      ) {
        matched.push('requested_cloud_not_allowlisted');
        return deny(meta, ['MODEL_NOT_ELIGIBLE'], matched);
      }
      controlledEligible = [facts.requested_model];
      matched.push('restrict_to_requested');
      return {
        decision: 'TOKENIZE',
        reason_codes: [
          'PHI_REQUIRES_TOKENIZE',
          'EXTERNAL_MODEL_PRESENT',
          'PHI_EXTERNAL_CONTROLS_SATISFIED',
        ],
        eligible_models: controlledEligible,
        transforms: [{ type: 'tokenize', targets: ['PHI'] }],
        obligations: [
          { code: 'LOG_GOVERNANCE_EVENT' },
          {
            code: 'TOKENIZE_PII' as ObligationCode,
            parameters: { targets: ['PHI'] },
          },
          // No raw PHI egress — tokenized representation may go external.
          { code: 'NO_EXTERNAL_TRANSMISSION' },
        ],
        policy_id: meta.policy_id,
        policy_version: meta.version,
        pack_id: meta.pack_id,
        matched,
      };
    }

    eligible = eligible.filter((m) => m.startsWith('local-'));
    matched.push('phi_local_only');
    if (eligible.length === 0) {
      return deny(meta, ['PHI_REQUIRES_LOCAL_MODEL'], matched);
    }

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
        name: 'Enterprise AI request governance',
        phase: 'input',
        status: 'active',
        interpreter: 'baseline_input_v2',
        description:
          'Checks that only trusted, active applications can call AI, limits them to allowed operations, and protects sensitive input - credentials are blocked, PHI stays on local models for authorized clinical use, and PII or financial data must be tokenized before a model runs.',
        owner: 'security',
        priority: 100,
        scope_tier: 'enterprise',
        domain: 'enterprise',
        content_hash: 'sha256:baseline_input_v2',
        pack_name: 'Enterprise AI Baseline',
        pack_version: '2.0.0',
      },
      {
        policy_id: 'pol_phase5_response',
        version: 5,
        pack_id: 'pack_response_governance',
        name: 'Enterprise AI response governance',
        phase: 'output',
        status: 'active',
        interpreter: 'baseline_output_v5',
        description:
          'Reviews model responses before release: blocks PHI, credentials, and tool suggestions; redacts PII or financial content; and allows detokenization only for trusted, authorized callers.',
        owner: 'security',
        priority: 90,
        scope_tier: 'enterprise',
        domain: 'enterprise',
        content_hash: 'sha256:baseline_output_v5',
        pack_name: 'Response Governance',
        pack_version: '5.0.0',
      },
    ],
  };
}
