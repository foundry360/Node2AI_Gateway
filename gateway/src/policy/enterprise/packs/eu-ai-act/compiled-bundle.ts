/**
 * Compiled EU AI Act pack artifacts (Pack #5).
 * Pack version 1.0.0 — Regulation (EU) 2024/1689 (consolidated).
 * Legal authority — not an Enigma compliance certification.
 *
 * Application dates (Art. 113):
 * - Chapter II (Art. 5 prohibited): 2025-02-02
 * - Chapter V (GPAI): 2025-08-02
 * - Article 50 transparency: 2026-08-02 (general application)
 * - High-risk Art. 6(2)/Annex III obligations: 2026-08-02
 * - High-risk Art. 6(1) product-safety pathway: 2027-08-02
 */

import type { PackProvenanceGraph } from '../../provenance.js';
import { POLICY_AUTHORITY_IDS } from '../../authority.js';

export type EuAiActCompiledRule = {
  rule_id: string;
  name: string;
  phase: 'input' | 'output';
  priority: number;
  conditions: Record<string, unknown>;
  decision: 'DENY' | 'ALLOW_WITH_CONTROLS' | 'REVIEW' | 'ALLOW';
  reason_codes: string[];
  obligation_ids?: string[];
  control_ids?: string[];
  enigma_obligations?: string[];
  sources?: string[];
  derived_from?: string[];
  requirement_type?: string;
  /** ISO date — obligation applies on/after this date (Art. 113). */
  application_date?: string;
  note?: string;
};

export const EU_AI_ACT_PACK_META = {
  pack_id: 'pack_eu_ai_act',
  pack_version: '1.0.0',
  input_interpreter: 'eu_ai_act_pack_v1' as const,
  output_interpreter: 'eu_ai_act_pack_v1_output' as const,
  input_policy_id: 'pol_eu_ai_act_input',
  input_version: 1,
  output_policy_id: 'pol_eu_ai_act_output',
  output_version: 1,
};

/** Art. 113 phased application dates (YYYY-MM-DD). */
export const EU_AI_ACT_APPLICATION_DATES = {
  prohibited_practices: '2025-02-02',
  gpai: '2025-08-02',
  transparency_art50: '2026-08-02',
  high_risk_annex_iii: '2026-08-02',
  high_risk_art6_1: '2027-08-02',
} as const;

/**
 * Executable regulatory rules. Conditions use derived gates from
 * governance_context.regulatory + evaluation_as_of — not detectors.
 */
