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
  /**
   * Output phase: input interrogation found tokenizable PHI/PII spans.
   * Used to fail closed when a PHI request skipped TOKENIZE.
   */
  input_had_entity_spans?: boolean;
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
   * Server-derived action category (Phase D). Never client-supplied.
   */
  action_category?: string;
  /**
   * Server-derived write governance class (HIPAA pack / Phase D snapshot).
   * Never client-supplied — computed from declared action facts + allowlists.
   */
  write_governance_class?:
    | 'CLINICAL_NOTE'
    | 'ADMINISTRATIVE_LOW_RISK'
    | 'UNKNOWN';
  /** Minimum-necessary permitted entity types when scoped by the caller. */
  permitted_entity_types?: string[];
  /**
   * Enforcement boundary for this action path (Phase D fact).
   */
  action_enforcement_boundary?:
    | 'gateway_enforced'
    | 'client_commit_required';
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

/**
 * After TOKENIZE on input, an authorized clinician may receive the clinical answer
 * even when the reply itself is PHI (e.g. diagnoses). Residual plaintext identifiers
 * (MRN, name, contact, etc.) still fail closed. Detokenize separately when vault
 * tokens are present in the response.
 */
const RESIDUAL_IDENTIFIER_TYPES = new Set([
  'MRN',
  'NPI',
  'SSN',
  'EMAIL',
  'PHONE',
  'NAME',
  'DOB',
  'ADDRESS',
  'CREDIT_CARD',
  'IBAN',
  'ROUTING_NUMBER',
]);

export function hasResidualPlaintextIdentifiers(facts: BaselineFacts): boolean {
  return (facts.entity_types ?? []).some((t) =>
    RESIDUAL_IDENTIFIER_TYPES.has(String(t).toUpperCase()),
  );
}

