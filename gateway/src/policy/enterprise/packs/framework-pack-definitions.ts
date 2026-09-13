/**
 * Admin console definitions for framework / standard packs.
 * Conditions, Decisions, and Obligations are derived from compiled rule indexes.
 */

import type { PolicyDefinition } from './definitions.js';
import {
  derivePolicyDefinition,
  frameworkEvidenceProfile,
  type DerivableRule,
  type FrameworkPackProfile,
} from './derive-definition.js';
import {
  EU_AI_ACT_PACK_META,
  EU_AI_ACT_RULES,
} from './eu-ai-act/compiled-bundle.js';
import {
  ISO_23894_PACK_META,
  ISO_23894_RULES,
} from './iso-23894/compiled-bundle.js';
import {
  ISO_27001_PACK_META,
  ISO_27001_RULES,
} from './iso-27001/compiled-bundle.js';
import {
  ISO_27701_PACK_META,
  ISO_27701_RULES,
} from './iso-27701/compiled-bundle.js';
import {
  ISO_38507_PACK_META,
  ISO_38507_RULES,
} from './iso-38507/compiled-bundle.js';
import {
  ISO_42001_PACK_META,
  ISO_42001_RULES,
} from './iso-42001/compiled-bundle.js';
import {
  ISO_42005_PACK_META,
  ISO_42005_RULES,
} from './iso-42005/compiled-bundle.js';
import {
  NIST_AI_RMF_PACK_META,
  NIST_AI_RMF_RULES,
} from './nist-ai-rmf/compiled-bundle.js';
import {
  NIST_CSF_2_PACK_META,
  NIST_CSF_2_RULES,
} from './nist-csf-2/compiled-bundle.js';
import {
  NIST_PRIVACY_FRAMEWORK_PACK_META,
  NIST_PRIVACY_FRAMEWORK_RULES,
} from './nist-privacy-framework/compiled-bundle.js';
import {
  OWASP_LLM_2025_PACK_META,
  OWASP_LLM_2025_RULES,
} from './owasp-llm-2025/compiled-bundle.js';
import { SOC2_PACK_META, SOC2_RULES } from './soc2/compiled-bundle.js';

type PackDefSource = {
  meta: {
    pack_id: string;
    input_policy_id: string;
    output_policy_id: string;
    input_interpreter: string;
    output_interpreter: string;
  };
  rules: DerivableRule[];
  profile: FrameworkPackProfile;
};

function euAiActProfile(): FrameworkPackProfile {
  const base = frameworkEvidenceProfile({
    pack_id: EU_AI_ACT_PACK_META.pack_id,
    pack_name: 'EU AI ACT',
    scope_tier: 'regulatory',
    priority: 160,
    applicability_key: 'EU_AI_ACT',
    applicability_label: 'EU AI ACT',
    authority_note:
      'Legal authority under Regulation (EU) 2024/1689 — does not certify organizational compliance.',
    input_focus:
      'Applies phased EU AI ACT gates for prohibited practices, high-risk obligations, GPAI, and transparency.',
    output_focus:
      'Adds complementary EU AI ACT-scoped response logging and transparency monitoring.',
  });
  return {
    ...base,
    subjects: [
      {
        type: 'organization',
        match: 'regulatory_applicability includes EU_AI_ACT',
        description: 'Pack binds when EU AI ACT applicability is asserted for the request.',
      },
      {
        type: 'application',
        match: 'provider / deployer / GPAI context as asserted',
        description: 'Provider, deployer, and GPAI roles are evaluated from request evidence facts.',
      },
      {
        type: 'role',
        match: 'compliance reviewer (when REVIEW)',
        description: 'Uncertain applicability or missing obligation evidence yields human review.',
      },
    ],
    resources: [
      {
        type: 'ai_system',
        classification: 'EU_AI_ACT',
        description: 'AI system / practice under Art. 5, Annex III high-risk, GPAI, or Art. 50 scope.',
      },
      {
        type: 'prompt_content',
        classification: 'EU_AI_ACT',
        description: 'Input content evaluated against prohibited-practice and high-risk gates.',
      },
      {
        type: 'model_response',
        classification: 'EU_AI_ACT',
        description: 'Output path retains Art. 12-family record-keeping / transparency monitoring.',
      },
    ],
    ai_context: [
      {
        key: 'regulatory_applicability',
        constraint: 'EU_AI_ACT must be asserted for pack rules to bind',
      },
      {
        key: 'prohibited_practice / high_risk / gpai / art50 flags',
        constraint: 'Evidence gates drive DENY, REVIEW, or ALLOW_WITH_CONTROLS',
      },
      {
        key: 'application_date',
        constraint: 'Art. 113 phased dates gate when obligations are in force',
      },
      {
        key: 'requested_model',
        constraint: 'GPAI and transparency obligations may bind model identity facts',
      },
    ],
  };
}

