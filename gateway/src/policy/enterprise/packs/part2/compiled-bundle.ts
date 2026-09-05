/**
 * Compiled 42 CFR Part 2 pack artifacts (Pack #2).
 * Pack version 1.0.0 — architecture-validation MVP.
 */

import type { PackProvenanceGraph } from '../../provenance.js';

export type Part2CompiledRule = {
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

export const PART2_RULES: Part2CompiledRule[] = [
  {
    rule_id: 'PART2-R-INPUT-NO-CONSENT-DENY',
    name: 'Deny Part 2 record processing on unauthorized external path without consent',
    phase: 'input',
    priority: 100,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'PART2',
      processing_environment: 'unauthorized_external',
      part2_consent_satisfied: false,
    },
    decision: 'DENY',
    reason_codes: ['PART2_CONSENT_REQUIRED_EXTERNAL_DENIED'],
    obligation_ids: ['PART2-OBL-CONFIDENTIALITY', 'PART2-OBL-CONSENT'],
    control_ids: ['ctrl_transmission_security', 'ctrl_audit_logging'],
    enigma_obligations: ['LOCAL_MODEL_ONLY', 'NO_EXTERNAL_TRANSMISSION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_42cfr2'],
    derived_from: ['src_42cfr2'],
  },
  {
    rule_id: 'PART2-R-INPUT-WRITE-DENY',
    name: 'Deny Part 2 write/export/share without consent evidence',
    phase: 'input',
    priority: 90,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'PART2',
      operation_in: ['write', 'export', 'share', 'transmit'],
      part2_consent_satisfied: false,
    },
    decision: 'DENY',
    reason_codes: ['PART2_DISCLOSURE_WITHOUT_CONSENT_DENIED'],
    obligation_ids: ['PART2-OBL-CONSENT', 'PART2-OBL-PROCEEDINGS-PROTECTION'],
    control_ids: ['ctrl_no_write_back', 'ctrl_audit_logging'],
    enigma_obligations: ['NO_WRITE_BACK', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_42cfr2'],
    derived_from: ['src_42cfr2'],
  },
  {
    rule_id: 'PART2-R-INPUT-USE-WITHOUT-CONSENT-DENY',
    name: 'Deny Part 2 record use when consent is not evidenced',
    phase: 'input',
    priority: 85,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'PART2',
      part2_consent_satisfied: false,
      part2_consent_unknown: false,
    },
    decision: 'DENY',
    reason_codes: ['PART2_USE_WITHOUT_CONSENT_DENIED'],
    obligation_ids: ['PART2-OBL-CONFIDENTIALITY', 'PART2-OBL-CONSENT'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: [
      'LOCAL_MODEL_ONLY',
      'NO_EXTERNAL_TRANSMISSION',
      'LOG_GOVERNANCE_EVENT',
    ],
    sources: ['src_42cfr2'],
    derived_from: ['src_42cfr2'],
    note: 'Use of Part 2 records is restricted under §2.13 unless Part 2 permits; MVP requires evidenced consent.',
  },
  {
    rule_id: 'PART2-R-INPUT-INSUFFICIENT-CONSENT',
    name: 'Review when Part 2 consent evidence is insufficient',
    phase: 'input',
    priority: 80,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'PART2',
      part2_consent_unknown: true,
    },
    decision: 'REVIEW',
    reason_codes: ['PART2_CONSENT_EVIDENCE_INSUFFICIENT'],
    obligation_ids: ['PART2-OBL-CONSENT', 'PART2-OBL-APPLICABILITY'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_42cfr2'],
    derived_from: ['src_42cfr2'],
  },
  {
    rule_id: 'PART2-R-INPUT-CONTROLS-SATISFIED',
    name: 'Allow with controls when Part 2 processing conditions are satisfied',
    phase: 'input',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'PART2',
      processing_environment: 'local_or_private',
      part2_consent_satisfied: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['PART2_PROCESSING_CONTROLS_SATISFIED'],
    obligation_ids: [
      'PART2-OBL-CONFIDENTIALITY',
      'PART2-OBL-CONSENT',
      'PART2-OBL-APPLICABILITY',
    ],
    control_ids: [
      'ctrl_processing_environment',
      'ctrl_audit_logging',
      'ctrl_authorization',
    ],
    enigma_obligations: [
      'LOCAL_MODEL_ONLY',
      'NO_EXTERNAL_TRANSMISSION',
      'LOG_GOVERNANCE_EVENT',
    ],
    sources: ['src_42cfr2'],
    derived_from: ['src_42cfr2'],
    note: 'Does NOT certify Part 2 compliance.',
  },
  {
    rule_id: 'PART2-R-OUT-REDISCLOSURE-BLOCK',
    name: 'Block Part 2 residual plaintext when redisclosure conditions are not satisfied',
    phase: 'output',
    priority: 100,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'PART2',
      inspection_sensitivity: 'PART2',
      part2_redisclosure_ok: false,
    },
    decision: 'BLOCK_OUTPUT',
    reason_codes: ['PART2_REDISCLOSURE_NOT_AUTHORIZED'],
    obligation_ids: ['PART2-OBL-REDISCLOSURE-NOTICE', 'PART2-OBL-CONFIDENTIALITY'],
    control_ids: ['ctrl_output_inspection', 'ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_42cfr2'],
    derived_from: ['src_42cfr2'],
  },
  {
    rule_id: 'PART2-R-OUT-RELEASE-EVAL',
    name: 'Enigma release may authorize detokenization when Part 2 release conditions are satisfied',
    phase: 'output',
    priority: 50,
    requirement_type: 'IMPLEMENTATION_OPTION',
    conditions: {
      regulatory_applicability: 'PART2',
      contains_tokens: true,
      input_was_tokenized: true,
      part2_redisclosure_ok: true,
      release_conditions_satisfied: true,
    },
    decision: 'AUTHORIZED_DETOKENIZATION',
    reason_codes: ['ENIGMA_RELEASE_AUTHORIZED_DETOKENIZATION'],
    obligation_ids: ['PART2-OBL-REDISCLOSURE-NOTICE', 'PART2-OBL-CONSENT'],
    control_ids: ['ctrl_authorized_release', 'ctrl_audit_logging'],
    enigma_obligations: ['AUTHORIZE_DETOKENIZATION', 'LOG_GOVERNANCE_EVENT'],
    authorize_detokenization: true,
    sources: ['src_42cfr2'],
    derived_from: ['src_42cfr2'],
  },
];

