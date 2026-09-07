/**
 * Compiled NIST AI RMF pack artifacts (Pack #3).
 * Pack version 1.0.0 — focused framework guidance pack.
 * FRAMEWORK authority — not legal/regulatory mandate.
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type NistCompiledRule = {
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

export const NIST_AI_RMF_PACK_META = {
  pack_id: 'pack_nist_ai_rmf',
  pack_version: '1.0.0',
  input_interpreter: 'nist_ai_rmf_pack_v1' as const,
  output_interpreter: 'nist_ai_rmf_pack_v1_output' as const,
  input_policy_id: 'pol_nist_ai_rmf_input',
  input_version: 1,
  output_policy_id: 'pol_nist_ai_rmf_output',
  output_version: 1,
};

export const NIST_AI_RMF_RULES: NistCompiledRule[] = [
  {
    rule_id: 'NIST-R-INPUT-GOVERN-CONTEXT-REVIEW',
    name: 'Review when AI governance accountability context is not documented',
    phase: 'input',
    priority: 80,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Enigma REVIEW control informed by NIST GOVERN guidance — NIST does not mandate REVIEW.',
    conditions: {
      regulatory_applicability: 'NIST_AI_RMF',
      nist_governance_documented: false,
    },
    decision: 'REVIEW',
    reason_codes: ['NIST_RMF_GOVERNANCE_CONTEXT_REVIEW'],
    obligation_ids: ['NIST-OBL-GOVERN-ACCOUNTABILITY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_nist_ai_rmf_100_1'],
    derived_from: ['src_nist_ai_rmf_100_1'],
  },
  {
    rule_id: 'NIST-R-INPUT-MAP-CONTEXT-REVIEW',
    name: 'Review when AI system context and intended purpose are not documented',
    phase: 'input',
    priority: 75,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Enigma REVIEW control informed by NIST MAP 1.1 — framework guidance, not legal mandate.',
    conditions: {
      regulatory_applicability: 'NIST_AI_RMF',
      nist_map_context_documented: false,
    },
    decision: 'REVIEW',
    reason_codes: ['NIST_RMF_MAP_CONTEXT_REVIEW'],
    obligation_ids: ['NIST-OBL-MAP-CONTEXT'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_nist_ai_rmf_100_1'],
    derived_from: ['src_nist_ai_rmf_100_1'],
  },
  {
    rule_id: 'NIST-R-INPUT-MEASURE-GAP-REVIEW',
    name: 'Review when measurement or monitoring evidence is not documented',
    phase: 'input',
    priority: 70,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Enigma REVIEW control informed by NIST MEASURE 2.4/2.5.',
    conditions: {
      regulatory_applicability: 'NIST_AI_RMF',
      nist_measure_documented: false,
    },
    decision: 'REVIEW',
    reason_codes: ['NIST_RMF_MEASURE_EVIDENCE_REVIEW'],
    obligation_ids: ['NIST-OBL-MEASURE-MONITOR'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_nist_ai_rmf_100_1'],
    derived_from: ['src_nist_ai_rmf_100_1'],
  },
  {
    rule_id: 'NIST-R-INPUT-MANAGE-RESPONSE-REVIEW',
    name: 'Review when prioritized AI risk response is not documented',
    phase: 'input',
    priority: 65,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Enigma REVIEW control informed by NIST MANAGE 1.1/1.3.',
    conditions: {
      regulatory_applicability: 'NIST_AI_RMF',
      nist_manage_response_documented: false,
    },
    decision: 'REVIEW',
    reason_codes: ['NIST_RMF_MANAGE_RESPONSE_REVIEW'],
    obligation_ids: ['NIST-OBL-MANAGE-RESPONSE'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_nist_ai_rmf_100_1', 'src_nist_ai_rmf_playbook'],
    derived_from: ['src_nist_ai_rmf_100_1'],
  },
  {
    rule_id: 'NIST-R-INPUT-CONTROLS-SATISFIED',
    name: 'Allow with logging when NIST AI RMF documentation controls are satisfied',
    phase: 'input',
    priority: 40,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Complementary Enigma logging control when framework documentation gates are met.',
    conditions: {
      regulatory_applicability: 'NIST_AI_RMF',
      nist_governance_documented: true,
      nist_map_context_documented: true,
      nist_measure_documented: true,
      nist_manage_response_documented: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['NIST_RMF_CONTROLS_SATISFIED'],
    obligation_ids: [
      'NIST-OBL-GOVERN-ACCOUNTABILITY',
      'NIST-OBL-MAP-CONTEXT',
      'NIST-OBL-MEASURE-MONITOR',
      'NIST-OBL-MANAGE-RESPONSE',
    ],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_nist_ai_rmf_100_1'],
    derived_from: ['src_nist_ai_rmf_100_1'],
  },
  {
    rule_id: 'NIST-R-OUTPUT-MONITOR-LOG',
    name: 'Log governance event for NIST-scoped output monitoring',
    phase: 'output',
    priority: 50,
    requirement_type: 'DERIVED_CONTROL',
    note: 'Complementary Enigma logging informed by MEASURE monitoring guidance.',
    conditions: {
      regulatory_applicability: 'NIST_AI_RMF',
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['NIST_RMF_OUTPUT_MONITOR_LOG'],
    obligation_ids: ['NIST-OBL-MEASURE-MONITOR'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_nist_ai_rmf_100_1'],
    derived_from: ['src_nist_ai_rmf_100_1'],
  },
];

export const NIST_AI_RMF_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    src_nist_ai_rmf_100_1: {
      source_id: 'src_nist_ai_rmf_100_1',
      authority: 'NIST AI RMF 1.0',
      authority_tier: 4,
      authority_type: 'IMPLEMENTATION_GUIDANCE',
      legal_authority: false,
      authority_id: POLICY_AUTHORITY_IDS.nistAiRmf,
      title: 'Artificial Intelligence Risk Management Framework (AI RMF 1.0)',
      publisher: 'National Institute of Standards and Technology',
      citation: 'NIST AI 100-1 — Artificial Intelligence Risk Management Framework (AI RMF 1.0)',
      canonical_url: 'https://doi.org/10.6028/NIST.AI.100-1',
      effective_date: '2023-01-26',
      retrieved_date: null,
      version: '1.0',
      note: 'Primary framework publication. Voluntary; not a statute or regulation.',
    },
    src_nist_ai_rmf_playbook: {
      source_id: 'src_nist_ai_rmf_playbook',
      authority: 'NIST AI RMF Playbook',
      authority_tier: 4,
      authority_type: 'IMPLEMENTATION_GUIDANCE',
      legal_authority: false,
      authority_id: POLICY_AUTHORITY_IDS.nistAiRmf,
      title: 'AI RMF Playbook',
      publisher: 'National Institute of Standards and Technology',
      citation: 'NIST AI RMF Playbook — suggested actions for AI RMF Core functions',
      canonical_url: 'https://www.nist.gov/itl/ai-risk-management-framework',
      effective_date: null,
      retrieved_date: null,
      version: null,
      note: 'Supporting implementation guidance for AI RMF Core outcomes.',
    },
  },
  obligations: {
    'NIST-OBL-GOVERN-ACCOUNTABILITY': {
      obligation_id: 'NIST-OBL-GOVERN-ACCOUNTABILITY',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'NIST AI RMF 1.0',
      authority_tier: 4,
      citations: ['NIST AI 100-1 GOVERN 2.1', 'NIST AI 100-1 GOVERN 1.1'],
      source_ids: ['src_nist_ai_rmf_100_1'],
    },
    'NIST-OBL-MAP-CONTEXT': {
      obligation_id: 'NIST-OBL-MAP-CONTEXT',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'NIST AI RMF 1.0',
      authority_tier: 4,
      citations: ['NIST AI 100-1 MAP 1.1'],
      source_ids: ['src_nist_ai_rmf_100_1'],
    },
    'NIST-OBL-MEASURE-MONITOR': {
      obligation_id: 'NIST-OBL-MEASURE-MONITOR',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'NIST AI RMF 1.0',
      authority_tier: 4,
      citations: ['NIST AI 100-1 MEASURE 2.4', 'NIST AI 100-1 MEASURE 2.5'],
      source_ids: ['src_nist_ai_rmf_100_1'],
    },
    'NIST-OBL-MANAGE-RESPONSE': {
      obligation_id: 'NIST-OBL-MANAGE-RESPONSE',
      requirement_type: 'IMPLEMENTATION_OPTION',
      authority: 'NIST AI RMF 1.0',
      authority_tier: 4,
      citations: ['NIST AI 100-1 MANAGE 1.1', 'NIST AI 100-1 MANAGE 1.3'],
      source_ids: ['src_nist_ai_rmf_100_1', 'src_nist_ai_rmf_playbook'],
    },
  },
};
