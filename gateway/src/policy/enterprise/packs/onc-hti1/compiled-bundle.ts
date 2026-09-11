/**
 * Compiled ONC HTI-1 thin pack artifacts (Healthcare Pack #3).
 * Pack version 1.0.0 — predictive DSI / algorithm transparency MVP.
 * Does not assert ONC certification or legal compliance.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type OncHti1CompiledRule = {
  rule_id: string;
  name: string;
  phase: 'input' | 'output';
  priority: number;
  conditions: Record<string, unknown>;
  decision: 'DENY' | 'ALLOW_WITH_CONTROLS' | 'BLOCK_OUTPUT' | 'REVIEW';
  reason_codes: string[];
  obligation_ids?: string[];
  control_ids?: string[];
  enigma_obligations?: string[];
  sources?: string[];
  derived_from?: string[];
  requirement_type?: string;
  note?: string;
};

export const ONC_HTI1_RULES: OncHti1CompiledRule[] = [
  {
    rule_id: 'ONC-R-DSI-IDENTITY',
    name: 'High-risk clinical predictive use requires algorithm/model identity',
    phase: 'input',
    priority: 100,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      clinical_predictive: true,
      high_risk: true,
      has_algorithm_identity: false,
    },
    decision: 'DENY',
    reason_codes: ['ONC_DSI_IDENTITY_REQUIRED'],
    obligation_ids: ['ONC-OBL-ALGORITHM-IDENTITY'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-UNSUPPORTED-CONTEXT',
    name: 'Clinical predictive use without model identity requires governance review',
    phase: 'input',
    priority: 99,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      clinical_predictive: true,
      has_algorithm_identity: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ONC_DSI_IDENTITY_CONTEXT_INSUFFICIENT'],
    obligation_ids: ['ONC-OBL-ALGORITHM-IDENTITY'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-UNKNOWN-APPLICABILITY',
    name: 'Review when HTI-1 applicability is unknown for high-risk clinical AI',
    phase: 'input',
    priority: 95,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'unknown',
      clinical_predictive: true,
      high_risk: true,
    },
    decision: 'REVIEW',
    reason_codes: ['ONC_DSI_APPLICABILITY_UNKNOWN'],
    obligation_ids: ['ONC-OBL-APPLICABILITY'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-INTENDED-USE',
    name: 'Clinical predictive use requires identified intended use',
    phase: 'input',
    priority: 90,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      clinical_predictive: true,
      has_intended_use: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ONC_DSI_INTENDED_USE_REQUIRED'],
    obligation_ids: ['ONC-OBL-INTENDED-USE'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-TRANSPARENCY',
    name: 'High-risk clinical predictive use requires transparency evidence',
    phase: 'input',
    priority: 85,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      clinical_predictive: true,
      high_risk: true,
      transparency_sufficient: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ONC_DSI_TRANSPARENCY_EVIDENCE_INSUFFICIENT'],
    obligation_ids: ['ONC-OBL-TRANSPARENCY'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-FAVES',
    name: 'High-risk clinical predictive use requires FAVES evidence',
    phase: 'input',
    priority: 84,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      clinical_predictive: true,
      high_risk: true,
      faves_sufficient: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ONC_DSI_FAVES_EVIDENCE_INSUFFICIENT'],
    obligation_ids: ['ONC-OBL-FAVES'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-RISK-MANAGEMENT',
    name: 'High-risk predictive use requires risk-management evidence',
    phase: 'input',
    priority: 83,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      high_risk: true,
      risk_management_sufficient: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ONC_DSI_RISK_MANAGEMENT_INSUFFICIENT'],
    obligation_ids: ['ONC-OBL-RISK-MANAGEMENT'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-HUMAN-OVERSIGHT',
    name: 'High-risk clinical predictive use requires human oversight context',
    phase: 'input',
    priority: 82,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      clinical_predictive: true,
      high_risk: true,
      human_oversight_sufficient: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ONC_DSI_HUMAN_OVERSIGHT_REQUIRED'],
    obligation_ids: ['ONC-OBL-HUMAN-OVERSIGHT'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-VERSION-GOVERNANCE',
    name: 'Stale or changed model version requires governance re-evaluation',
    phase: 'input',
    priority: 81,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      version_governance_current: false,
    },
    decision: 'REVIEW',
    reason_codes: ['ONC_DSI_VERSION_GOVERNANCE_STALE'],
    obligation_ids: ['ONC-OBL-VERSION-GOVERNANCE'],
    control_ids: ['ctrl_authorization', 'ctrl_audit_logging'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-CONTROLS-SATISFIED',
    name: 'Allow when applicable ONC DSI governance evidence is satisfied',
    phase: 'input',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      onc_controls_satisfied: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ONC_DSI_GOVERNANCE_CONTROLS_SATISFIED'],
    obligation_ids: ['ONC-OBL-APPLICABILITY', 'ONC-OBL-TRANSPARENCY'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
  {
    rule_id: 'ONC-R-DSI-OUT-RELEASE',
    name: 'Allow output release when ONC DSI input governance was satisfied',
    phase: 'output',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    conditions: {
      regulatory_applicability: 'ONC_HTI1',
      onc_applicability: 'applicable',
      onc_controls_satisfied: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['ONC_DSI_OUTPUT_GOVERNANCE_SATISFIED'],
    obligation_ids: ['ONC-OBL-APPLICABILITY'],
    control_ids: ['ctrl_output_inspection', 'ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_onc_hti1'],
    derived_from: ['src_onc_hti1'],
  },
];

export const ONC_HTI1_PACK_META = {
  pack_id: 'pack_onc_hti1',
  pack_version: '1.0.0',
  pack_name: 'ONC HTI-1 Predictive DSI (Thin)',
  authority_id: POLICY_AUTHORITY_IDS.oncHti1,
  input_interpreter: 'onc_hti1_pack_v1' as const,
  output_interpreter: 'onc_hti1_pack_v1_output' as const,
  input_policy_id: 'pol_onc_hti1_dsi_input',
  input_version: 1,
  output_policy_id: 'pol_onc_hti1_dsi_output',
  output_version: 1,
} as const;

export const ONC_HTI1_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    src_onc_hti1: {
      source_id: 'src_onc_hti1',
      authority: 'ONC HTI-1 Final Rule — Predictive Decision Support / Algorithm Transparency',
      authority_tier: 2,
      authority_type: 'PRIMARY',
      legal_authority: true,
      authority_id: POLICY_AUTHORITY_IDS.oncHti1,
      title:
        'Health Data, Technology, and Interoperability: Certification Program Updates, Algorithm Transparency, and Information Sharing (HTI-1)',
      publisher: 'Office of the National Coordinator for Health Information Technology (ONC)',
      citation: '89 FR 1192 (HTI-1 Final Rule) — Predictive DSI / algorithm transparency concepts',
      canonical_url:
        'https://www.healthit.gov/topic/laws-regulation-and-policy/health-data-technology-and-interoperability-certification-program',
      note: 'Enigma maps selected transparency / FAVES / oversight concepts into runtime policy. Not a certification determination.',
    },
  },
  obligations: {
    'ONC-OBL-ALGORITHM-IDENTITY': {
      obligation_id: 'ONC-OBL-ALGORITHM-IDENTITY',
      requirement_type: 'DERIVED_CONTROL',
      authority: 'ONC HTI-1',
      authority_tier: 2,
      citations: ['89 FR 1192 — algorithm transparency (identity)'],
      source_ids: ['src_onc_hti1'],
    },
    'ONC-OBL-INTENDED-USE': {
      obligation_id: 'ONC-OBL-INTENDED-USE',
      requirement_type: 'DERIVED_CONTROL',
      authority: 'ONC HTI-1',
      authority_tier: 2,
      citations: ['89 FR 1192 — source attributes (intended use)'],
      source_ids: ['src_onc_hti1'],
    },
    'ONC-OBL-TRANSPARENCY': {
      obligation_id: 'ONC-OBL-TRANSPARENCY',
      requirement_type: 'DERIVED_CONTROL',
      authority: 'ONC HTI-1',
      authority_tier: 2,
      citations: ['89 FR 1192 — source attributes'],
      source_ids: ['src_onc_hti1'],
    },
    'ONC-OBL-FAVES': {
      obligation_id: 'ONC-OBL-FAVES',
      requirement_type: 'DERIVED_CONTROL',
      authority: 'ONC HTI-1',
      authority_tier: 2,
      citations: ['89 FR 1192 — FAVES'],
      source_ids: ['src_onc_hti1'],
    },
    'ONC-OBL-RISK-MANAGEMENT': {
      obligation_id: 'ONC-OBL-RISK-MANAGEMENT',
      requirement_type: 'DERIVED_CONTROL',
      authority: 'ONC HTI-1',
      authority_tier: 2,
      citations: ['89 FR 1192 — risk management / monitoring concepts'],
      source_ids: ['src_onc_hti1'],
    },
    'ONC-OBL-HUMAN-OVERSIGHT': {
      obligation_id: 'ONC-OBL-HUMAN-OVERSIGHT',
      requirement_type: 'DERIVED_CONTROL',
      authority: 'ONC HTI-1',
      authority_tier: 2,
      citations: ['89 FR 1192 — ongoing use / oversight concepts'],
      source_ids: ['src_onc_hti1'],
    },
    'ONC-OBL-VERSION-GOVERNANCE': {
      obligation_id: 'ONC-OBL-VERSION-GOVERNANCE',
      requirement_type: 'DERIVED_CONTROL',
      authority: 'ONC HTI-1',
      authority_tier: 2,
      citations: ['89 FR 1192 — ongoing monitoring / update concepts'],
      source_ids: ['src_onc_hti1'],
    },
    'ONC-OBL-APPLICABILITY': {
      obligation_id: 'ONC-OBL-APPLICABILITY',
      requirement_type: 'DERIVED_CONTROL',
      authority: 'ONC HTI-1',
      authority_tier: 2,
      citations: ['89 FR 1192 — Certification Program context'],
      source_ids: ['src_onc_hti1'],
    },
  },
};
