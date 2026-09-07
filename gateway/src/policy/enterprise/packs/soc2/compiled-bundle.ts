/**
 * Compiled SOC 2 / AICPA Trust Services Criteria pack artifacts (Pack #9).
 * Pack version 1.0.0 — enterprise assurance FRAMEWORK (guidance).
 * Not legal authority; not a certification; not a SOC 2 audit opinion.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type Soc2CompiledRule = {
  rule_id: string;
  name: string;
  phase: 'input' | 'output';
  priority: number;
  conditions: Record<string, unknown>;
  decision: 'DENY' | 'ALLOW_WITH_CONTROLS' | 'REVIEW';
  reason_codes: string[];
  obligation_ids?: string[];
  control_ids?: string[];
  enigma_obligations?: string[];
  sources?: string[];
  derived_from?: string[];
  requirement_type?: string;
  note?: string;
};

export const SOC2_PACK_META = {
  pack_id: 'pack_soc2',
  pack_version: '1.0.0',
  input_interpreter: 'soc2_pack_v1' as const,
  output_interpreter: 'soc2_pack_v1_output' as const,
  input_policy_id: 'pol_soc2_input',
  input_version: 1,
  output_policy_id: 'pol_soc2_output',
  output_version: 1,
};

/**
 * SOC 2-informed enterprise assurance controls.
 * Missing assurance evidence → REVIEW (not DENY).
 * Privacy family applies only when privacy_category_applicable.
 */
