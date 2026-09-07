/**
 * Compiled ISO/IEC 27701:2025 pack artifacts (Pack #13).
 * Pack version 1.0.0 — PIMS / privacy-information-management STANDARD (guidance).
 * Not legal authority; not a certification; not GDPR/DSAR/DPIA/score/GRC.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type Iso27701CompiledRule = {
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

export const ISO_27701_PACK_META = {
  pack_id: 'pack_iso_27701',
  pack_version: '1.0.0',
  input_interpreter: 'iso_27701_pack_v1' as const,
  output_interpreter: 'iso_27701_pack_v1_output' as const,
  input_policy_id: 'pol_iso_27701_input',
  input_version: 1,
  output_policy_id: 'pol_iso_27701_output',
  output_version: 1,
};

const SRC = 'src_iso_27701_2025';
const REVIEW_OBL = ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'] as const;

function reviewRule(
  rule_id: string,
  name: string,
  priority: number,
  gate: string,
  reason: string,
  obligation_id: string,
  note?: string,
): Iso27701CompiledRule {
  return {
    rule_id,
    name,
    phase: 'input',
    priority,
    requirement_type: 'DERIVED_CONTROL',
    note,
    conditions: { regulatory_applicability: 'ISO_27701', [gate]: false },
    decision: 'REVIEW',
    reason_codes: [reason],
    obligation_ids: [obligation_id],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: [...REVIEW_OBL],
    sources: [SRC],
    derived_from: [SRC],
  };
}

/**
 * ISO/IEC 27701-informed PIMS privacy governance controls.
 * Missing evidence → REVIEW (not DENY). Distinct from information_security / HIPAA / SOC 2 Privacy.
 */
