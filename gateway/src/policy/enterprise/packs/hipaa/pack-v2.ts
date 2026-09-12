import type { Obligation } from '../../types.js';
import type { BaselineFacts, InterpretedResult, PackPolicyMeta } from '../baseline.js';
import {
  HIPAA_CLASS_PROFILE,
  HIPAA_PROVENANCE_GRAPH,
  HIPAA_RULES,
  type HipaaCompiledRule,
} from './compiled-bundle.js';
import { loadHipaaPackSources } from './compile.js';
import {
  appendRuleProvenance,
  type ClassificationProvenance,
  type PackProvenanceGraph,
} from '../../provenance.js';
import { deriveWriteGovernanceClass } from './write-field-class.js';

const packRuntime = loadHipaaPackSources();
const rulesBundle = packRuntime.rules.length > 0 ? packRuntime.rules : HIPAA_RULES;
const classificationProfile = packRuntime.profile ?? HIPAA_CLASS_PROFILE;
const provenanceGraph: PackProvenanceGraph =
  packRuntime.provenance ?? HIPAA_PROVENANCE_GRAPH;

export type PolicyPurpose =
  | 'treatment'
  | 'payment'
  | 'healthcare_operations'
  | 'utilization_management'
  | 'prior_authorization'
  | 'care_management'
  | 'claims_processing'
  | 'provider_operations'
  | 'customer_support'
  | 'analytics'
  | 'research'
  | 'marketing'
  | 'administrative'
  | 'unknown'
  | (string & {});

export type HipaaPackFacts = BaselineFacts & {
  entity_types?: string[];
  has_entity_spans?: boolean;
  /** Enigma operational context — NOT a legal HIPAA classification. */
  health_sensitive?: boolean;
  health_context?: boolean;
  agent_id?: string;
  tool_id?: string;
  permitted_entity_types?: string[];
  /** Explicit release flag from Enigma release evaluation — not "clinician may see PHI". */
  release_conditions_satisfied?: boolean;
  regulatory_applicability?: string[];
  evidence_sufficient?: boolean;
  purpose?: PolicyPurpose;
  recipient?: string;
  source_system?: string;
  processing_location?: string;
  authorization_context?: string;
};

export type ClassificationProfileResult = {
  /** DETECTION layer */
  detection: {
    entity_types: string[];
    health_context: boolean;
    lexicon_hits: string[];
  };
  /** CLASSIFICATION layer (Enigma) */
  classification: {
    sensitivity: string;
    health_sensitive: boolean;
  };
  /** REGULATORY APPLICABILITY layer */
  regulatory: {
    applicability: string[];
    regulatory_classification?: string;
  };
  /** Explicit heuristic vs regulatory-reference separation */
  classification_provenance: ClassificationProvenance;
  reason_codes: string[];
  profile_id: string;
};

function phiRegulatoryReference(): ClassificationProvenance['regulatory_reference'] {
  return {
    source_ids: ['src_45cfr160'],
    citations: ['45 CFR 160.103'],
  };
}

function buildClassificationProvenance(input: {
  sensitivity: string;
  applicability: string[];
  heuristicRuleId?: string;
  basisType: NonNullable<ClassificationProvenance['classification_basis']>['type'];
}): ClassificationProvenance {
  const packs = input.applicability.includes('HIPAA') ? ['HIPAA'] : [];
  return {
    classification: input.sensitivity,
    classification_basis: {
      type: input.basisType,
      rule_id: input.heuristicRuleId,
    },
    regulatory_reference:
      input.sensitivity === 'PHI' || input.sensitivity === 'EPHI' || packs.length > 0
        ? phiRegulatoryReference()
        : undefined,
    applicability:
      packs.length > 0
        ? { packs, basis: 'ENIGMA_OPERATIONAL' }
        : { packs: [], basis: 'ENIGMA_OPERATIONAL' },
  };
}

function isCloudModel(modelId: string): boolean {
  return (
    modelId.startsWith('cloud-') ||
    modelId.includes('public') ||
    modelId.includes('openai') ||
    modelId.includes('anthropic')
  );
}

export function detectHealthContext(text: string): boolean {
  const lower = text.toLowerCase();
  return (classificationProfile.health_context_lexicon as readonly string[]).some((term) =>
    lower.includes(term.toLowerCase()),
  );
}

function lexiconHits(text: string): string[] {
  const lower = text.toLowerCase();
  return (classificationProfile.health_context_lexicon as readonly string[]).filter((term) =>
    lower.includes(term.toLowerCase()),
  );
}