export const EU_AI_ACT_RULES: EuAiActCompiledRule[] = [
  // --- Family A: Prohibited practices (Art. 5) — applicable from 2025-02-02 ---
  {
    rule_id: 'EU-AI-ACT-ART5-PROHIBITED-DENY',
    name: 'Deny when an applicable Article 5 prohibited practice is established',
    phase: 'input',
    priority: 200,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.prohibited_practices,
    note: 'Regulatory prohibition under Art. 5 — not a security control attestation.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      prohibited_practice_established: true,
    },
    decision: 'DENY',
    reason_codes: ['EU_AI_ACT_ART5_PROHIBITED_PRACTICE'],
    obligation_ids: ['EU-OBL-ART5-PROHIBITED'],
    control_ids: ['ctrl_enigma_block'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT', 'NO_EXTERNAL_TRANSMISSION'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-ART5-PROHIBITED-UNCERTAIN',
    name: 'Review when prohibited-practice applicability cannot be established',
    phase: 'input',
    priority: 195,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.prohibited_practices,
    note: 'Uncertainty must not silently become ALLOW or DENY.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      prohibited_practice_uncertain: true,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_ART5_PROHIBITED_APPLICABILITY_UNCERTAIN'],
    obligation_ids: ['EU-OBL-ART5-PROHIBITED'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },

  // --- Family B: High-risk (Arts. 6, 9–15, 26) — Annex III from 2026-08-02 ---
  {
    rule_id: 'EU-AI-ACT-HIGH-RISK-APPLICABILITY-UNCERTAIN',
    name: 'Review when high-risk applicability cannot be established',
    phase: 'input',
    priority: 180,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.high_risk_annex_iii,
    note: 'Does not invent high-risk classification from sector keywords.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      high_risk_applicability_uncertain: true,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_HIGH_RISK_APPLICABILITY_UNCERTAIN'],
    obligation_ids: ['EU-OBL-ART6-HIGH-RISK'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-HIGH-RISK-OBLIGATIONS-REVIEW',
    name: 'Review when high-risk obligation evidence is not established',
    phase: 'input',
    priority: 175,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.high_risk_annex_iii,
    note: 'Arts. 9–15 / Art. 26 evidence gates — organizational evidence, not per-prompt proof.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      high_risk_established: true,
      high_risk_obligations_satisfied: false,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_HIGH_RISK_OBLIGATION_EVIDENCE_MISSING'],
    obligation_ids: [
      'EU-OBL-ART9-RISK-MANAGEMENT',
      'EU-OBL-ART10-DATA-GOVERNANCE',
      'EU-OBL-ART11-TECHNICAL-DOCUMENTATION',
      'EU-OBL-ART12-RECORD-KEEPING',
      'EU-OBL-ART13-TRANSPARENCY',
      'EU-OBL-ART14-HUMAN-OVERSIGHT',
      'EU-OBL-ART15-ACCURACY-ROBUSTNESS',
    ],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-HIGH-RISK-OBLIGATIONS-SATISFIED',
    name: 'Allow with controls when high-risk obligation evidence is established',
    phase: 'input',
    priority: 80,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.high_risk_annex_iii,
    note: 'Regulatory obligation evaluated — not EU AI Act certification.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      high_risk_established: true,
      high_risk_obligations_satisfied: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['EU_AI_ACT_HIGH_RISK_OBLIGATION_EVIDENCE_ESTABLISHED'],
    obligation_ids: [
      'EU-OBL-ART9-RISK-MANAGEMENT',
      'EU-OBL-ART14-HUMAN-OVERSIGHT',
      'EU-OBL-ART15-ACCURACY-ROBUSTNESS',
    ],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-ART6-1-HIGH-RISK-REVIEW',
    name: 'Review Art. 6(1) high-risk pathway when applicable and evidence missing',
    phase: 'input',
    priority: 170,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.high_risk_art6_1,
    note: 'Art. 6(1) product-safety high-risk pathway — later application date (Art. 113).',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      high_risk_art6_1_declared: true,
      high_risk_obligations_satisfied: false,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_ART6_1_HIGH_RISK_OBLIGATION_REVIEW'],
    obligation_ids: ['EU-OBL-ART6-HIGH-RISK'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },

  // --- Family C: Article 50 transparency — from 2026-08-02 ---
  {
    rule_id: 'EU-AI-ACT-ART50-INTERACTION-DISCLOSURE-REVIEW',
    name: 'Review when Art. 50 AI-interaction disclosure evidence is not established',
    phase: 'input',
    priority: 160,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.transparency_art50,
    note: 'Direct AI interaction transparency — Art. 50.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      art50_interaction_applicable: true,
      ai_interaction_disclosure: false,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_ART50_INTERACTION_DISCLOSURE_MISSING'],
    obligation_ids: ['EU-OBL-ART50-TRANSPARENCY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-ART50-SYNTHETIC-MARKING-REVIEW',
    name: 'Review when Art. 50 synthetic-content marking evidence is not established',
    phase: 'input',
    priority: 155,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.transparency_art50,
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      art50_synthetic_applicable: true,
      synthetic_content_marking: false,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_ART50_SYNTHETIC_MARKING_MISSING'],
    obligation_ids: ['EU-OBL-ART50-TRANSPARENCY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-ART50-DEEPFAKE-LABELING-REVIEW',
    name: 'Review when Art. 50 deepfake labeling evidence is not established',
    phase: 'input',
    priority: 150,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.transparency_art50,
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      art50_deepfake_applicable: true,
      deepfake_labeling: false,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_ART50_DEEPFAKE_LABELING_MISSING'],
    obligation_ids: ['EU-OBL-ART50-TRANSPARENCY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-ART50-PUBLIC-INTEREST-TEXT-REVIEW',
    name: 'Review when Art. 50 public-interest text editorial-control evidence is missing',
    phase: 'input',
    priority: 145,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.transparency_art50,
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      art50_public_interest_text_applicable: true,
      human_review_or_editorial_control: false,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_ART50_PUBLIC_INTEREST_EDITORIAL_CONTROL_MISSING'],
    obligation_ids: ['EU-OBL-ART50-TRANSPARENCY'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-ART50-TRANSPARENCY-SATISFIED',
    name: 'Allow with controls when applicable Art. 50 transparency evidence is established',
    phase: 'input',
    priority: 70,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.transparency_art50,
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      art50_any_applicable: true,
      art50_obligations_satisfied: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['EU_AI_ACT_ART50_TRANSPARENCY_EVIDENCE_ESTABLISHED'],
    obligation_ids: ['EU-OBL-ART50-TRANSPARENCY'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },

  // --- Family D: GPAI (Arts. 51–55) — from 2025-08-02 ---
  {
    rule_id: 'EU-AI-ACT-GPAI-PROVIDER-ROLE-REVIEW',
    name: 'Review when GPAI provider role/evidence cannot be established',
    phase: 'input',
    priority: 140,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.gpai,
    note: 'GPAI obligations attach to provider role — missing role → REVIEW.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      gpai_model: true,
      actor_role_missing: true,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_GPAI_ACTOR_ROLE_MISSING'],
    obligation_ids: ['EU-OBL-GPAI-PROVIDER'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-GPAI-PROVIDER-OBLIGATIONS-REVIEW',
    name: 'Review when GPAI provider obligation evidence is not established',
    phase: 'input',
    priority: 135,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.gpai,
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      gpai_provider: true,
      gpai_provider_obligations_satisfied: false,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_GPAI_PROVIDER_OBLIGATION_EVIDENCE_MISSING'],
    obligation_ids: ['EU-OBL-GPAI-PROVIDER'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-GPAI-SYSTEMIC-RISK-REVIEW',
    name: 'Review when GPAI systemic-risk obligation evidence is not established',
    phase: 'input',
    priority: 130,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.gpai,
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      gpai_systemic_risk_provider: true,
      gpai_systemic_risk_obligations_satisfied: false,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_GPAI_SYSTEMIC_RISK_OBLIGATION_EVIDENCE_MISSING'],
    obligation_ids: ['EU-OBL-GPAI-SYSTEMIC-RISK'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
  {
    rule_id: 'EU-AI-ACT-GPAI-PROVIDER-OBLIGATIONS-SATISFIED',
    name: 'Allow with controls when GPAI provider obligation evidence is established',
    phase: 'input',
    priority: 60,
    requirement_type: 'REGULATORY_OBLIGATION',
    application_date: EU_AI_ACT_APPLICATION_DATES.gpai,
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      gpai_provider: true,
      gpai_provider_obligations_satisfied: true,
      gpai_systemic_risk_gate_ok: true,
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['EU_AI_ACT_GPAI_PROVIDER_OBLIGATION_EVIDENCE_ESTABLISHED'],
    obligation_ids: ['EU-OBL-GPAI-PROVIDER'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },

  // --- Cross-cutting: insufficient actor/jurisdiction facts ---
  {
    rule_id: 'EU-AI-ACT-JURISDICTION-UNCERTAIN',
    name: 'Review when territorial application facts are not established',
    phase: 'input',
    priority: 120,
    requirement_type: 'REGULATORY_OBLIGATION',
    note: 'Does not assume EU user = Act applies or US org = Act does not apply.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      jurisdiction_facts_missing: true,
    },
    decision: 'REVIEW',
    reason_codes: ['EU_AI_ACT_TERRITORIAL_APPLICABILITY_UNCERTAIN'],
    obligation_ids: ['EU-OBL-ART1-SCOPE'],
    control_ids: ['ctrl_enigma_human_review'],
    enigma_obligations: ['REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION', 'LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },

  // --- Minimal / no-risk outside other families ---
  {
    rule_id: 'EU-AI-ACT-MINIMAL-RISK-ALLOW',
    name: 'Allow when declared minimal/no-risk and no other EU obligation gate fires',
    phase: 'input',
    priority: 30,
    requirement_type: 'REGULATORY_OBLIGATION',
    note: 'Explicit MINIMAL_OR_NO_RISK declaration with no prohibited/high-risk/GPAI/Art50 gates.',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
      minimal_or_no_risk: true,
      no_elevated_eu_gates: true,
    },
    decision: 'ALLOW',
    reason_codes: ['EU_AI_ACT_MINIMAL_OR_NO_RISK'],
    obligation_ids: ['EU-OBL-ART1-SCOPE'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },

  // --- Output complementary log ---
  {
    rule_id: 'EU-AI-ACT-OUTPUT-GOVERNANCE-LOG',
    name: 'Log governance event for EU AI Act-scoped output',
    phase: 'output',
    priority: 50,
    requirement_type: 'REGULATORY_OBLIGATION',
    conditions: {
      regulatory_applicability: 'EU_AI_ACT',
    },
    decision: 'ALLOW_WITH_CONTROLS',
    reason_codes: ['EU_AI_ACT_OUTPUT_GOVERNANCE_LOG'],
    obligation_ids: ['EU-OBL-ART12-RECORD-KEEPING'],
    control_ids: ['ctrl_audit_logging'],
    enigma_obligations: ['LOG_GOVERNANCE_EVENT'],
    sources: ['src_eu_ai_act_2024_1689'],
    derived_from: ['src_eu_ai_act_2024_1689'],
  },
];

export const EU_AI_ACT_PROVENANCE_GRAPH: PackProvenanceGraph = {
  sources: {
    src_eu_ai_act_2024_1689: {
      source_id: 'src_eu_ai_act_2024_1689',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      authority_type: 'REGULATION',
      legal_authority: true,
      authority_id: POLICY_AUTHORITY_IDS.euAiAct,
      title:
        'Regulation (EU) 2024/1689 of the European Parliament and of the Council (Artificial Intelligence Act)',
      publisher: 'European Parliament and Council of the European Union',
      citation: 'Regulation (EU) 2024/1689 (consolidated 2026-07-27)',
      canonical_url: 'https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng',
      effective_date: '2024-08-01',
      retrieved_date: null,
      version: '2024/1689 (incl. Regulation (EU) 2026/1744)',
      note: 'Official EUR-Lex consolidated text. Binding regulation — not an Enigma certification.',
    },
  },
  obligations: {
    'EU-OBL-ART1-SCOPE': {
      obligation_id: 'EU-OBL-ART1-SCOPE',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 1', 'Regulation (EU) 2024/1689 — Article 2'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART5-PROHIBITED': {
      obligation_id: 'EU-OBL-ART5-PROHIBITED',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 5'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART6-HIGH-RISK': {
      obligation_id: 'EU-OBL-ART6-HIGH-RISK',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 6'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART9-RISK-MANAGEMENT': {
      obligation_id: 'EU-OBL-ART9-RISK-MANAGEMENT',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 9'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART10-DATA-GOVERNANCE': {
      obligation_id: 'EU-OBL-ART10-DATA-GOVERNANCE',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 10'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART11-TECHNICAL-DOCUMENTATION': {
      obligation_id: 'EU-OBL-ART11-TECHNICAL-DOCUMENTATION',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 11'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART12-RECORD-KEEPING': {
      obligation_id: 'EU-OBL-ART12-RECORD-KEEPING',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 12'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART13-TRANSPARENCY': {
      obligation_id: 'EU-OBL-ART13-TRANSPARENCY',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 13'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART14-HUMAN-OVERSIGHT': {
      obligation_id: 'EU-OBL-ART14-HUMAN-OVERSIGHT',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 14'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART15-ACCURACY-ROBUSTNESS': {
      obligation_id: 'EU-OBL-ART15-ACCURACY-ROBUSTNESS',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 15'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART26-DEPLOYER': {
      obligation_id: 'EU-OBL-ART26-DEPLOYER',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 26'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-ART50-TRANSPARENCY': {
      obligation_id: 'EU-OBL-ART50-TRANSPARENCY',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: ['Regulation (EU) 2024/1689 — Article 50'],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-GPAI-PROVIDER': {
      obligation_id: 'EU-OBL-GPAI-PROVIDER',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: [
        'Regulation (EU) 2024/1689 — Article 51',
        'Regulation (EU) 2024/1689 — Article 53',
      ],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
    'EU-OBL-GPAI-SYSTEMIC-RISK': {
      obligation_id: 'EU-OBL-GPAI-SYSTEMIC-RISK',
      requirement_type: 'REGULATORY',
      authority: 'European Union Artificial Intelligence Act',
      authority_tier: 1,
      citations: [
        'Regulation (EU) 2024/1689 — Article 51',
        'Regulation (EU) 2024/1689 — Article 55',
      ],
      source_ids: ['src_eu_ai_act_2024_1689'],
    },
  },
};
