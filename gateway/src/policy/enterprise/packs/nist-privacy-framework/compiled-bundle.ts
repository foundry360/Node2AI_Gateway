/**
 * Compiled NIST Privacy Framework 1.0 pack artifacts (Pack #14).
 * Pack version 1.0.0 — privacy-risk FRAMEWORK (voluntary guidance).
 * Not legal authority; not a certification; not GDPR/DSAR/DPIA/score/GRC.
 * Distinct from ISO/IEC 27701 (PIMS) — uses governance_context.privacy.nist_pf.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type NistPrivacyFrameworkCompiledRule = {
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

export const NIST_PRIVACY_FRAMEWORK_PACK_META = {
  pack_id: 'pack_nist_privacy_framework',
  pack_version: '1.0.0',
  input_interpreter: 'nist_privacy_framework_pack_v1' as const,
  output_interpreter: 'nist_privacy_framework_pack_v1_output' as const,
  input_policy_id: 'pol_nist_privacy_framework_input',
  input_version: 1,
  output_policy_id: 'pol_nist_privacy_framework_output',
  output_version: 1,
};

const SRC = 'src_nist_privacy_framework_1_0';
const REVIEW_OBL = ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'] as const;

function reviewRule(
  rule_id: string,
  name: string,
  priority: number,
  gate: string,
  reason: string,
  obligation_id: string,
  note?: string,
): NistPrivacyFrameworkCompiledRule {
  return {
    rule_id,
    name,
    phase: 'input',
    priority,
    requirement_type: 'DERIVED_CONTROL',
    note,
    conditions: { regulatory_applicability: 'NIST_PRIVACY_FRAMEWORK', [gate]: false },
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
 * NIST Privacy Framework 1.0-informed privacy-risk governance controls.
 * Missing evidence → REVIEW (not DENY). Five PF Functions as evidence families.
 * Does not consume ISO/IEC 27701 PIMS fields — privacy.nist_pf only.
 */