/**
 * Apply HIPAA classification profile.
 * Evidence only — never an authorization decision.
 * Distinguishes: detection → Enigma classification → regulatory applicability.
 */
export function applyHipaaClassificationProfile(input: {
  text: string;
  sensitivity: string;
  entityTypes: string[];
  applicationType?: string;
  reasonCodes: string[];
}): ClassificationProfileResult {
  const alwaysPhi = new Set(classificationProfile.always_phi_entity_types as readonly string[]);
  const elevatable = new Set(
    classificationProfile.elevatable_pii_entity_types as readonly string[],
  );
  const health_context = detectHealthContext(input.text);
  const hits = lexiconHits(input.text);
  const hasAlways = input.entityTypes.some((t) => alwaysPhi.has(t));
  const hasElevatable = input.entityTypes.some((t) => elevatable.has(t));

  const reason_codes = [
    ...input.reasonCodes,
    `PROFILE:${classificationProfile.profile_id}`,
  ];

  // Never elevate away from credentials.
  if (input.sensitivity === 'Credential') {
    return {
      detection: {
        entity_types: input.entityTypes,
        health_context,
        lexicon_hits: hits,
      },
      classification: {
        sensitivity: 'Credential',
        health_sensitive: health_context || hasAlways,
      },
      regulatory: { applicability: [] },
      classification_provenance: buildClassificationProvenance({
        sensitivity: 'Credential',
        applicability: [],
        basisType: 'DETECTOR',
      }),
      reason_codes,
      profile_id: classificationProfile.profile_id,
    };
  }

  let sensitivity = input.sensitivity;
  let health_sensitive = health_context || hasAlways;
  const applicability: string[] = [];
  let regulatory_classification: string | undefined;
  let heuristicRuleId: string | undefined;
  let basisType: NonNullable<ClassificationProvenance['classification_basis']>['type'] =
    'REQUEST_SUPPLIED';

  if (hasAlways) {
    sensitivity = 'PHI';
    health_sensitive = true;
    applicability.push('HIPAA');
    regulatory_classification = 'PHI';
    heuristicRuleId = 'elev.always_phi_entity';
    basisType = 'ENIGMA_HEURISTIC';
    reason_codes.push('HIPAA_PROFILE_ALWAYS_PHI_ENTITY');
    reason_codes.push('REGULATORY_APPLICABILITY:HIPAA');
  } else if (hasElevatable && health_context) {
    sensitivity = 'PHI';
    health_sensitive = true;
    applicability.push('HIPAA');
    regulatory_classification = 'PHI';
    heuristicRuleId = 'elev.identifier_plus_health_context';
    basisType = 'ENIGMA_HEURISTIC';
    reason_codes.push('HIPAA_PROFILE_PII_ELEVATED_WITH_HEALTH_CONTEXT');
    reason_codes.push('REGULATORY_APPLICABILITY:HIPAA');
  } else if (health_context && !hasElevatable && !hasAlways) {
    // Enigma health-sensitive context only — NOT PHI, NOT HIPAA applicability.
    health_sensitive = true;
    heuristicRuleId = 'elev.health_context_only';
    basisType = 'ENIGMA_HEURISTIC';
    reason_codes.push('ENIGMA_HEALTH_SENSITIVE_CONTEXT');
  } else if (hasElevatable && !health_context) {
    // EMAIL alone etc. remains PII — no HIPAA applicability.
    basisType = 'ENIGMA_HEURISTIC';
    heuristicRuleId = 'elev.pii_without_health_context';
    reason_codes.push('ENIGMA_PII_WITHOUT_HEALTH_CONTEXT');
  }

  return {
    detection: {
      entity_types: input.entityTypes,
      health_context,
      lexicon_hits: hits,
    },
    classification: {
      sensitivity,
      health_sensitive,
    },
    regulatory: {
      applicability,
      regulatory_classification,
    },
    classification_provenance: buildClassificationProvenance({
      sensitivity,
      applicability,
      heuristicRuleId,
      basisType,
    }),
    reason_codes: [...new Set(reason_codes)],
    profile_id: classificationProfile.profile_id,
  };
}

function normalizePurpose(purpose?: string): string {
  if (!purpose || purpose.trim() === '') return 'unknown';
  return purpose.trim().toLowerCase().replace(/\s+/g, '_');
}