export function authorizedTokenizedClinicalRelease(facts: BaselineFacts): boolean {
  if (!facts.input_was_tokenized) return false;
  if (hasResidualPlaintextIdentifiers(facts)) return false;
  if (facts.trust_level !== 'trusted') return false;
  if (facts.application_type !== 'clinical') return false;
  if (!facts.roles.includes('clinician')) return false;
  const purpose = String(facts.purpose ?? '')
    .trim()
    .toLowerCase();
  if (!purpose || purpose === 'unknown') return false;
  if (
    purpose.includes('marketing') ||
    purpose.includes('sale') ||
    purpose === 'unauthorized'
  ) {
    return false;
  }
  const auth = String(facts.authorization_context ?? '')
    .trim()
    .toLowerCase();
  if (!auth || auth === 'absent' || auth === 'unauthorized' || auth === 'unknown') {
    return false;
  }
  if (facts.governance_context?.agent_authorized === false) return false;
  if (facts.governance_context?.tool_authorized === false) return false;
  return true;
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

function runtimeActorReasonCodes(facts: BaselineFacts): string[] {
  const ra = (facts.governance_context as { runtime_actor?: { substrate?: { reason_codes?: string[] } } } | undefined)
    ?.runtime_actor?.substrate?.reason_codes;
  return Array.isArray(ra) ? ra.filter((c) => typeof c === 'string') : [];
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

  // Phase A — shared runtime actor substrate (server-derived facts via governance_context).
  if (facts.agent_id && facts.governance_context?.agent_authorized === false) {
    matched.push('agent_unauthorized');
    const extra = runtimeActorReasonCodes(facts).filter(
      (c) => c !== 'AGENT_UNAUTHORIZED',
    );
    return deny(meta, ['AGENT_UNAUTHORIZED', ...extra], matched);
  }
  if (facts.tool_id && facts.governance_context?.tool_authorized === false) {
    matched.push('tool_unauthorized');
    const extra = runtimeActorReasonCodes(facts).filter(
      (c) => c !== 'TOOL_UNAUTHORIZED',
    );
    return deny(meta, ['TOOL_UNAUTHORIZED', ...extra], matched);
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
    const cloudEligible = eligible.filter((m) => isCloudModel(m));
    // Controlled external path: clinical + attestation + cloud allowlist.
    // Tokenizer is always available on the appliance; entity spans are not required
    // to *enter* the path (requests may be PHI via semantic classification only).
    const canExternalTokenize =
      clinicalOk &&
      externalProcessingAuthorized(facts) &&
      cloudEligible.length > 0 &&
      facts.deployment_mode !== 'airgap';

    // Stable clinical path: detectable PHI + external attestation + cloud allowlist
    // → TOKENIZE to cloud (even if the client requested a local model).
    if (canExternalTokenize) {
      matched.push('phi_external_tokenize');
      if (cloudRequested && !cloudEligible.includes(facts.requested_model!)) {
        matched.push('requested_cloud_not_allowlisted');
        return deny(meta, ['MODEL_NOT_ELIGIBLE'], matched);
      }
      const preferredCloud =
        cloudRequested && cloudEligible.includes(facts.requested_model!)
          ? facts.requested_model!
          : cloudEligible.includes('cloud-public-gpt')
            ? 'cloud-public-gpt'
            : cloudEligible[0]!;
      if (!cloudRequested) {
        matched.push('phi_upgrade_to_cloud');
      }
      matched.push('restrict_to_requested');
      return {
        decision: 'TOKENIZE',
        reason_codes: [
          'PHI_REQUIRES_TOKENIZE',
          'EXTERNAL_MODEL_PRESENT',
          'PHI_EXTERNAL_CONTROLS_SATISFIED',
        ],
        eligible_models: [preferredCloud],
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
      // Cloud requested but not on the app allowlist — never fall back to local.
      matched.push('requested_cloud_not_allowlisted');
      return deny(meta, ['MODEL_NOT_ELIGIBLE'], matched);
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

    // Never send raw detectable PHI to a local model — TOKENIZE first.
    if (tokenizationAvailable(facts)) {
      matched.push('phi_local_tokenize');
      if (facts.requested_model && eligible.includes(facts.requested_model)) {
        eligible = [facts.requested_model];
        matched.push('restrict_to_requested');
      }
      return {
        decision: 'TOKENIZE',
        reason_codes: ['PHI_REQUIRES_TOKENIZE'],
        eligible_models: eligible,
        transforms: [{ type: 'tokenize', targets: ['PHI'] }],
        obligations: [
          { code: 'LOG_GOVERNANCE_EVENT' },
          {
            code: 'TOKENIZE_PII' as ObligationCode,
            parameters: { targets: ['PHI'] },
          },
          { code: 'LOCAL_MODEL_ONLY' },
          { code: 'NO_EXTERNAL_TRANSMISSION' },
        ],
        policy_id: meta.policy_id,
        policy_version: meta.version,
        pack_id: meta.pack_id,
        matched,
      };
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
    if (authorizedTokenizedClinicalRelease(facts)) {
      matched.push('response_phi_authorized_after_tokenize');
      // Fall through: release clinical answer to authorized clinician.
    } else {
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
  }

  // Fail closed: PHI requests with detectable entities must TOKENIZE on input.
  // Prevents inconsistent RELEASE when the model reply looks "Internal" but the
  // chart path skipped tokenization (plaintext PHI to the model).
  const requestPhi =
    facts.classification === 'PHI' ||
    facts.classification === 'EPHI' ||
    String(facts.classification).toUpperCase() === 'PHI';
  if (requestPhi && facts.input_had_entity_spans && !facts.input_was_tokenized) {
    matched.push('phi_plaintext_input_output_blocked');
    return {
      decision: 'BLOCK_OUTPUT',
      reason_codes: ['PHI_OUTPUT_REQUIRES_TOKENIZED_INPUT'],
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

  const clinicalRelease = authorizedTokenizedClinicalRelease(facts);
  const reason_codes = authorize
    ? ['RESPONSE_RELEASE', 'DETOKENIZE_AUTHORIZED']
    : clinicalRelease && facts.inspection_sensitivity === 'PHI'
      ? ['RESPONSE_RELEASE', 'PHI_CLINICAL_RELEASE_AFTER_TOKENIZE']
      : ['RESPONSE_RELEASE'];
  const obligations: Obligation[] = [{ code: 'LOG_GOVERNANCE_EVENT' }];
  if (authorize) {
    obligations.push({ code: 'AUTHORIZE_DETOKENIZATION' });
    matched.push('detokenize_authorized');
  } else {
    matched.push(clinicalRelease ? 'response_phi_clinical_release' : 'response_release');
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