export const NIST_PRIVACY_FRAMEWORK_RULES: NistPrivacyFrameworkCompiledRule[] = [
  reviewRule(
    'NIST-PF-IDENTIFY-DATA-PROCESSING',
    'Review when data-processing context evidence is missing',
    110,
    'identify_processing',
    'NIST_PF_IDENTIFY_DATA_PROCESSING_REVIEW',
    'NIST-PF-OBL-IDENTIFY-PROCESSING',
    'NIST Privacy Framework-informed IDENTIFY-P control — not NIST certification.',
  ),
  reviewRule(
    'NIST-PF-IDENTIFY-PRIVACY-RISK',
    'Review when privacy-risk identification evidence is missing',
    105,
    'identify_privacy_risk',
    'NIST_PF_IDENTIFY_PRIVACY_RISK_REVIEW',
    'NIST-PF-OBL-IDENTIFY-PRIVACY-RISK',
  ),
  reviewRule(
    'NIST-PF-IDENTIFY-DATA-ACTIONS',
    'Review when data-actions documentation evidence is missing',
    100,
    'identify_data_actions',
    'NIST_PF_IDENTIFY_DATA_ACTIONS_REVIEW',
    'NIST-PF-OBL-IDENTIFY-DATA-ACTIONS',
  ),
  reviewRule(
    'NIST-PF-GOVERN-POLICIES',
    'Review when privacy governance policy evidence is missing',
    95,
    'govern_policies',
    'NIST_PF_GOVERN_POLICIES_REVIEW',
    'NIST-PF-OBL-GOVERN-POLICIES',
  ),
  reviewRule(
    'NIST-PF-GOVERN-ROLES',
    'Review when privacy roles/responsibilities evidence is missing',
    90,
    'govern_roles',
    'NIST_PF_GOVERN_ROLES_REVIEW',
    'NIST-PF-OBL-GOVERN-ROLES',
  ),
  reviewRule(
    'NIST-PF-GOVERN-RISK',
    'Review when privacy risk-governance evidence is missing',
    85,
    'govern_risk',
    'NIST_PF_GOVERN_RISK_REVIEW',
    'NIST-PF-OBL-GOVERN-RISK',
  ),
  reviewRule(
    'NIST-PF-CONTROL-DATA-ACTIONS',
    'Review when data-action control evidence is missing',
    80,
    'control_data_actions',
    'NIST_PF_CONTROL_DATA_ACTIONS_REVIEW',
    'NIST-PF-OBL-CONTROL-DATA-ACTIONS',
  ),
  reviewRule(
    'NIST-PF-CONTROL-INDIVIDUAL-CHOICE',
    'Review when individual choice/participation evidence is missing',
    75,
    'control_individual_choice',
    'NIST_PF_CONTROL_INDIVIDUAL_CHOICE_REVIEW',
    'NIST-PF-OBL-CONTROL-INDIVIDUAL-CHOICE',
  ),
  reviewRule(
    'NIST-PF-COMMUNICATE-TRANSPARENCY',
    'Review when privacy transparency evidence is missing',
    70,
    'communicate_transparency',
    'NIST_PF_COMMUNICATE_TRANSPARENCY_REVIEW',
    'NIST-PF-OBL-COMMUNICATE-TRANSPARENCY',
  ),
  reviewRule(
    'NIST-PF-COMMUNICATE-EXPECTATIONS',
    'Review when privacy expectations/disclosure evidence is missing',
    65,
    'communicate_expectations',
    'NIST_PF_COMMUNICATE_EXPECTATIONS_REVIEW',
    'NIST-PF-OBL-COMMUNICATE-EXPECTATIONS',
  ),
  reviewRule(
    'NIST-PF-PROTECT-PRIVACY-RISK',
    'Review when privacy-risk mitigation evidence is missing',
    60,
    'protect_privacy_risk',
    'NIST_PF_PROTECT_PRIVACY_RISK_REVIEW',
    'NIST-PF-OBL-PROTECT-PRIVACY-RISK',
  ),
  {
    rule_id: 'NIST-PF-CONTROLS-SATISFIED',
    name: 'Allow with controls when NIST Privacy Framework-informed evidence is established',
    phase: 'input',
    priority: 40,
    requirement_type: 'DERIVED_CONTROL',
    note: 'NIST Privacy Framework-informed posture — not NIST certified / compliant / privacy scored.',
    conditions: {
      regulatory_applicability: 'NIST_PRIVACY_FRAMEWORK',
      identify_processing: true,
      identify_privacy_risk: true,
      identify_data_actions: true,
      govern_policies: true,
      govern_roles: true,
      govern_risk: true,
      control_data_actions: true,
      control_individual_choice: true,
      communicate_transparency: true,
      communicate_expectations: true,
      protect_privacy_risk: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['NIST_PF_CONTROLS_SATISFIED'],
    obligation_ids: [
      'NIST-PF-OBL-IDENTIFY-PROCESSING',
      'NIST-PF-OBL-IDENTIFY-PRIVACY-RISK',
      'NIST-PF-OBL-IDENTIFY-DATA-ACTIONS',
      'NIST-PF-OBL-GOVERN-POLICIES',
      'NIST-PF-OBL-GOVERN-ROLES',
      'NIST-PF-OBL-GOVERN-RISK',
      'NIST-PF-OBL-CONTROL-DATA-ACTIONS',
      'NIST-PF-OBL-CONTROL-INDIVIDUAL-CHOICE',
      'NIST-PF-OBL-COMMUNICATE-TRANSPARENCY',
      'NIST-PF-OBL-COMMUNICATE-EXPECTATIONS',
      'NIST-PF-OBL-PROTECT-PRIVACY-RISK',
    ],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: [SRC],
    derived_from: [SRC],
  },
  {
    rule_id: 'NIST-PF-OUTPUT-LOG',
    name: 'Log governance event for NIST Privacy Framework-scoped output',
    phase: 'output',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: { regulatory_applicability: 'NIST_PRIVACY_FRAMEWORK' },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['NIST_PF_OUTPUT_LOG'],
    obligation_ids: ['NIST-PF-OBL-COMMUNICATE-TRANSPARENCY'],
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
    authority: 'NIST Privacy Framework 1.0',
    authority_tier: 4,
    citations: [citation],
    source_ids: [SRC],
  };
}

export const NIST_PRIVACY_FRAMEWORK_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    [SRC]: {
      source_id: SRC,
      authority: 'NIST Privacy Framework 1.0',
      authority_tier: 4,
      authority_type: 'FRAMEWORK',
      legal_authority: false,
      authority_id: POLICY_AUTHORITY_IDS.nistPrivacyFramework,
      title:
        'NIST Privacy Framework: A Tool for Improving Privacy through Enterprise Risk Management, Version 1.0',
      publisher: 'National Institute of Standards and Technology',
      citation: 'NIST CSWP 10',
      canonical_url:
        'https://csrc.nist.gov/pubs/cswp/10/nist-privacy-framework-version-10/final',
      effective_date: '2020-01-16',
      retrieved_date: '2026-09-07',
      version: '1.0',
      note: 'Voluntary privacy-risk management framework (NIST CSWP 10). Not statute; not GDPR/HIPAA determination; not an Enigma certification, compliance determination, DSAR workflow, DPIA app, privacy score, or PII scanner. NIST PF 1.1 draft is not used. Enigma-derived controls are NIST Privacy Framework-informed interpretations for AI action governance evidence.',
    },
  },
  obligations: {
    'NIST-PF-OBL-IDENTIFY-PROCESSING': obl(
      'NIST-PF-OBL-IDENTIFY-PROCESSING',
      'NIST Privacy Framework 1.0 — IDENTIFY-P / data processing context',
    ),
    'NIST-PF-OBL-IDENTIFY-PRIVACY-RISK': obl(
      'NIST-PF-OBL-IDENTIFY-PRIVACY-RISK',
      'NIST Privacy Framework 1.0 — IDENTIFY-P / privacy risk',
    ),
    'NIST-PF-OBL-IDENTIFY-DATA-ACTIONS': obl(
      'NIST-PF-OBL-IDENTIFY-DATA-ACTIONS',
      'NIST Privacy Framework 1.0 — IDENTIFY-P / data actions',
    ),
    'NIST-PF-OBL-GOVERN-POLICIES': obl(
      'NIST-PF-OBL-GOVERN-POLICIES',
      'NIST Privacy Framework 1.0 — GOVERN-P / policies',
    ),
    'NIST-PF-OBL-GOVERN-ROLES': obl(
      'NIST-PF-OBL-GOVERN-ROLES',
      'NIST Privacy Framework 1.0 — GOVERN-P / roles',
    ),
    'NIST-PF-OBL-GOVERN-RISK': obl(
      'NIST-PF-OBL-GOVERN-RISK',
      'NIST Privacy Framework 1.0 — GOVERN-P / risk governance',
    ),
    'NIST-PF-OBL-CONTROL-DATA-ACTIONS': obl(
      'NIST-PF-OBL-CONTROL-DATA-ACTIONS',
      'NIST Privacy Framework 1.0 — CONTROL-P / data actions',
    ),
    'NIST-PF-OBL-CONTROL-INDIVIDUAL-CHOICE': obl(
      'NIST-PF-OBL-CONTROL-INDIVIDUAL-CHOICE',
      'NIST Privacy Framework 1.0 — CONTROL-P / individual choice',
    ),
    'NIST-PF-OBL-COMMUNICATE-TRANSPARENCY': obl(
      'NIST-PF-OBL-COMMUNICATE-TRANSPARENCY',
      'NIST Privacy Framework 1.0 — COMMUNICATE-P / transparency',
    ),
    'NIST-PF-OBL-COMMUNICATE-EXPECTATIONS': obl(
      'NIST-PF-OBL-COMMUNICATE-EXPECTATIONS',
      'NIST Privacy Framework 1.0 — COMMUNICATE-P / expectations',
    ),
    'NIST-PF-OBL-PROTECT-PRIVACY-RISK': obl(
      'NIST-PF-OBL-PROTECT-PRIVACY-RISK',
      'NIST Privacy Framework 1.0 — PROTECT-P / privacy risk mitigation',
    ),
  },
};