const PACK_SOURCES: PackDefSource[] = [
  {
    meta: EU_AI_ACT_PACK_META,
    rules: EU_AI_ACT_RULES,
    profile: euAiActProfile(),
  },
  {
    meta: NIST_AI_RMF_PACK_META,
    rules: NIST_AI_RMF_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: NIST_AI_RMF_PACK_META.pack_id,
      pack_name: 'NIST AI RMF',
      priority: 145,
      applicability_key: 'NIST_AI_RMF',
      applicability_label: 'NIST AI RMF',
      authority_note:
        'FRAMEWORK guidance (NIST AI 100-1) — not a legal mandate or compliance certification.',
      input_focus:
        'Reviews GOVERN / MAP / MEASURE / MANAGE documentation evidence before allowing governed AI work.',
      output_focus:
        'Monitors NIST AI RMF-scoped responses and requires governance logging when the pack binds.',
    }),
  },
  {
    meta: OWASP_LLM_2025_PACK_META,
    rules: OWASP_LLM_2025_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: OWASP_LLM_2025_PACK_META.pack_id,
      pack_name: 'OWASP LLM Top 10 2025',
      priority: 150,
      applicability_key: 'OWASP_LLM_2025',
      applicability_label: 'OWASP LLM Top 10',
      authority_note:
        'Security guidance pack — derived controls, not a legal compliance claim.',
      input_focus:
        'Applies OWASP LLM Top 10 2025-informed input gates for prompt, agent, and tool risk patterns.',
      output_focus:
        'Applies OWASP LLM Top 10 2025-informed output gates for unsafe or sensitive model responses.',
    }),
  },
  {
    meta: ISO_42001_PACK_META,
    rules: ISO_42001_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: ISO_42001_PACK_META.pack_id,
      pack_name: 'ISO/IEC 42001',
      priority: 142,
      applicability_key: 'ISO_42001',
      applicability_label: 'ISO/IEC 42001',
      authority_note:
        'Management-system standard guidance — not an Enigma certification of ISO conformity.',
      input_focus:
        'Reviews AI management system evidence expected by ISO/IEC 42001 before continuing governed work.',
      output_focus:
        'Adds ISO/IEC 42001-scoped output monitoring and governance logging.',
    }),
  },
  {
    meta: ISO_23894_PACK_META,
    rules: ISO_23894_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: ISO_23894_PACK_META.pack_id,
      pack_name: 'ISO/IEC 23894',
      priority: 141,
      applicability_key: 'ISO_23894',
      applicability_label: 'ISO/IEC 23894',
      authority_note:
        'AI risk-management guidance — not a legal mandate or conformity certification.',
      input_focus:
        'Reviews ISO/IEC 23894 risk-management evidence (context, analysis, treatment, residual risk).',
      output_focus:
        'Adds ISO/IEC 23894-scoped output monitoring for risk-management continuity.',
    }),
  },
  {
    meta: ISO_42005_PACK_META,
    rules: ISO_42005_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: ISO_42005_PACK_META.pack_id,
      pack_name: 'ISO/IEC 42005',
      priority: 140,
      applicability_key: 'ISO_42005',
      applicability_label: 'ISO/IEC 42005',
      authority_note:
        'AI system impact assessment guidance — not an Enigma certification claim.',
      input_focus:
        'Reviews ISO/IEC 42005 impact-assessment evidence before allowing governed AI work.',
      output_focus:
        'Adds ISO/IEC 42005-scoped output monitoring and governance logging.',
    }),
  },
  {
    meta: SOC2_PACK_META,
    rules: SOC2_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: SOC2_PACK_META.pack_id,
      pack_name: 'SOC 2',
      priority: 138,
      applicability_key: 'SOC2',
      applicability_label: 'SOC 2',
      authority_note:
        'Trust Services Criteria-informed controls — not an AICPA attestation or audit opinion.',
      input_focus:
        'Reviews SOC 2-relevant control evidence for confidentiality, availability, and processing integrity.',
      output_focus:
        'Adds SOC 2-scoped output monitoring and governance logging.',
    }),
  },
  {
    meta: NIST_CSF_2_PACK_META,
    rules: NIST_CSF_2_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: NIST_CSF_2_PACK_META.pack_id,
      pack_name: 'NIST CSF 2.0',
      priority: 137,
      applicability_key: 'NIST_CSF_2',
      applicability_label: 'NIST CSF 2.0',
      authority_note:
        'Cybersecurity framework guidance — not a legal compliance certification.',
      input_focus:
        'Reviews NIST CSF 2.0 function/category evidence before continuing governed AI work.',
      output_focus:
        'Adds NIST CSF 2.0-scoped output monitoring and governance logging.',
    }),
  },
  {
    meta: ISO_38507_PACK_META,
    rules: ISO_38507_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: ISO_38507_PACK_META.pack_id,
      pack_name: 'ISO/IEC 38507',
      priority: 136,
      applicability_key: 'ISO_38507',
      applicability_label: 'ISO/IEC 38507',
      authority_note:
        'Governance of AI for organizations — guidance, not an Enigma conformity claim.',
      input_focus:
        'Reviews ISO/IEC 38507 organizational AI governance evidence gates.',
      output_focus:
        'Adds ISO/IEC 38507-scoped output monitoring and governance logging.',
    }),
  },
  {
    meta: ISO_27001_PACK_META,
    rules: ISO_27001_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: ISO_27001_PACK_META.pack_id,
      pack_name: 'ISO/IEC 27001',
      priority: 135,
      applicability_key: 'ISO_27001',
      applicability_label: 'ISO/IEC 27001',
      authority_note:
        'Information-security management guidance — not an ISO certification.',
      input_focus:
        'Reviews ISO/IEC 27001 ISMS / control evidence relevant to AI processing paths.',
      output_focus:
        'Adds ISO/IEC 27001-scoped output monitoring and governance logging.',
    }),
  },
  {
    meta: ISO_27701_PACK_META,
    rules: ISO_27701_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: ISO_27701_PACK_META.pack_id,
      pack_name: 'ISO/IEC 27701',
      priority: 134,
      applicability_key: 'ISO_27701',
      applicability_label: 'ISO/IEC 27701',
      authority_note:
        'Privacy information management guidance — not an Enigma conformity certification.',
      input_focus:
        'Reviews ISO/IEC 27701 privacy-management evidence for AI processing of personal data.',
      output_focus:
        'Adds ISO/IEC 27701-scoped output monitoring and governance logging.',
    }),
  },
  {
    meta: NIST_PRIVACY_FRAMEWORK_PACK_META,
    rules: NIST_PRIVACY_FRAMEWORK_RULES,
    profile: frameworkEvidenceProfile({
      pack_id: NIST_PRIVACY_FRAMEWORK_PACK_META.pack_id,
      pack_name: 'NIST Privacy Framework',
      priority: 133,
      applicability_key: 'NIST_PRIVACY_FRAMEWORK',
      applicability_label: 'NIST Privacy Framework',
      authority_note:
        'Privacy framework guidance — not a legal mandate or compliance certification.',
      input_focus:
        'Reviews NIST Privacy Framework evidence (Identify-P / Govern-P / Control-P / Communicate-P / Protect-P).',
      output_focus:
        'Adds NIST Privacy Framework-scoped output monitoring and governance logging.',
    }),
  },
];