function isKnownPurpose(purpose: string): boolean {
  const known = new Set([
    'treatment',
    'payment',
    'healthcare_operations',
    'utilization_management',
    'prior_authorization',
    'care_management',
    'claims_processing',
    'provider_operations',
    'customer_support',
    'analytics',
    'research',
    'marketing',
    'administrative',
  ]);
  return known.has(purpose);
}

/** Purposes that are known but not authorized for general PHI AI processing. */
function isUnauthorizedPurpose(purpose: string): boolean {
  return purpose === 'marketing' || purpose === 'research';
}

/** Authorized purposes for PHI AI under this pack (TPO + care/ops). */
function isAuthorizedPurpose(purpose: string): boolean {
  return (
    isKnownPurpose(purpose) &&
    purpose !== 'unknown' &&
    !isUnauthorizedPurpose(purpose)
  );
}

export type AuthorizationContextState =
  | 'authorized'
  | 'unauthorized'
  | 'unknown'
  | 'absent'
  | 'delegated';

export function authorizationContextState(
  authorizationContext?: string,
): AuthorizationContextState {
  if (authorizationContext == null || String(authorizationContext).trim() === '') {
    return 'absent';
  }
  const raw = String(authorizationContext).trim().toLowerCase();
  if (raw.startsWith('delegated:') || raw === 'delegated') return 'delegated';
  if (
    raw === 'unauthorized' ||
    raw === 'denied' ||
    raw === 'revoked' ||
    raw === 'prohibited'
  ) {
    return 'unauthorized';
  }
  if (raw === 'unknown') return 'unknown';
  // Authorized family — includes Part 2 consent tokens and treatment relationship.
  if (
    raw === 'authorized' ||
    raw === 'treatment_relationship' ||
    raw === 'part2_consent' ||
    raw === 'baa_covered' ||
    raw === 'consent_present' ||
    raw.startsWith('authorized:')
  ) {
    return 'authorized';
  }
  // Unknown token — not silently approved.
  return 'unknown';
}

function agentAuthorizationState(
  facts: HipaaPackFacts,
): 'n/a' | 'authorized' | 'unauthorized' {
  if (!facts.agent_id) return 'n/a';
  if (facts.governance_context?.agent_authorized === false) return 'unauthorized';
  if (facts.governance_context?.agent_authorized === true) return 'authorized';
  const auth = authorizationContextState(facts.authorization_context);
  // Agent present without explicit authorization — fall back to authorization_context.
  // `unknown` is not an agent grant; require authorized/delegated or agent_authorized=true.
  if (auth === 'authorized' || auth === 'delegated') return 'authorized';
  return 'unauthorized';
}

function toolAuthorizationState(
  facts: HipaaPackFacts,
): 'n/a' | 'authorized' | 'unauthorized' {
  if (!facts.tool_id) return 'n/a';
  if (facts.governance_context?.tool_authorized === false) return 'unauthorized';
  if (facts.governance_context?.tool_authorized === true) return 'authorized';
  const auth = authorizationContextState(facts.authorization_context);
  if (auth === 'unauthorized') return 'unauthorized';
  // Tool requires explicit tool_authorized=true when tool_id is present.
  return 'unauthorized';
}

function excessEntityTypes(facts: HipaaPackFacts): string[] {
  const permitted = (facts.permitted_entity_types ?? [])
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (permitted.length === 0) return [];
  const permittedSet = new Set(permitted);
  const requested = (facts.entity_types ?? [])
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t && t !== 'DIAGNOSIS_MARKER');
  return [...new Set(requested.filter((t) => !permittedSet.has(t)))];
}

/** Regulatory HIPAA applicability — PHI/ePHI classification, not mere health-sensitive. */
function hipaaApplicable(facts: HipaaPackFacts): boolean {
  if (facts.regulatory_applicability?.includes('HIPAA')) return true;
  const cls = facts.classification.toUpperCase();
  return cls === 'PHI' || cls === 'EPHI';
}