export const SOC2_RULES: Soc2CompiledRule[] = [
  {
    rule_id: 'SOC2-R-CONTROL-ENVIRONMENT',
    name: 'Review when control environment evidence is not documented',
    phase: 'input',
    priority: 110,
    requirement_type: 'DERIVED_CONTROL',
    note: 'SOC 2-informed enterprise control — not SOC 2 certification.',
    conditions: {
      regulatory_applicability: 'SOC_2',
      control_environment_documented: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_CONTROL_ENVIRONMENT_REVIEW'],
    obligation_ids: ['SOC2-OBL-CONTROL-ENVIRONMENT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-ACCESS-CONTROLS',
    name: 'Review when access control evidence is not verified',
    phase: 'input',
    priority: 105,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      access_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_ACCESS_CONTROLS_REVIEW'],
    obligation_ids: ['SOC2-OBL-ACCESS-CONTROLS'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-CHANGE-MANAGEMENT',
    name: 'Review when change-management control evidence is not verified',
    phase: 'input',
    priority: 100,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      change_management_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_CHANGE_MANAGEMENT_REVIEW'],
    obligation_ids: ['SOC2-OBL-CHANGE-MANAGEMENT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-LOGICAL-ACCESS',
    name: 'Review when logical-access control evidence is not verified',
    phase: 'input',
    priority: 95,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      logical_access_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_LOGICAL_ACCESS_REVIEW'],
    obligation_ids: ['SOC2-OBL-LOGICAL-ACCESS'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-DATA-PROTECTION',
    name: 'Review when data-protection control evidence is not verified',
    phase: 'input',
    priority: 90,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      data_protection_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_DATA_PROTECTION_REVIEW'],
    obligation_ids: ['SOC2-OBL-DATA-PROTECTION'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-MONITORING',
    name: 'Review when system-monitoring control evidence is not verified',
    phase: 'input',
    priority: 85,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      system_monitoring_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_MONITORING_REVIEW'],
    obligation_ids: ['SOC2-OBL-MONITORING'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-INCIDENT-RESPONSE',
    name: 'Review when incident-response control evidence is not verified',
    phase: 'input',
    priority: 80,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      incident_response_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_INCIDENT_RESPONSE_REVIEW'],
    obligation_ids: ['SOC2-OBL-INCIDENT-RESPONSE'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-AVAILABILITY',
    name: 'Review when availability control evidence is not verified',
    phase: 'input',
    priority: 75,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      availability_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_AVAILABILITY_REVIEW'],
    obligation_ids: ['SOC2-OBL-AVAILABILITY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-PROCESSING-INTEGRITY',
    name: 'Review when processing-integrity control evidence is not verified',
    phase: 'input',
    priority: 70,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      processing_integrity_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_PROCESSING_INTEGRITY_REVIEW'],
    obligation_ids: ['SOC2-OBL-PROCESSING-INTEGRITY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-CONFIDENTIALITY',
    name: 'Review when confidentiality control evidence is not verified',
    phase: 'input',
    priority: 65,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
      confidentiality_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_CONFIDENTIALITY_REVIEW'],
    obligation_ids: ['SOC2-OBL-CONFIDENTIALITY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-PRIVACY',
    name: 'Review when privacy-category control evidence is not verified',
    phase: 'input',
    priority: 60,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Applies only when privacy_category_applicable — not assumed for every request.',
    conditions: {
      regulatory_applicability: 'SOC_2',
      privacy_category_applicable: true,
      privacy_controls_verified: false,
    },
    decision: 'REVIEW',
    reason_codes: ['SOC2_PRIVACY_REVIEW'],
    obligation_ids: ['SOC2-OBL-PRIVACY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-CONTROLS-SATISFIED',
    name: 'Allow with controls when SOC 2-informed assurance evidence is established',
    phase: 'input',
    priority: 40,
    requirement_type: 'DERIVED_CONTROL',
    note: 'SOC 2-informed policy posture — not SOC 2 certified / compliant / audit opinion.',
    conditions: {
      regulatory_applicability: 'SOC_2',
      control_environment_documented: true,
      access_controls_verified: true,
      change_management_controls_verified: true,
      logical_access_controls_verified: true,
      data_protection_controls_verified: true,
      system_monitoring_controls_verified: true,
      incident_response_controls_verified: true,
      availability_controls_verified: true,
      processing_integrity_controls_verified: true,
      confidentiality_controls_verified: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['SOC2_CONTROLS_SATISFIED'],
    obligation_ids: [
      'SOC2-OBL-CONTROL-ENVIRONMENT',
      'SOC2-OBL-ACCESS-CONTROLS',
      'SOC2-OBL-CHANGE-MANAGEMENT',
      'SOC2-OBL-LOGICAL-ACCESS',
      'SOC2-OBL-DATA-PROTECTION',
      'SOC2-OBL-MONITORING',
      'SOC2-OBL-INCIDENT-RESPONSE',
      'SOC2-OBL-AVAILABILITY',
      'SOC2-OBL-PROCESSING-INTEGRITY',
      'SOC2-OBL-CONFIDENTIALITY',
    ],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
  {
    rule_id: 'SOC2-R-OUTPUT-MONITOR-LOG',
    name: 'Log governance event for SOC 2-scoped output',
    phase: 'output',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'SOC_2',
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['SOC2_OUTPUT_MONITOR_LOG'],
    obligation_ids: ['SOC2-OBL-MONITORING'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_aicpa_trust_services_criteria'],
    derived_from: ['src_aicpa_trust_services_criteria'],
  },
];

export const SOC2_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    src_aicpa_trust_services_criteria: {
      source_id: 'src_aicpa_trust_services_criteria',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      authority_type: 'FRAMEWORK',
      legal_authority: false,
      authority_id: POLICY_AUTHORITY_IDS.soc2,
      title:
        'TSP Section 100 — 2017 Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy (With Revised Points of Focus — 2022)',
      publisher: 'AICPA (Assurance Services Executive Committee)',
      citation: 'TSP Section 100 (2017 TSC; Revised Points of Focus — 2022)',
      canonical_url:
        'https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022',
      effective_date: '2022-01-01',
      retrieved_date: '2026-09-07',
      version: '2017 TSC (Revised Points of Focus — 2022)',
      note: 'Enterprise assurance criteria used in SOC 2 examinations. Not statute; not an Enigma certification, compliance determination, or audit opinion. Enigma-derived operational controls are interpretations for AI governance evidence.',
    },
  },
  obligations: {
    'SOC2-OBL-CONTROL-ENVIRONMENT': {
      obligation_id: 'SOC2-OBL-CONTROL-ENVIRONMENT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Common Criteria (control environment)'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-ACCESS-CONTROLS': {
      obligation_id: 'SOC2-OBL-ACCESS-CONTROLS',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Common Criteria (access controls)'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-CHANGE-MANAGEMENT': {
      obligation_id: 'SOC2-OBL-CHANGE-MANAGEMENT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Common Criteria (change management)'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-LOGICAL-ACCESS': {
      obligation_id: 'SOC2-OBL-LOGICAL-ACCESS',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Common Criteria (logical access)'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-DATA-PROTECTION': {
      obligation_id: 'SOC2-OBL-DATA-PROTECTION',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Common Criteria (system operations / protection)'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-MONITORING': {
      obligation_id: 'SOC2-OBL-MONITORING',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Common Criteria (monitoring activities)'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-INCIDENT-RESPONSE': {
      obligation_id: 'SOC2-OBL-INCIDENT-RESPONSE',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Common Criteria (incident response)'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-AVAILABILITY': {
      obligation_id: 'SOC2-OBL-AVAILABILITY',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Additional Criteria for Availability'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-PROCESSING-INTEGRITY': {
      obligation_id: 'SOC2-OBL-PROCESSING-INTEGRITY',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Additional Criteria for Processing Integrity'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-CONFIDENTIALITY': {
      obligation_id: 'SOC2-OBL-CONFIDENTIALITY',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Additional Criteria for Confidentiality'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
    'SOC2-OBL-PRIVACY': {
      obligation_id: 'SOC2-OBL-PRIVACY',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'AICPA Trust Services Criteria',
      authority_tier: 4,
      citations: ['TSP Section 100 — Additional Criteria for Privacy'],
      source_ids: ['src_aicpa_trust_services_criteria'],
    },
  },
};
