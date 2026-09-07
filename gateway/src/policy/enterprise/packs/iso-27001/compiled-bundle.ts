/**
 * Compiled ISO/IEC 27001:2022 pack artifacts (Pack #12).
 * Pack version 1.0.0 — ISMS / information-security STANDARD (guidance).
 * Not legal authority; not a certification; not SIEM / Annex A score / GRC.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type Iso27001CompiledRule = {
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

export const ISO_27001_PACK_META = {
  pack_id: 'pack_iso_27001',
  pack_version: '1.0.0',
  input_interpreter: 'iso_27001_pack_v1' as const,
  output_interpreter: 'iso_27001_pack_v1_output' as const,
  input_policy_id: 'pol_iso_27001_input',
  input_version: 1,
  output_policy_id: 'pol_iso_27001_output',
  output_version: 1,
};

const SRC = 'src_iso_27001_2022';
const REVIEW_OBL = ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'] as const;

function reviewRule(
  rule_id: string,
  name: string,
  priority: number,
  gate: string,
  reason: string,
  obligation_id: string,
  note?: string,
): Iso27001CompiledRule {
  return {
    rule_id,
    name,
    phase: 'input',
    priority,
    requirement_type: 'DERIVED_CONTROL',
    note,
    conditions: { regulatory_applicability: 'ISO_27001', [gate]: false },
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
 * ISO/IEC 27001-informed ISMS governance controls.
 * Missing evidence → REVIEW (not DENY). Distinct from cybersecurity / SOC 2 / OWASP.
 */