function processingEnvironment(
  facts: HipaaPackFacts,
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

function evidenceSufficient(facts: HipaaPackFacts): boolean {
  if (facts.evidence_sufficient === false) return false;
  if (facts.evidence_sufficient === true) return true;

  // Missing / empty / unknown purpose must not silently approve PHI processing.
  if (facts.purpose === undefined || facts.purpose === null || facts.purpose === '') {
    return false;
  }
  const purpose = normalizePurpose(facts.purpose);
  if (purpose === 'unknown' || !isKnownPurpose(purpose)) return false;
  if (isUnauthorizedPurpose(purpose)) return false;

  const auth = authorizationContextState(facts.authorization_context);
  // Missing authorization context is insufficient. Explicit unauthorized is DENY
  // via a dedicated rule. `unknown` remains evaluable so Part 2 can own consent-unknown
  // REVIEW without forcing a second HIPAA REVIEW on the same fact.
  if (auth === 'absent' || auth === 'unauthorized') return false;

  return isAuthorizedPurpose(purpose);
}

/**
 * Required controls satisfied for PHI processing — Enigma evaluation, not a compliance certificate.
 * Local/private alone is NOT sufficient.
 * External/public-cloud may satisfy controls only when governed external processing is
 * explicitly authorized AND tokenization is available (Enigma control — not a HIPAA mandate).
 */
function requiredControlsSatisfied(
  facts: HipaaPackFacts,
  env: 'unauthorized_external' | 'local_or_private',
): boolean {
  if (facts.trust_level !== 'trusted') return false;
  if (facts.application_type !== 'clinical') return false;
  if (!facts.roles.includes('clinician')) return false;
  if (facts.purpose !== undefined && facts.purpose !== null && facts.purpose !== '') {
    const purpose = normalizePurpose(facts.purpose);
    if (purpose === 'unknown' || !isAuthorizedPurpose(purpose)) return false;
  } else {
    return false;
  }
  const auth = authorizationContextState(facts.authorization_context);
  if (auth === 'absent' || auth === 'unauthorized') return false;
  if (agentAuthorizationState(facts) === 'unauthorized') return false;
  if (toolAuthorizationState(facts) === 'unauthorized') return false;

  if (env === 'local_or_private') return true;

  // Controlled external path: attestation + tokenize capability required.
  const externalAuthorized =
    facts.governance_context?.sensitive_data_processing
      ?.external_processing_authorized === true;
  const tokenizeAvailable =
    !!facts.has_entity_spans || (facts.entity_types?.length ?? 0) > 0;
  return externalAuthorized && tokenizeAvailable;
}

function releaseConditionsSatisfied(facts: HipaaPackFacts): boolean {
  if (facts.release_conditions_satisfied === true) return true;
  if (facts.release_conditions_satisfied === false) return false;
  // Independent release evaluation — clinician role alone is NOT enough.
  const base =
    !!facts.allow_detokenization &&
    !!facts.contains_tokens &&
    !!facts.input_was_tokenized &&
    facts.trust_level === 'trusted' &&
    facts.application_type === 'clinical' &&
    facts.roles.includes('clinician');
  if (!base) return false;
  if (facts.purpose !== undefined && facts.purpose !== null && facts.purpose !== '') {
    const purpose = normalizePurpose(facts.purpose);
    if (purpose === 'unknown' || !isAuthorizedPurpose(purpose)) return false;
  } else {
    return false;
  }
  const auth = authorizationContextState(facts.authorization_context);
  if (auth === 'absent' || auth === 'unauthorized') return false;
  if (agentAuthorizationState(facts) === 'unauthorized') return false;
  if (toolAuthorizationState(facts) === 'unauthorized') return false;
  return true;
}

function matchInputRule(
  rule: HipaaCompiledRule,
  facts: HipaaPackFacts,
  env: string,
  controlsOk: boolean,
  evidenceOk: boolean,
): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'input') return false;
  if (c.regulatory_applicability === 'HIPAA' && !hipaaApplicable(facts)) return false;
  if (c.classification === 'PHI' && facts.classification.toUpperCase() !== 'PHI' && facts.classification.toUpperCase() !== 'EPHI') {
    return false;
  }
  if (c.processing_environment && c.processing_environment !== env) return false;
  if (c.required_controls_satisfied === true && !controlsOk) return false;
  if (c.required_controls_satisfied === false && controlsOk) return false;
  if (c.evidence_sufficient === false && evidenceOk) return false;
  if (c.evidence_sufficient === true && !evidenceOk) return false;
  if (Array.isArray(c.operation_in) && !c.operation_in.includes(facts.operation)) {
    return false;
  }
  if (Array.isArray(c.tool_id_in)) {
    if (!facts.tool_id || !c.tool_id_in.includes(facts.tool_id)) return false;
  }
  if (Array.isArray(c.action_kind_in)) {
    if (!facts.action_kind || !c.action_kind_in.includes(facts.action_kind)) {
      return false;
    }
  }
  if (c.write_governance_class != null) {
    if (facts.write_governance_class !== c.write_governance_class) return false;
  }
  if (c.has_entity_spans && !facts.has_entity_spans && !(facts.entity_types?.length)) {
    return false;
  }
  if (c.trust_level_not && facts.trust_level === c.trust_level_not) return false;
  if (c.authorization_state != null) {
    if (authorizationContextState(facts.authorization_context) !== c.authorization_state) {
      return false;
    }
  }
  if (c.unauthorized_purpose === true) {
    const purpose = normalizePurpose(facts.purpose);
    if (!isUnauthorizedPurpose(purpose)) return false;
  }
  if (c.agent_unauthorized === true && agentAuthorizationState(facts) !== 'unauthorized') {
    return false;
  }
  if (c.tool_unauthorized === true && toolAuthorizationState(facts) !== 'unauthorized') {
    return false;
  }
  if (c.excess_entity_types === true && excessEntityTypes(facts).length === 0) {
    return false;
  }
  if (c.agent_present === true && !facts.agent_id) return false;
  if (c.tool_present === true && !facts.tool_id) return false;
  if (c.clinician_role === false && facts.roles.includes('clinician')) return false;
  if (c.clinician_role === true && !facts.roles.includes('clinician')) return false;
  return true;
}