export const ISO_27701_RULES: Iso27701CompiledRule[] = [
  reviewRule(
    'ISO27701-PIMS-REVIEW',
    'Review when PIMS scope/context/roles/objectives evidence is missing',
    110,
    'pims',
    'ISO27701_PIMS_REVIEW',
    'ISO27701-OBL-PIMS',
    'ISO/IEC 27701-informed PIMS control — not ISO 27701 certification.',
  ),
  reviewRule(
    'ISO27701-PII-PROCESSING-REVIEW',
    'Review when PII processing inventory/purpose/role evidence is missing',
    105,
    'pii_processing',
    'ISO27701_PII_PROCESSING_REVIEW',
    'ISO27701-OBL-PII-PROCESSING',
  ),
  reviewRule(
    'ISO27701-PRIVACY-RISK-REVIEW',
    'Review when privacy risk management evidence is missing',
    100,
    'privacy_risk',
    'ISO27701_PRIVACY_RISK_REVIEW',
    'ISO27701-OBL-PRIVACY-RISK',
    'Residual privacy-risk review ≠ Enigma AUTHORIZE.',
  ),
  reviewRule(
    'ISO27701-PRIVACY-IMPACT-REVIEW',
    'Review when privacy impact assessment evidence is missing',
    95,
    'privacy_impact',
    'ISO27701_PRIVACY_IMPACT_REVIEW',
    'ISO27701-OBL-PRIVACY-IMPACT',
    'Not a DPIA workflow or privacy impact score.',
  ),
  reviewRule(
    'ISO27701-DATA-LIFECYCLE-REVIEW',
    'Review when PII lifecycle governance evidence is missing',
    90,
    'data_lifecycle',
    'ISO27701_DATA_LIFECYCLE_REVIEW',
    'ISO27701-OBL-DATA-LIFECYCLE',
  ),
  reviewRule(
    'ISO27701-TRANSPARENCY-REVIEW',
    'Review when privacy transparency/notice evidence is missing',
    85,
    'transparency',
    'ISO27701_TRANSPARENCY_REVIEW',
    'ISO27701-OBL-TRANSPARENCY',
  ),
  reviewRule(
    'ISO27701-PRIVACY-RIGHTS-REVIEW',
    'Review when individual privacy-rights process evidence is missing',
    80,
    'privacy_rights',
    'ISO27701_PRIVACY_RIGHTS_REVIEW',
    'ISO27701-OBL-PRIVACY-RIGHTS',
    'Not a DSAR/DSR workflow application.',
  ),
  reviewRule(
    'ISO27701-CONTROLLER-PROCESSOR-REVIEW',
    'Review when controller/processor role or responsibilities evidence is missing',
    75,
    'controller_processor',
    'ISO27701_CONTROLLER_PROCESSOR_REVIEW',
    'ISO27701-OBL-CONTROLLER-PROCESSOR',
  ),
  reviewRule(
    'ISO27701-THIRD-PARTY-REVIEW',
    'Review when third-party / processor privacy evidence is missing',
    70,
    'third_party',
    'ISO27701_THIRD_PARTY_REVIEW',
    'ISO27701-OBL-THIRD-PARTY',
  ),
  reviewRule(
    'ISO27701-PRIVACY-INCIDENT-REVIEW',
    'Review when privacy incident / breach-response evidence is missing',
    65,
    'privacy_incident',
    'ISO27701_PRIVACY_INCIDENT_REVIEW',
    'ISO27701-OBL-PRIVACY-INCIDENT',
  ),
  reviewRule(
    'ISO27701-MONITORING-REVIEW',
    'Review when privacy monitoring/review evidence is missing',
    60,
    'monitoring',
    'ISO27701_MONITORING_REVIEW',
    'ISO27701-OBL-MONITORING',
  ),
  reviewRule(
    'ISO27701-IMPROVEMENT-REVIEW',
    'Review when privacy continual-improvement evidence is missing',
    55,
    'improvement',
    'ISO27701_IMPROVEMENT_REVIEW',
    'ISO27701-OBL-IMPROVEMENT',
  ),
  {
    rule_id: 'ISO27701-CONTROLS-SATISFIED',
    name: 'Allow with controls when ISO/IEC 27701-informed PIMS evidence is established',
    phase: 'input',
    priority: 40,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO/IEC 27701-informed privacy posture — not ISO 27701 certified / compliant / PIMS certified / scored.',
    conditions: {
      regulatory_applicability: 'ISO_27701',
      pims: true,
      pii_processing: true,
      privacy_risk: true,
      privacy_impact: true,
      data_lifecycle: true,
      transparency: true,
      privacy_rights: true,
      controller_processor: true,
      third_party: true,
      privacy_incident: true,
      monitoring: true,
      improvement: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ISO27701_CONTROLS_SATISFIED'],
    obligation_ids: [
      'ISO27701-OBL-PIMS',
      'ISO27701-OBL-PII-PROCESSING',
      'ISO27701-OBL-PRIVACY-RISK',
      'ISO27701-OBL-PRIVACY-IMPACT',
      'ISO27701-OBL-DATA-LIFECYCLE',
      'ISO27701-OBL-TRANSPARENCY',
      'ISO27701-OBL-PRIVACY-RIGHTS',
      'ISO27701-OBL-CONTROLLER-PROCESSOR',
      'ISO27701-OBL-THIRD-PARTY',
      'ISO27701-OBL-PRIVACY-INCIDENT',
      'ISO27701-OBL-MONITORING',
      'ISO27701-OBL-IMPROVEMENT',
    ],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: [SRC],
    derived_from: [SRC],
  },
  {
    rule_id: 'ISO27701-OUTPUT-LOG',
    name: 'Log governance event for ISO/IEC 27701-scoped output',
    phase: 'output',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: { regulatory_applicability: 'ISO_27701' },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ISO27701_OUTPUT_LOG'],
    obligation_ids: ['ISO27701-OBL-MONITORING'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: [SRC],
    derived_from: [SRC],
  },
];

function obl(id: string, citation: string) {
  return {
    obligation_id: id,
    requirement_type: 'IMPLEMENTATION_OPTION',
    authority: 'ISO/IEC 27701:2025',
    authority_tier: 3,
    citations: [citation],
    source_ids: [SRC],
  };
}

export const ISO_27701_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    [SRC]: {
      source_id: SRC,
      authority: 'ISO/IEC 27701:2025',
      authority_tier: 3,
      authority_type: 'STANDARD',
      legal_authority: false,
      authority_id: POLICY_AUTHORITY_IDS.iso27701,
      title:
        'Information security, cybersecurity and privacy protection — Privacy information management systems — Requirements and guidance',
      publisher: 'ISO / IEC',
      citation: 'ISO/IEC 27701:2025',
      canonical_url: 'https://www.iso.org/standard/27701',
      effective_date: '2025-10-14',
      retrieved_date: '2026-09-07',
      version: '2025',
      note: 'International Standard for PIMS requirements and guidance (Edition 2). Not statute; not GDPR determination; not an Enigma certification, compliance determination, DSAR workflow, DPIA app, privacy score, or PII scanner. ISO/IEC 27701:2019 is withdrawn — this pack uses the 2025 edition. Enigma-derived controls are interpretations for AI action governance evidence.',
    },
  },
  obligations: {
    'ISO27701-OBL-PIMS': obl(
      'ISO27701-OBL-PIMS',
      'ISO/IEC 27701:2025 — PIMS context / scope / roles / objectives',
    ),
    'ISO27701-OBL-PII-PROCESSING': obl(
      'ISO27701-OBL-PII-PROCESSING',
      'ISO/IEC 27701:2025 — PII processing identification / purposes',
    ),
    'ISO27701-OBL-PRIVACY-RISK': obl(
      'ISO27701-OBL-PRIVACY-RISK',
      'ISO/IEC 27701:2025 — privacy risk assessment / treatment',
    ),
    'ISO27701-OBL-PRIVACY-IMPACT': obl(
      'ISO27701-OBL-PRIVACY-IMPACT',
      'ISO/IEC 27701:2025 — privacy impact considerations',
    ),
    'ISO27701-OBL-DATA-LIFECYCLE': obl(
      'ISO27701-OBL-DATA-LIFECYCLE',
      'ISO/IEC 27701:2025 — PII lifecycle governance',
    ),
    'ISO27701-OBL-TRANSPARENCY': obl(
      'ISO27701-OBL-TRANSPARENCY',
      'ISO/IEC 27701:2025 — transparency / privacy information',
    ),
    'ISO27701-OBL-PRIVACY-RIGHTS': obl(
      'ISO27701-OBL-PRIVACY-RIGHTS',
      'ISO/IEC 27701:2025 — individual privacy rights handling',
    ),
    'ISO27701-OBL-CONTROLLER-PROCESSOR': obl(
      'ISO27701-OBL-CONTROLLER-PROCESSOR',
      'ISO/IEC 27701:2025 — controller / processor responsibilities',
    ),
    'ISO27701-OBL-THIRD-PARTY': obl(
      'ISO27701-OBL-THIRD-PARTY',
      'ISO/IEC 27701:2025 — processor / third-party privacy requirements',
    ),
    'ISO27701-OBL-PRIVACY-INCIDENT': obl(
      'ISO27701-OBL-PRIVACY-INCIDENT',
      'ISO/IEC 27701:2025 — privacy incident / breach response',
    ),
    'ISO27701-OBL-MONITORING': obl(
      'ISO27701-OBL-MONITORING',
      'ISO/IEC 27701:2025 — privacy performance / management review',
    ),
    'ISO27701-OBL-IMPROVEMENT': obl(
      'ISO27701-OBL-IMPROVEMENT',
      'ISO/IEC 27701:2025 — nonconformity and continual improvement',
    ),
  },
};
