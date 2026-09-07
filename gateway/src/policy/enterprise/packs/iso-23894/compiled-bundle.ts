/**
 * Compiled ISO/IEC 23894:2023 pack artifacts (Pack #7).
 * Pack version 1.0.0 — AI risk-management STANDARD (guidance).
 * Not legal authority; not a certification; not a risk score.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type Iso23894CompiledRule = {
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

export const ISO_23894_PACK_META = {
  pack_id: 'pack_iso_23894',
  pack_version: '1.0.0',
  input_interpreter: 'iso_23894_pack_v1' as const,
  output_interpreter: 'iso_23894_pack_v1_output' as const,
  input_policy_id: 'pol_iso_23894_input',
  input_version: 1,
  output_policy_id: 'pol_iso_23894_output',
  output_version: 1,
};

/**
 * ISO 23894-informed AI risk-management controls.
 * Missing organizational risk evidence → REVIEW (not DENY).
 * Distinct from ISO 42001 management-system controls.
 */
export const ISO_23894_RULES: Iso23894CompiledRule[] = [
  {
    rule_id: 'ISO23894-R-RISK-PROCESS',
    name: 'Review when AI risk-management process is not established',
    phase: 'input',
    priority: 100,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO 23894-informed risk-management control — not ISO certification.',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_management_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_PROCESS_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-PROCESS'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RISK-CONTEXT',
    name: 'Review when AI risk context is not defined',
    phase: 'input',
    priority: 95,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_context_defined: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_CONTEXT_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-CONTEXT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RISK-IDENTIFICATION',
    name: 'Review when AI risk identification is not completed',
    phase: 'input',
    priority: 90,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Governance evidence — not an automatic AI risk detector.',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_identification_completed: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_IDENTIFICATION_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-IDENTIFICATION'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RISK-ANALYSIS',
    name: 'Review when AI risk analysis is not completed',
    phase: 'input',
    priority: 85,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Does not invent a proprietary quantitative risk-analysis algorithm.',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_analysis_completed: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_ANALYSIS_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-ANALYSIS'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RISK-EVALUATION',
    name: 'Review when organizational AI risk evaluation is not completed',
    phase: 'input',
    priority: 80,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Organizational risk evaluation ≠ Enigma policy evaluation.',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_evaluation_completed: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_EVALUATION_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-EVALUATION'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RISK-TREATMENT',
    name: 'Review when AI risk treatment is not defined and implemented',
    phase: 'input',
    priority: 75,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_treatment_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_TREATMENT_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-TREATMENT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RESIDUAL-RISK',
    name: 'Review when residual-risk acceptance evidence is not established',
    phase: 'input',
    priority: 70,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Organizational residual-risk acceptance ≠ Enigma policy authorization.',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      residual_risk_accepted: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RESIDUAL_RISK_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RESIDUAL-RISK'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RISK-MONITORING',
    name: 'Review when AI risk monitoring is not established',
    phase: 'input',
    priority: 65,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_monitoring_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_MONITORING_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-MONITORING'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RISK-COMMUNICATION',
    name: 'Review when AI risk communication is not established',
    phase: 'input',
    priority: 60,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_communication_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_COMMUNICATION_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-COMMUNICATION'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-RISK-REVIEW',
    name: 'Review when AI risk review process is not established',
    phase: 'input',
    priority: 55,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_review_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO23894_RISK_REVIEW_PROCESS_REVIEW'],
    obligation_ids: ['ISO23894-OBL-RISK-REVIEW'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-CONTROLS-SATISFIED',
    name: 'Allow with controls when ISO 23894-informed risk-management evidence is established',
    phase: 'input',
    priority: 40,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO 23894 policy posture — not ISO certified / ISO compliant / risk score.',
    conditions: {
      regulatory_applicability: 'ISO_23894',
      risk_management_established: true,
      risk_context_defined: true,
      risk_identification_completed: true,
      risk_analysis_completed: true,
      risk_evaluation_completed: true,
      risk_treatment_established: true,
      residual_risk_accepted: true,
      risk_monitoring_established: true,
      risk_communication_established: true,
      risk_review_established: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ISO23894_CONTROLS_SATISFIED'],
    obligation_ids: [
      'ISO23894-OBL-RISK-PROCESS',
      'ISO23894-OBL-RISK-CONTEXT',
      'ISO23894-OBL-RISK-IDENTIFICATION',
      'ISO23894-OBL-RISK-ANALYSIS',
      'ISO23894-OBL-RISK-EVALUATION',
      'ISO23894-OBL-RISK-TREATMENT',
      'ISO23894-OBL-RESIDUAL-RISK',
      'ISO23894-OBL-RISK-MONITORING',
      'ISO23894-OBL-RISK-COMMUNICATION',
      'ISO23894-OBL-RISK-REVIEW',
    ],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
  {
    rule_id: 'ISO23894-R-OUTPUT-GOVERNANCE-LOG',
    name: 'Log governance event for ISO 23894-scoped output',
    phase: 'output',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_23894',
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ISO23894_OUTPUT_GOVERNANCE_LOG'],
    obligation_ids: ['ISO23894-OBL-RISK-MONITORING'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_23894_2023'],
    derived_from: ['src_iso_iec_23894_2023'],
  },
];

export const ISO_23894_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    src_iso_iec_23894_2023: {
      source_id: 'src_iso_iec_23894_2023',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      authority_type: 'STANDARD',
      legal_authority: false,
      authority_id: POLICY_AUTHORITY_IDS.iso23894,
      title:
        'ISO/IEC 23894:2023 Information technology — Artificial intelligence — Guidance on risk management',
      publisher: 'ISO / IEC',
      citation: 'ISO/IEC 23894:2023',
      canonical_url: 'https://www.iso.org/standard/77304.html',
      effective_date: '2023-02-06',
      retrieved_date: null,
      version: '2023',
      note: 'International Standard providing guidance on AI risk management. Not statute; not Enigma certification or risk score.',
    },
  },
  obligations: {
    'ISO23894-OBL-RISK-PROCESS': {
      obligation_id: 'ISO23894-OBL-RISK-PROCESS',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Risk management process'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RISK-CONTEXT': {
      obligation_id: 'ISO23894-OBL-RISK-CONTEXT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Establishing the context'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RISK-IDENTIFICATION': {
      obligation_id: 'ISO23894-OBL-RISK-IDENTIFICATION',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Risk identification'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RISK-ANALYSIS': {
      obligation_id: 'ISO23894-OBL-RISK-ANALYSIS',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Risk analysis'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RISK-EVALUATION': {
      obligation_id: 'ISO23894-OBL-RISK-EVALUATION',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Risk evaluation'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RISK-TREATMENT': {
      obligation_id: 'ISO23894-OBL-RISK-TREATMENT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Risk treatment'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RESIDUAL-RISK': {
      obligation_id: 'ISO23894-OBL-RESIDUAL-RISK',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Residual risk'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RISK-MONITORING': {
      obligation_id: 'ISO23894-OBL-RISK-MONITORING',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Monitoring and review'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RISK-COMMUNICATION': {
      obligation_id: 'ISO23894-OBL-RISK-COMMUNICATION',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Communication and consultation'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
    'ISO23894-OBL-RISK-REVIEW': {
      obligation_id: 'ISO23894-OBL-RISK-REVIEW',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 23894:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 23894:2023 — Monitoring and review'],
      source_ids: ['src_iso_iec_23894_2023'],
    },
  },
};