function matchOutputRule(rule: HipaaCompiledRule, facts: HipaaPackFacts): boolean {
  const c = rule.conditions;
  if (rule.phase !== 'output') return false;
  const releaseOk = releaseConditionsSatisfied(facts);
  if (c.release_conditions_satisfied === false && releaseOk) return false;
  if (c.release_conditions_satisfied === true && !releaseOk) return false;
  // Legacy alias
  if (c.release_authorized === false && releaseOk) return false;
  if (c.release_authorized === true && !releaseOk) return false;
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
  if (c.contains_tokens_only === false) {
    if (facts.contains_tokens && String(facts.inspection_sensitivity).toUpperCase() !== 'PHI') {
      return false;
    }
  }
  return true;
}

function mergeObligations(base: Obligation[], codes: string[] | undefined): Obligation[] {
  const next = [...base];
  for (const code of codes ?? []) {
    if (!next.some((o) => o.code === code)) {
      next.push({ code });
    }
  }
  return next;
}

function classificationProvenanceFromFacts(facts: HipaaPackFacts): ClassificationProvenance {
  const hipaa = hipaaApplicable(facts);
  return buildClassificationProvenance({
    sensitivity: facts.classification,
    applicability: hipaa ? ['HIPAA'] : [],
    basisType: 'REQUEST_SUPPLIED',
  });
}