const BY_POLICY_ID: Record<string, PolicyDefinition> = {};
const BY_INTERPRETER: Record<string, PolicyDefinition> = {};

for (const source of PACK_SOURCES) {
  const inputDef = derivePolicyDefinition({
    phase: 'input',
    profile: source.profile,
    rules: source.rules,
  });
  const outputDef = derivePolicyDefinition({
    phase: 'output',
    profile: source.profile,
    rules: source.rules,
  });
  BY_POLICY_ID[source.meta.input_policy_id] = inputDef;
  BY_POLICY_ID[source.meta.output_policy_id] = outputDef;
  BY_INTERPRETER[source.meta.input_interpreter] = inputDef;
  BY_INTERPRETER[source.meta.output_interpreter] = outputDef;
}

export function getFrameworkPackDefinition(
  policyId: string,
  interpreter?: string,
): PolicyDefinition | null {
  if (BY_POLICY_ID[policyId]) return BY_POLICY_ID[policyId];
  if (interpreter && BY_INTERPRETER[interpreter]) return BY_INTERPRETER[interpreter];
  return null;
}

/** Test helper — all framework policy IDs with derived definitions. */
export function listFrameworkDefinitionPolicyIds(): string[] {
  return Object.keys(BY_POLICY_ID).sort();
}
