/**
 * Compiled ISO/IEC 42001:2023 pack artifacts (Pack #6).
 * Pack version 1.0.0 — AI management-system STANDARD.
 * Not legal authority; not a certification.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type Iso42001CompiledRule = {
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

export const ISO_42001_PACK_META = {
  pack_id: 'pack_iso_42001',
  pack_version: '1.0.0',
  input_interpreter: 'iso_42001_pack_v1' as const,
  output_interpreter: 'iso_42001_pack_v1_output' as const,
  input_policy_id: 'pol_iso_42001_input',
  input_version: 1,
  output_policy_id: 'pol_iso_42001_output',
  output_version: 1,
};

/**
 * ISO 42001-informed management-system controls.
 * Missing organizational evidence → REVIEW (not DENY).
 */
export const ISO_42001_RULES: Iso42001CompiledRule[] = [
  {
    rule_id: 'ISO42001-R-AIMS-GOVERNANCE',
    name: 'Review when AI management-system governance foundation is not established',
    phase: 'input',
    priority: 100,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO 42001-informed AIMS control — not ISO certification enforcement.',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      aims_governance_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_AIMS_GOVERNANCE_REVIEW'],
    obligation_ids: ['ISO42001-OBL-AIMS-GOVERNANCE'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-AI-SCOPE-INVENTORY',
    name: 'Review when AI system inventory / scope evidence is not established',
    phase: 'input',
    priority: 95,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO 42001-informed scope/inventory control.',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      ai_system_inventory_documented: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_AI_SCOPE_INVENTORY_REVIEW'],
    obligation_ids: ['ISO42001-OBL-SCOPE-INVENTORY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-RISK-MANAGEMENT',
    name: 'Review when AI risk-management evidence is not established',
    phase: 'input',
    priority: 90,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO 42001-informed risk-management control.',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      risk_management_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_RISK_MANAGEMENT_REVIEW'],
    obligation_ids: ['ISO42001-OBL-RISK-MANAGEMENT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-IMPACT-ASSESSMENT',
    name: 'Review when AI impact-assessment evidence is not established',
    phase: 'input',
    priority: 85,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO 42001-informed impact assessment — not ISO/IEC 42005.',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      impact_assessment_completed: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_IMPACT_ASSESSMENT_REVIEW'],
    obligation_ids: ['ISO42001-OBL-IMPACT-ASSESSMENT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-DATA-GOVERNANCE',
    name: 'Review when data-governance evidence is not established',
    phase: 'input',
    priority: 80,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Generic data-governance control — does not duplicate HIPAA/Part 2.',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      data_governance_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_DATA_GOVERNANCE_REVIEW'],
    obligation_ids: ['ISO42001-OBL-DATA-GOVERNANCE'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-HUMAN-OVERSIGHT',
    name: 'Review when defined human-oversight evidence is not established',
    phase: 'input',
    priority: 75,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Defined oversight process ≠ a specific human AUTHORIZE on this request.',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      human_oversight_defined: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_HUMAN_OVERSIGHT_REVIEW'],
    obligation_ids: ['ISO42001-OBL-HUMAN-OVERSIGHT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-OPERATIONAL-CONTROLS',
    name: 'Review when operational-control evidence is not established',
    phase: 'input',
    priority: 70,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      operational_controls_defined: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_OPERATIONAL_CONTROLS_REVIEW'],
    obligation_ids: ['ISO42001-OBL-OPERATIONAL-CONTROLS'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-MONITORING-EVALUATION',
    name: 'Review when monitoring / performance-evaluation evidence is not established',
    phase: 'input',
    priority: 65,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      monitoring_evaluation_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_MONITORING_EVALUATION_REVIEW'],
    obligation_ids: ['ISO42001-OBL-MONITORING-EVALUATION'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-INCIDENT-MANAGEMENT',
    name: 'Review when AI incident-process evidence is not established',
    phase: 'input',
    priority: 60,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      incident_process_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_INCIDENT_MANAGEMENT_REVIEW'],
    obligation_ids: ['ISO42001-OBL-INCIDENT-MANAGEMENT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-CONTINUAL-IMPROVEMENT',
    name: 'Review when continual-improvement process evidence is not established',
    phase: 'input',
    priority: 55,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      continual_improvement_process_established: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ISO42001_CONTINUAL_IMPROVEMENT_REVIEW'],
    obligation_ids: ['ISO42001-OBL-CONTINUAL-IMPROVEMENT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-CONTROLS-SATISFIED',
    name: 'Allow with controls when ISO 42001-informed management-system evidence is established',
    phase: 'input',
    priority: 40,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO 42001 policy posture — not ISO certified / ISO compliant certification.',
    conditions: {
      regulatory_applicability: 'ISO_42001',
      aims_governance_established: true,
      ai_system_inventory_documented: true,
      risk_management_established: true,
      impact_assessment_completed: true,
      data_governance_established: true,
      human_oversight_defined: true,
      operational_controls_defined: true,
      monitoring_evaluation_established: true,
      incident_process_established: true,
      continual_improvement_process_established: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ISO42001_CONTROLS_SATISFIED'],
    obligation_ids: [
      'ISO42001-OBL-AIMS-GOVERNANCE',
      'ISO42001-OBL-SCOPE-INVENTORY',
      'ISO42001-OBL-RISK-MANAGEMENT',
      'ISO42001-OBL-IMPACT-ASSESSMENT',
      'ISO42001-OBL-DATA-GOVERNANCE',
      'ISO42001-OBL-HUMAN-OVERSIGHT',
      'ISO42001-OBL-OPERATIONAL-CONTROLS',
      'ISO42001-OBL-MONITORING-EVALUATION',
      'ISO42001-OBL-INCIDENT-MANAGEMENT',
      'ISO42001-OBL-CONTINUAL-IMPROVEMENT',
    ],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
  {
    rule_id: 'ISO42001-R-OUTPUT-GOVERNANCE-LOG',
    name: 'Log governance event for ISO 42001-scoped output',
    phase: 'output',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ISO_42001',
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ISO42001_OUTPUT_GOVERNANCE_LOG'],
    obligation_ids: ['ISO42001-OBL-MONITORING-EVALUATION'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_iso_iec_42001_2023'],
    derived_from: ['src_iso_iec_42001_2023'],
  },
];

export const ISO_42001_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    src_iso_iec_42001_2023: {
      source_id: 'src_iso_iec_42001_2023',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      authority_type: 'STANDARD',
      legal_authority: false,
      authority_id: POLICY_AUTHORITY_IDS.iso42001,
      title:
        'ISO/IEC 42001:2023 Information technology — Artificial intelligence — Management system',
      publisher:
        'International Organization for Standardization / International Electrotechnical Commission',
      citation: 'ISO/IEC 42001:2023',
      canonical_url: 'https://www.iso.org/standard/42001',
      effective_date: '2023-12-18',
      retrieved_date: null,
      version: '2023',
      note: 'International Standard for an AI management system (AIMS). Not statute; not Enigma certification.',
    },
  },
  obligations: {
    'ISO42001-OBL-AIMS-GOVERNANCE': {
      obligation_id: 'ISO42001-OBL-AIMS-GOVERNANCE',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 5 (Leadership)', 'ISO/IEC 42001:2023 — Clause 4 (Context)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-SCOPE-INVENTORY': {
      obligation_id: 'ISO42001-OBL-SCOPE-INVENTORY',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 4 (Context of the organization)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-RISK-MANAGEMENT': {
      obligation_id: 'ISO42001-OBL-RISK-MANAGEMENT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 6 (Planning)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-IMPACT-ASSESSMENT': {
      obligation_id: 'ISO42001-OBL-IMPACT-ASSESSMENT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 6 (Planning)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-DATA-GOVERNANCE': {
      obligation_id: 'ISO42001-OBL-DATA-GOVERNANCE',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 8 (Operation)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-HUMAN-OVERSIGHT': {
      obligation_id: 'ISO42001-OBL-HUMAN-OVERSIGHT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 8 (Operation)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-OPERATIONAL-CONTROLS': {
      obligation_id: 'ISO42001-OBL-OPERATIONAL-CONTROLS',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 8 (Operation)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-MONITORING-EVALUATION': {
      obligation_id: 'ISO42001-OBL-MONITORING-EVALUATION',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 9 (Performance evaluation)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-INCIDENT-MANAGEMENT': {
      obligation_id: 'ISO42001-OBL-INCIDENT-MANAGEMENT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 8 (Operation)', 'ISO/IEC 42001:2023 — Clause 10 (Improvement)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
    'ISO42001-OBL-CONTINUAL-IMPROVEMENT': {
      obligation_id: 'ISO42001-OBL-CONTINUAL-IMPROVEMENT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'ISO/IEC 42001:2023',
      authority_tier: 3,
      citations: ['ISO/IEC 42001:2023 — Clause 10 (Improvement)'],
      source_ids: ['src_iso_iec_42001_2023'],
    },
  },
};
