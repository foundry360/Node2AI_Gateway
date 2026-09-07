/**
 * Compiled HIPAA pack artifacts (from gateway/policy-packs/hipaa).
 * Pack version 3.1.0 — provenance & evidence hardening. Policy semantics unchanged from v3.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export const HIPAA_CLASS_PROFILE = {
  profile_id: 'hipaa_class_profile_v3',
  version: '3.1.0',
  prior_profile_id: 'hipaa_class_profile_v2',
  always_phi_entity_types: ['MRN', 'NPI', 'DOB', 'DIAGNOSIS_MARKER'] as const,
  elevatable_pii_entity_types: ['SSN', 'EMAIL', 'PHONE'] as const,
  health_context_lexicon: [
    'patient',
    'clinical',
    'hipaa',
    'prescription',
    'lab result',
    'ehr',
    'diagnosis',
    'treatment',
    'health plan',
    'medical record',
  ] as const,
} as const;

export type HipaaCompiledRule = {
  rule_id: string;
  name: string;
  phase: 'input' | 'output';
  priority: number;
  conditions: Record<string, unknown>;
  decision:
    | 'DENY'
    | 'ALLOW_WITH_CONTROLS'
    | 'TRANSFORM'
    | 'BLOCK_OUTPUT'
    | 'AUTHORIZED_DETOKENIZATION'
    | 'REVIEW';
  reason_codes: string[];
  obligation_ids?: string[];
  control_ids?: string[];
  enigma_obligations?: string[];
  transforms?: Array<{ type: string; targets: string[] }>;
  authorize_detokenization?: boolean;
  sources?: string[];
  source_type?: string;
  derived_from?: string[];
  requirement_type?: string;
  note?: string;
};

export const HIPAA_RULES: HipaaCompiledRule[] = [
  {
    rule_id: 'HIPAA-R-INPUT-EXTERNAL-DENY',
    name: 'Deny PHI when external processing controls are not satisfied',
    phase: 'input',
    priority: 100,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'HIPAA',
      classification: 'PHI',
      processing_environment: 'unauthorized_external',
      required_controls_satisfied: false,
    },
    decision: 'DENY',
    reason_codes: ['HIPAA_PHI_EXTERNAL_CONTROLS_NOT_SATISFIED'],
    obligation_ids: ['HIPAA-OBL-TRANSMISSION', 'HIPAA-OBL-PHI-PROTECTION'],
    control_ids: ['ctrl_transmission_security', 'ctrl_audit_logging'],
    enigma_obligations: ['LOCAL_MODEL_ONLY', 'NO_EXTERNAL_TRANSMISSION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_45cfr164'],
    source_type: 'DERIVED_CONTROL',
    derived_from: ['src_45cfr164'],
  },
  {
    rule_id: 'HIPAA-R-INPUT-WRITE-DENY',
    name: 'Deny PHI write/export/share without authorization path',
    phase: 'input',
    priority: 90,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'HIPAA',
      classification: 'PHI',
      operation_in: ['write', 'export', 'share', 'transmit'],
    },
    decision: 'DENY',
    reason_codes: ['HIPAA_PHI_WRITEBACK_NOT_AUTHORIZED'],
    obligation_ids: ['HIPAA-OBL-DISCLOSURE', 'HIPAA-OBL-INTEGRITY'],
    control_ids: ['ctrl_no_write_back', 'ctrl_audit_logging'],
    enigma_obligations: ['NO_WRITE_BACK', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_45cfr164'],
    source_type: 'DERIVED_CONTROL',
    derived_from: ['src_45cfr164'],
  },
  {
    rule_id: 'HIPAA-R-INPUT-INSUFFICIENT-EVIDENCE',
    name: 'Review when PHI applicability evidence is insufficient',
    phase: 'input',
    priority: 80,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'HIPAA',
      classification: 'PHI',
      evidence_sufficient: false,
    },
    decision: 'REVIEW',
    reason_codes: ['HIPAA_PHI_INSUFFICIENT_EVIDENCE_FOR_PROCESSING'],
    obligation_ids: ['HIPAA-OBL-AUTHORIZATION', 'HIPAA-OBL-AUDIT'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_45cfr164'],
    source_type: 'DERIVED_CONTROL',
    derived_from: ['src_45cfr164'],
    note: 'Unknown purpose or missing authorization context does not silently become approved.',
  },
  {
    rule_id: 'HIPAA-R-INPUT-CONTROLS-SATISFIED',
    name: 'Allow with controls when PHI processing controls are satisfied',
    phase: 'input',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'HIPAA',
      classification: 'PHI',
      processing_environment: 'local_or_private',
      required_controls_satisfied: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED'],
    obligation_ids: [
      'HIPAA-OBL-PHI-PROTECTION',
      'HIPAA-OBL-AUDIT',
      'HIPAA-OBL-TRANSMISSION',
      'HIPAA-OBL-ACCESS',
    ],
    control_ids: [
      'ctrl_processing_environment',
      'ctrl_audit_logging',
      'ctrl_output_inspection',
    ],
    enigma_obligations: [
      'LOCAL_MODEL_ONLY',
      'NO_EXTERNAL_TRANSMISSION',
      'LOG_GOVERNANCE_EVENT',
    ],
    sources: ['src_45cfr164'],
    source_type: 'DERIVED_CONTROL',
    derived_from: ['src_45cfr164'],
    note: 'Does NOT assert HIPAA compliance.',
  },
  {
    rule_id: 'HIPAA-R-INPUT-TOKENIZE-OPTION',
    name: 'Select Enigma tokenization when entity spans exist on non-fully-trusted path',
    phase: 'input',
    priority: 40,
    requirement_type: 'IMPLEMENTATION_OPTION',
    conditions: {
      regulatory_applicability: 'HIPAA',
      classification: 'PHI',
      has_entity_spans: true,
      trust_level_not: 'trusted',
    },
    decision: 'TRANSFORM',
    reason_codes: ['ENIGMA_TOKENIZE_SELECTED'],
    obligation_ids: ['HIPAA-OBL-MINIMUM-NECESSARY', 'HIPAA-OBL-PHI-PROTECTION'],
    control_ids: ['ctrl_tokenization', 'ctrl_audit_logging'],
    enigma_obligations: [
      'TOKENIZE_PII',
      'LOCAL_MODEL_ONLY',
      'NO_EXTERNAL_TRANSMISSION',
      'LOG_GOVERNANCE_EVENT',
    ],
    transforms: [{ type: 'tokenize', targets: ['PHI'] }],
    sources: ['src_45cfr164'],
    source_type: 'IMPLEMENTATION_OPTION',
    note: 'TOKENIZE is an Enigma implementation_option, not a regulatory mandate',
  },
  {
    rule_id: 'HIPAA-R-OUT-RESIDUAL-PHI-BLOCK',
    name: 'Block residual plaintext PHI when release conditions are not satisfied',
    phase: 'output',
    priority: 100,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      inspection_sensitivity: 'PHI',
      release_conditions_satisfied: false,
      contains_tokens_only: false,
    },
    decision: 'BLOCK_OUTPUT',
    reason_codes: ['HIPAA_PHI_OUTPUT_NOT_AUTHORIZED'],
    obligation_ids: ['HIPAA-OBL-DISCLOSURE', 'HIPAA-OBL-PHI-PROTECTION'],
    control_ids: ['ctrl_output_inspection', 'ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_45cfr164'],
    source_type: 'DERIVED_CONTROL',
    derived_from: ['src_45cfr164'],
  },
  {
    rule_id: 'HIPAA-R-OUT-RELEASE-EVAL',
    name: 'Enigma release policy may authorize detokenization when release conditions are satisfied',
    phase: 'output',
    priority: 50,
    requirement_type: 'IMPLEMENTATION_OPTION',
    conditions: {
      contains_tokens: true,
      input_was_tokenized: true,
      release_conditions_satisfied: true,
    },
    decision: 'AUTHORIZED_DETOKENIZATION',
    reason_codes: ['ENIGMA_RELEASE_AUTHORIZED_DETOKENIZATION'],
    obligation_ids: ['HIPAA-OBL-DISCLOSURE', 'HIPAA-OBL-ACCESS'],
    control_ids: ['ctrl_authorized_release', 'ctrl_audit_logging'],
    enigma_obligations: ['AUTHORIZE_DETOKENIZATION', 'LOG_GOVERNANCE_EVENT'],
    authorize_detokenization: true,
    sources: ['src_45cfr164'],
    source_type: 'IMPLEMENTATION_OPTION',
    derived_from: ['src_45cfr164'],
    note: 'HIPAA obligations inform evaluation; Enigma release policy decides; gateway enforces.',
  },
];

export const HIPAA_PACK_META = {
  pack_id: 'pack_hipaa',
  pack_version: '3.1.0',
  classification_profile_id: HIPAA_CLASS_PROFILE.profile_id,
  input_interpreter: 'hipaa_pack_v3' as const,
  output_interpreter: 'hipaa_pack_v3_output' as const,
  input_policy_id: 'pol_hipaa_phi_local',
  input_version: 3,
  output_policy_id: 'pol_hipaa_release',
  output_version: 2,
  prior_overlay_interpreter: 'hipaa_overlay_v1' as const,
  prior_input_interpreter: 'hipaa_pack_v2' as const,
  prior_output_interpreter: 'hipaa_pack_v2_output' as const,
};

/** Fallback provenance graph when docs-as-code pack files are unavailable. */
export const HIPAA_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    src_45cfr160: {
      source_id: 'src_45cfr160',
      authority: '45 CFR Part 160',
      authority_tier: 1,
      authority_type: 'PRIMARY_REGULATORY',
      legal_authority: true,
      authority_id: POLICY_AUTHORITY_IDS.hipaa,
      title: 'General Administrative Requirements',
      publisher: 'U.S. Department of Health and Human Services',
      citation: '45 CFR Part 160',
      canonical_url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-160',
      effective_date: null,
      retrieved_date: null,
      version: 'current',
    },
    src_45cfr164: {
      source_id: 'src_45cfr164',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      authority_type: 'PRIMARY_REGULATORY',
      legal_authority: true,
      authority_id: POLICY_AUTHORITY_IDS.hipaa,
      title: 'Security and Privacy',
      publisher: 'U.S. Department of Health and Human Services',
      citation: '45 CFR Part 164',
      canonical_url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164',
      effective_date: null,
      retrieved_date: null,
      version: 'current',
    },
    src_hhs_deid: {
      source_id: 'src_hhs_deid',
      authority: 'HHS/OCR De-identification Guidance',
      authority_tier: 2,
      authority_type: 'OFFICIAL_REGULATORY_GUIDANCE',
      legal_authority: false,
      title:
        'Guidance Regarding Methods for De-identification of Protected Health Information in Accordance with the Health Insurance Portability and Accountability Act (HIPAA) Privacy Rule',
      publisher: 'U.S. Department of Health and Human Services / Office for Civil Rights',
      citation: 'HHS Guidance on De-identification of Protected Health Information',
      canonical_url:
        'https://www.hhs.gov/hipaa/for-professionals/privacy/special-topics/de-identification/index.html',
      effective_date: null,
      retrieved_date: null,
      version: null,
    },
    src_nist_800_66_r2: {
      source_id: 'src_nist_800_66_r2',
      authority: 'NIST SP 800-66 Rev. 2',
      authority_tier: 4,
      authority_type: 'IMPLEMENTATION_GUIDANCE',
      legal_authority: false,
      title:
        'Implementing the Health Insurance Portability and Accountability Act (HIPAA) Security Rule: A Cybersecurity Resource Guide',
      publisher: 'National Institute of Standards and Technology',
      citation: 'NIST SP 800-66 Rev. 2',
      canonical_url: 'https://csrc.nist.gov/pubs/sp/800/66/r2/final',
      effective_date: null,
      retrieved_date: null,
      version: 'Rev. 2',
      note: 'Implementation/reference mapping — not legal authority for DENY decisions alone',
    },
  },
  obligations: {
    'HIPAA-OBL-PHI-PROTECTION': {
      obligation_id: 'HIPAA-OBL-PHI-PROTECTION',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.306', '45 CFR 164.530'],
      source_ids: ['src_45cfr164'],
    },
    'HIPAA-OBL-ACCESS': {
      obligation_id: 'HIPAA-OBL-ACCESS',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.312(a)'],
      source_ids: ['src_45cfr164'],
    },
    'HIPAA-OBL-MINIMUM-NECESSARY': {
      obligation_id: 'HIPAA-OBL-MINIMUM-NECESSARY',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.502(b)'],
      source_ids: ['src_45cfr164'],
    },
    'HIPAA-OBL-AUDIT': {
      obligation_id: 'HIPAA-OBL-AUDIT',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.312(b)'],
      source_ids: ['src_45cfr164'],
    },
    'HIPAA-OBL-TRANSMISSION': {
      obligation_id: 'HIPAA-OBL-TRANSMISSION',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.312(e)'],
      source_ids: ['src_45cfr164'],
    },
    'HIPAA-OBL-INTEGRITY': {
      obligation_id: 'HIPAA-OBL-INTEGRITY',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.312(c)'],
      source_ids: ['src_45cfr164'],
    },
    'HIPAA-OBL-AVAILABILITY': {
      obligation_id: 'HIPAA-OBL-AVAILABILITY',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.308(a)(7)'],
      source_ids: ['src_45cfr164'],
      informational: true,
    },
    'HIPAA-OBL-DISCLOSURE': {
      obligation_id: 'HIPAA-OBL-DISCLOSURE',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.502', '45 CFR 164.506'],
      source_ids: ['src_45cfr164'],
    },
    'HIPAA-OBL-AUTHORIZATION': {
      obligation_id: 'HIPAA-OBL-AUTHORIZATION',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.508'],
      source_ids: ['src_45cfr164'],
    },
    'HIPAA-OBL-DEIDENTIFICATION': {
      obligation_id: 'HIPAA-OBL-DEIDENTIFICATION',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '45 CFR Part 164',
      authority_tier: 1,
      citations: ['45 CFR 164.514'],
      source_ids: ['src_45cfr164', 'src_hhs_deid'],
      informational: true,
    },
  },
};