function applyRule(
  rule: HipaaCompiledRule,
  meta: PackPolicyMeta,
  current: InterpretedResult,
  facts?: HipaaPackFacts,
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
  if (rule.decision === 'TRANSFORM') enforcementActions.push('TOKENIZE');
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

  if (rule.decision === 'TRANSFORM') {
    let transforms = rule.transforms ?? [{ type: 'tokenize', targets: ['PHI'] }];
    let decision: InterpretedResult['decision'] = 'TOKENIZE';
    if (rule.conditions.excess_entity_types === true && facts) {
      const excess = excessEntityTypes(facts);
      transforms = [{ type: 'redact', targets: excess }];
      decision = 'REDACT';
    }
    const obligations = mergeObligations(current.obligations, rule.enigma_obligations);
    const forceLocal = obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY');
    return {
      ...current,
      decision,
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      eligible_models: forceLocal
        ? current.eligible_models.filter(
            (m) => m.startsWith('local-') || m.includes('private'),
          )
        : current.eligible_models,
      transforms,
      obligations,
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched,
      provenance,
    };
  }

  if (rule.decision === 'ALLOW_WITH_CONTROLS') {
    const keepExternalTokenizePath =
      (current.decision === 'TOKENIZE' || current.decision === 'REDACT') &&
      current.eligible_models.some((m) => isCloudModel(m));
    return {
      ...current,
      decision:
        current.decision === 'DENY' || current.decision === 'REVIEW'
          ? current.decision
          : current.decision === 'TOKENIZE' || current.decision === 'REDACT'
            ? current.decision
            : 'ALLOW',
      reason_codes: [...(rule.reason_codes ?? []), ...current.reason_codes],
      eligible_models: keepExternalTokenizePath
        ? current.eligible_models
        : current.eligible_models.filter(
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

/**
 * HIPAA pack v3 input interpreter.
 * Gates on regulatory PHI applicability — not mere health-sensitive context.
 */
export function applyHipaaPackV3Input(
  current: InterpretedResult,
  facts: HipaaPackFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (meta.status !== 'active') return current;

  if (!hipaaApplicable(facts)) {
    const marker = facts.health_sensitive
      ? 'hipaa_pack_v3_skip_health_sensitive_not_phi'
      : 'hipaa_pack_v3_skip_not_applicable';
    return { ...current, matched: [...current.matched, marker] };
  }

  if (current.decision === 'DENY') {
    return {
      ...current,
      obligations: mergeObligations(current.obligations, [
        'LOCAL_MODEL_ONLY',
        'NO_EXTERNAL_TRANSMISSION',
        'LOG_GOVERNANCE_EVENT',
      ]),
      matched: [...current.matched, 'hipaa_pack_v3_reinforces_deny'],
    };
  }

  const env = processingEnvironment(facts, current);
  const controlsOk = requiredControlsSatisfied(facts, env);
  const evidenceOk = evidenceSufficient(facts);
  const writeClass = deriveWriteGovernanceClass(facts);
  const enrichedFacts: HipaaPackFacts = {
    ...facts,
    ...(writeClass ? { write_governance_class: writeClass } : {}),
  };

  const inputRules = rulesBundle
    .filter((r) => r.phase === 'input')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const authState = authorizationContextState(enrichedFacts.authorization_context);
  const agentState = agentAuthorizationState(enrichedFacts);
  const toolState = toolAuthorizationState(enrichedFacts);
  const excess = excessEntityTypes(enrichedFacts);

  let result: InterpretedResult = {
    ...current,
    matched: [
      ...current.matched,
      'hipaa_pack_v3',
      `processing_environment:${env}`,
      `required_controls_satisfied:${controlsOk}`,
      `evidence_sufficient:${evidenceOk}`,
      `purpose:${normalizePurpose(enrichedFacts.purpose)}`,
      `authorization_context:${authState}`,
      `agent_authorization:${agentState}`,
      `tool_authorization:${toolState}`,
      ...(enrichedFacts.agent_id ? [`agent_id:${enrichedFacts.agent_id}`] : []),
      ...(enrichedFacts.tool_id ? [`tool_id:${enrichedFacts.tool_id}`] : []),
      ...(enrichedFacts.action_kind
        ? [`action_kind:${enrichedFacts.action_kind}`]
        : []),
      ...(typeof enrichedFacts.action_attributes?.field === 'string'
        ? [`action_field:${enrichedFacts.action_attributes.field}`]
        : []),
      ...(enrichedFacts.write_governance_class
        ? [`write_governance_class:${enrichedFacts.write_governance_class}`]
        : []),
      ...(excess.length ? [`excess_entity_types:${excess.join(',')}`] : []),
    ],
    provenance: {
      matched_rules: current.provenance?.matched_rules ?? [],
      sources: current.provenance?.sources,
      classification: classificationProvenanceFromFacts(enrichedFacts),
      controls: current.provenance?.controls,
      enforcement: current.provenance?.enforcement,
    },
  };

  for (const rule of inputRules) {
    if (!matchInputRule(rule, enrichedFacts, env, controlsOk, evidenceOk)) continue;
    result = applyRule(rule, meta, result, enrichedFacts);
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

export function applyHipaaPackV3Output(
  current: InterpretedResult,
  facts: HipaaPackFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (meta.status !== 'active') return current;

  const outputRules = rulesBundle
    .filter((r) => r.phase === 'output')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  let result: InterpretedResult = {
    ...current,
    matched: [
      ...current.matched,
      'hipaa_pack_v3_output',
      `release_conditions_satisfied:${releaseConditionsSatisfied(facts)}`,
    ],
  };

  for (const rule of outputRules) {
    if (!matchOutputRule(rule, facts)) continue;
    result = applyRule(rule, meta, result, facts);
    if (result.decision === 'BLOCK_OUTPUT') break;
    if (result.authorize_detokenization) break;
  }
  return result;
}

/** @deprecated Use applyHipaaPackV3Input — alias for suspended interpreter reactivation. */
export const applyHipaaPackV2Input = applyHipaaPackV3Input;
/** @deprecated Use applyHipaaPackV3Output — alias for suspended interpreter reactivation. */
export const applyHipaaPackV2Output = applyHipaaPackV3Output;