export const ISO_27001_RULES: Iso27001CompiledRule[] = [
  reviewRule(
    'ISO27001-ISMS-CONTEXT-REVIEW',
    'Review when ISMS context/scope/objectives evidence is missing',
    110,
    'isms_context',
    'ISO27001_ISMS_CONTEXT_REVIEW',
    'ISO27001-OBL-ISMS-CONTEXT',
    'ISO/IEC 27001-informed ISMS control — not ISO 27001 certification.',
  ),
  reviewRule(
    'ISO27001-RISK-PROCESS-REVIEW',
    'Review when information-security risk process evidence is missing',
    105,
    'risk_process',
    'ISO27001_RISK_PROCESS_REVIEW',
    'ISO27001-OBL-RISK-PROCESS',
  ),
  reviewRule(
    'ISO27001-RISK-TREATMENT-REVIEW',
    'Review when information-security risk treatment evidence is missing',
    100,
    'risk_treatment',
    'ISO27001_RISK_TREATMENT_REVIEW',
    'ISO27001-OBL-RISK-TREATMENT',
    'Residual-risk review ≠ Enigma AUTHORIZE.',
  ),
  reviewRule(
    'ISO27001-ASSETS-REVIEW',
    'Review when information-asset governance evidence is missing',
    95,
    'assets',
    'ISO27001_ASSETS_REVIEW',
    'ISO27001-OBL-ASSETS',
  ),
  reviewRule(
    'ISO27001-ACCESS-REVIEW',
    'Review when identity/access governance evidence is missing',
    90,
    'access',
    'ISO27001_ACCESS_REVIEW',
    'ISO27001-OBL-ACCESS',
  ),
  reviewRule(
    'ISO27001-OPERATIONS-REVIEW',
    'Review when secure-operations evidence is missing',
    85,
    'operations',
    'ISO27001_OPERATIONS_REVIEW',
    'ISO27001-OBL-OPERATIONS',
  ),
  reviewRule(
    'ISO27001-SUPPLIER-REVIEW',
    'Review when supplier/third-party security evidence is missing',
    80,
    'supplier',
    'ISO27001_SUPPLIER_REVIEW',
    'ISO27001-OBL-SUPPLIER',
  ),
  reviewRule(
    'ISO27001-INCIDENT-REVIEW',
    'Review when information-security incident-management evidence is missing',
    75,
    'incident',
    'ISO27001_INCIDENT_REVIEW',
    'ISO27001-OBL-INCIDENT',
  ),
  reviewRule(
    'ISO27001-CONTINUITY-REVIEW',
    'Review when information-security continuity/resilience evidence is missing',
    70,
    'continuity',
    'ISO27001_CONTINUITY_REVIEW',
    'ISO27001-OBL-CONTINUITY',
  ),
  reviewRule(
    'ISO27001-PEOPLE-REVIEW',
    'Review when people/security-responsibility evidence is missing',
    65,
    'people',
    'ISO27001_PEOPLE_REVIEW',
    'ISO27001-OBL-PEOPLE',
  ),
  reviewRule(
    'ISO27001-MONITORING-REVIEW',
    'Review when security monitoring/review evidence is missing',
    60,
    'monitoring',
    'ISO27001_MONITORING_REVIEW',
    'ISO27001-OBL-MONITORING',
  ),
  reviewRule(
    'ISO27001-IMPROVEMENT-REVIEW',
    'Review when continual-improvement evidence is missing',
    55,
    'improvement',
    'ISO27001_IMPROVEMENT_REVIEW',
    'ISO27001-OBL-IMPROVEMENT',
  ),
  {
    rule_id: 'ISO27001-CONTROLS-SATISFIED',
    name: 'Allow with controls when ISO/IEC 27001-informed ISMS evidence is established',
    phase: 'input',
    priority: 40,
    requirement_type: 'DERIVED_CONTROL',
    note: 'ISO/IEC 27001-informed posture — not ISO 27001 certified / compliant / scored.',
    conditions: {
      regulatory_applicability: 'ISO_27001',
      isms_context: true,
      risk_process: true,
      risk_treatment: true,
      assets: true,
      access: true,
      operations: true,
      supplier: true,
      incident: true,
      continuity: true,
      people: true,
      monitoring: true,
      improvement: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ISO27001_CONTROLS_SATISFIED'],
    obligation_ids: [
      'ISO27001-OBL-ISMS-CONTEXT',
      'ISO27001-OBL-RISK-PROCESS',
      'ISO27001-OBL-RISK-TREATMENT',
      'ISO27001-OBL-ASSETS',
      'ISO27001-OBL-ACCESS',
      'ISO27001-OBL-OPERATIONS',
      'ISO27001-OBL-SUPPLIER',
      'ISO27001-OBL-INCIDENT',
      'ISO27001-OBL-CONTINUITY',
      'ISO27001-OBL-PEOPLE',
      'ISO27001-OBL-MONITORING',
      'ISO27001-OBL-IMPROVEMENT',
    ],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: [SRC],
    derived_from: [SRC],
  },
  {
    rule_id: 'ISO27001-OUTPUT-LOG',
    name: 'Log governance event for ISO/IEC 27001-scoped output',
    phase: 'output',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: { regulatory_applicability: 'ISO_27001' },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ISO27001_OUTPUT_LOG'],
    obligation_ids: ['ISO27001-OBL-MONITORING'],
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
    authority: 'ISO/IEC 27001:2022',
    authority_tier: 3,
    citations: [citation],
    source_ids: [SRC],
  };
}

export const ISO_27001_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    [SRC]: {
      source_id: SRC,
      authority: 'ISO/IEC 27001:2022',
      authority_tier: 3,
      authority_type: 'STANDARD',
      legal_authority: false,
      authority_id: POLICY_AUTHORITY_IDS.iso27001,
      title:
        'Information security, cybersecurity and privacy protection — Information security management systems — Requirements',
      publisher: 'ISO / IEC',
      citation: 'ISO/IEC 27001:2022',
      canonical_url: 'https://www.iso.org/standard/27001',
      effective_date: '2022-10-25',
      retrieved_date: '2026-09-07',
      version: '2022',
      note: 'International Standard for ISMS requirements (Edition 3). Not statute; not an Enigma certification, compliance determination, SIEM, Annex A checklist score, or security assessment. Amendment ISO/IEC 27001:2022/Amd 1:2024 is recognized as amendment context only. Enigma-derived controls are interpretations for AI action governance evidence.',
    },
  },
  obligations: {
    'ISO27001-OBL-ISMS-CONTEXT': obl(
      'ISO27001-OBL-ISMS-CONTEXT',
      'ISO/IEC 27001:2022 — ISMS context / scope / objectives',
    ),
    'ISO27001-OBL-RISK-PROCESS': obl(
      'ISO27001-OBL-RISK-PROCESS',
      'ISO/IEC 27001:2022 — information-security risk assessment',
    ),
    'ISO27001-OBL-RISK-TREATMENT': obl(
      'ISO27001-OBL-RISK-TREATMENT',
      'ISO/IEC 27001:2022 — information-security risk treatment',
    ),
    'ISO27001-OBL-ASSETS': obl(
      'ISO27001-OBL-ASSETS',
      'ISO/IEC 27001:2022 — information / asset governance',
    ),
    'ISO27001-OBL-ACCESS': obl(
      'ISO27001-OBL-ACCESS',
      'ISO/IEC 27001:2022 — access control',
    ),
    'ISO27001-OBL-OPERATIONS': obl(
      'ISO27001-OBL-OPERATIONS',
      'ISO/IEC 27001:2022 — operational security',
    ),
    'ISO27001-OBL-SUPPLIER': obl(
      'ISO27001-OBL-SUPPLIER',
      'ISO/IEC 27001:2022 — supplier relationships',
    ),
    'ISO27001-OBL-INCIDENT': obl(
      'ISO27001-OBL-INCIDENT',
      'ISO/IEC 27001:2022 — information security incident management',
    ),
    'ISO27001-OBL-CONTINUITY': obl(
      'ISO27001-OBL-CONTINUITY',
      'ISO/IEC 27001:2022 — information security during disruption',
    ),
    'ISO27001-OBL-PEOPLE': obl(
      'ISO27001-OBL-PEOPLE',
      'ISO/IEC 27001:2022 — people controls / awareness',
    ),
    'ISO27001-OBL-MONITORING': obl(
      'ISO27001-OBL-MONITORING',
      'ISO/IEC 27001:2022 — monitoring / internal audit / management review',
    ),
    'ISO27001-OBL-IMPROVEMENT': obl(
      'ISO27001-OBL-IMPROVEMENT',
      'ISO/IEC 27001:2022 — nonconformity and continual improvement',
    ),
  },
};