export const PART2_PACK_META = {
  pack_id: 'pack_42_cfr_part_2',
  pack_version: '1.0.0',
  input_interpreter: 'part2_pack_v1' as const,
  output_interpreter: 'part2_pack_v1_output' as const,
  input_policy_id: 'pol_part2_sud_records',
  input_version: 1,
  output_policy_id: 'pol_part2_redisclosure',
  output_version: 1,
};

export const PART2_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    src_42cfr2: {
      source_id: 'src_42cfr2',
      authority: '42 CFR Part 2',
      authority_tier: 1,
      authority_type: 'PRIMARY_REGULATORY',
      legal_authority: true,
      title: 'Confidentiality of Substance Use Disorder Patient Records',
      publisher: 'U.S. Department of Health and Human Services',
      citation: '42 CFR Part 2',
      canonical_url:
        'https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2',
      effective_date: null,
      retrieved_date: null,
      version: 'current',
    },
    src_hhs_part2_overview: {
      source_id: 'src_hhs_part2_overview',
      authority: 'HHS Part 2 Overview',
      authority_tier: 2,
      authority_type: 'OFFICIAL_REGULATORY_GUIDANCE',
      legal_authority: false,
      title:
        'Understanding Confidentiality of Substance Use Disorder (SUD) Patient Records or “Part 2”',
      publisher: 'U.S. Department of Health and Human Services',
      citation: 'HHS — Understanding Confidentiality of SUD Patient Records (Part 2)',
      canonical_url: 'https://www.hhs.gov/hipaa/part-2/index.html',
      effective_date: null,
      retrieved_date: null,
      version: null,
    },
  },
  obligations: {
    'PART2-OBL-CONFIDENTIALITY': {
      obligation_id: 'PART2-OBL-CONFIDENTIALITY',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '42 CFR Part 2',
      authority_tier: 1,
      citations: ['42 CFR § 2.13'],
      source_ids: ['src_42cfr2'],
    },
    'PART2-OBL-APPLICABILITY': {
      obligation_id: 'PART2-OBL-APPLICABILITY',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '42 CFR Part 2',
      authority_tier: 1,
      citations: ['42 CFR § 2.12', '42 CFR § 2.11'],
      source_ids: ['src_42cfr2', 'src_hhs_part2_overview'],
    },
    'PART2-OBL-CONSENT': {
      obligation_id: 'PART2-OBL-CONSENT',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '42 CFR Part 2',
      authority_tier: 1,
      citations: ['42 CFR § 2.31', '42 CFR § 2.33'],
      source_ids: ['src_42cfr2'],
    },
    'PART2-OBL-REDISCLOSURE-NOTICE': {
      obligation_id: 'PART2-OBL-REDISCLOSURE-NOTICE',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '42 CFR Part 2',
      authority_tier: 1,
      citations: ['42 CFR § 2.32'],
      source_ids: ['src_42cfr2'],
    },
    'PART2-OBL-PROCEEDINGS-PROTECTION': {
      obligation_id: 'PART2-OBL-PROCEEDINGS-PROTECTION',
      requirement_type: 'REGULATORY_REQUIREMENT',
      authority: '42 CFR Part 2',
      authority_tier: 1,
      citations: ['42 CFR § 2.12', '42 CFR § 2.13'],
      source_ids: ['src_42cfr2'],
    },
  },
};
