/**
 * Policy Authority — normalized origin of governance requirements.
 *
 * Authority explains WHERE a policy comes from.
 * Decision (policy_evaluations) remains WHAT Enigma decided.
 *
 * Distinct concepts (do not collapse):
 * - PolicyAuthorityType — REGULATION | STANDARD | FRAMEWORK | SECURITY_GUIDANCE
 * - authority_tier — evidentiary / normative rank (1–6), not runtime applicability
 * - legal_authority — whether the source may ground legal/regulatory DENY alone
 * - PackPolicyMeta.precedence — explicit multi-pack precedence (never inferred here)
 *
 * Evaluators MUST NOT branch on PolicyAuthorityType for decisions.
 */

export const POLICY_AUTHORITY_TYPES = [
  'REGULATION',
  'STANDARD',
  'FRAMEWORK',
  'SECURITY_GUIDANCE',
] as const;

export type PolicyAuthorityType = (typeof POLICY_AUTHORITY_TYPES)[number];

export interface PolicyAuthorityProvenanceMeta {
  /**
   * Whether this authority may serve as legal/regulatory grounds for DENY.
   * Independent of PolicyAuthorityType — FRAMEWORK/SECURITY_GUIDANCE are never
   * legal authority by themselves; REGULATION usually is, but callers must set
   * this explicitly rather than inferring from type.
   */
  legal_authority: boolean;
  notes?: string;
}

/**
 * Platform catalog entry for a governing authority / source of policy.
 * Packs reference this via authority_id; citations remain precise source material.
 */
export interface PolicyAuthority {
  id: string;
  name: string;
  type: PolicyAuthorityType;
  publisher: string;
  jurisdiction: string | null;
  /** Evidentiary / normative tier (1 = primary law … 6 = secondary). Not applicability. */
  authority_tier: number;
  version: string | null;
  effective_date: string | null;
  source_reference: string;
  provenance: PolicyAuthorityProvenanceMeta;
}

/** Stable authority ids for shipped packs and catalog placeholders. */
export const POLICY_AUTHORITY_IDS = {
  hipaa: 'auth_hipaa',
  part2: 'auth_42_cfr_part_2',
  oncHti1: 'auth_onc_hti1',
  nistAiRmf: 'auth_nist_ai_rmf',
  owaspLlm2025: 'auth_owasp_llm_2025',
  iso42001: 'auth_iso_42001',
  iso23894: 'auth_iso_23894',
  iso42005: 'auth_iso_42005',
  soc2: 'auth_soc2',
  nistCsf2: 'auth_nist_csf_2',
  iso38507: 'auth_iso_38507',
  iso27001: 'auth_iso_27001',
  iso27701: 'auth_iso_27701',
  nistPrivacyFramework: 'auth_nist_privacy_framework',
  euAiAct: 'auth_eu_ai_act',
} as const;

/** Pack → governing PolicyAuthority (catalog link; not evaluation precedence). */
const PACK_AUTHORITY_BY_PACK_ID: Record<string, string> = {
  pack_hipaa: POLICY_AUTHORITY_IDS.hipaa,
  pack_42_cfr_part_2: POLICY_AUTHORITY_IDS.part2,
  pack_onc_hti1: POLICY_AUTHORITY_IDS.oncHti1,
  pack_nist_ai_rmf: POLICY_AUTHORITY_IDS.nistAiRmf,
  pack_owasp_llm_2025: POLICY_AUTHORITY_IDS.owaspLlm2025,
  pack_eu_ai_act: POLICY_AUTHORITY_IDS.euAiAct,
  pack_iso_42001: POLICY_AUTHORITY_IDS.iso42001,
  pack_iso_23894: POLICY_AUTHORITY_IDS.iso23894,
  pack_iso_42005: POLICY_AUTHORITY_IDS.iso42005,
  pack_soc2: POLICY_AUTHORITY_IDS.soc2,
  pack_nist_csf_2: POLICY_AUTHORITY_IDS.nistCsf2,
  pack_iso_38507: POLICY_AUTHORITY_IDS.iso38507,
  pack_iso_27001: POLICY_AUTHORITY_IDS.iso27001,
  pack_iso_27701: POLICY_AUTHORITY_IDS.iso27701,
  pack_nist_privacy_framework: POLICY_AUTHORITY_IDS.nistPrivacyFramework,
};

const registry = new Map<string, PolicyAuthority>();

export function isPolicyAuthorityType(value: unknown): value is PolicyAuthorityType {
  return (
    typeof value === 'string' &&
    (POLICY_AUTHORITY_TYPES as readonly string[]).includes(value)
  );
}

export function registerPolicyAuthority(authority: PolicyAuthority): PolicyAuthority {
  if (!isPolicyAuthorityType(authority.type)) {
    throw new Error(`Invalid PolicyAuthorityType: ${String(authority.type)}`);
  }
  if (!Number.isFinite(authority.authority_tier) || authority.authority_tier < 1) {
    throw new Error(`Invalid authority_tier for ${authority.id}`);
  }
  registry.set(authority.id, authority);
  return authority;
}

export function getPolicyAuthority(id: string): PolicyAuthority | undefined {
  return registry.get(id);
}

export function listPolicyAuthorities(): PolicyAuthority[] {
  return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function listPolicyAuthoritiesByType(type: PolicyAuthorityType): PolicyAuthority[] {
  return listPolicyAuthorities().filter((a) => a.type === type);
}

/** Resolve governing authority for a pack from the catalog map (optional). */
export function getAuthorityIdForPack(packId: string): string | undefined {
  return PACK_AUTHORITY_BY_PACK_ID[packId];
}

export function getAuthorityForPack(packId: string): PolicyAuthority | undefined {
  const id = getAuthorityIdForPack(packId);
  return id ? getPolicyAuthority(id) : undefined;
}

/**
 * Legal / regulatory grounding for DENY — uses explicit provenance flag.
 * Does NOT infer from type alone (FRAMEWORK ≠ optional, REGULATION ≠ auto-applicable).
 */
export function treatsAsLegalAuthority(authority: PolicyAuthority): boolean {
  return authority.provenance.legal_authority === true;
}

/** Catalog helpers — types are orthogonal to tier. */
export function assertAuthorityTypeAndTierIndependent(
  authority: PolicyAuthority,
): { type: PolicyAuthorityType; authority_tier: number } {
  return { type: authority.type, authority_tier: authority.authority_tier };
}

function defineBuiltIns(): void {
  if (registry.size > 0) return;

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.hipaa,
    name: 'HIPAA',
    type: 'REGULATION',
    publisher: 'U.S. Department of Health and Human Services',
    jurisdiction: 'US',
    authority_tier: 1,
    version: null,
    effective_date: null,
    source_reference: '45 CFR Parts 160 and 164',
    provenance: {
      legal_authority: true,
      notes: 'Primary U.S. health privacy/security regulation for PHI.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.part2,
    name: '42 CFR Part 2',
    type: 'REGULATION',
    publisher: 'U.S. Department of Health and Human Services',
    jurisdiction: 'US',
    authority_tier: 1,
    version: null,
    effective_date: null,
    source_reference: '42 CFR Part 2',
    provenance: {
      legal_authority: true,
      notes: 'Confidentiality of Substance Use Disorder Patient Records.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.oncHti1,
    name: 'ONC HTI-1',
    type: 'REGULATION',
    publisher: 'Office of the National Coordinator for Health Information Technology',
    jurisdiction: 'US',
    authority_tier: 2,
    version: null,
    effective_date: null,
    source_reference: '89 FR 1192 (HTI-1 Final Rule) — Predictive DSI / algorithm transparency',
    provenance: {
      legal_authority: true,
      notes:
        'ONC Health IT Certification Program updates including predictive decision support / algorithm transparency (FAVES). Enigma operationalizes selected concepts at runtime; not a certification determination.',
    },
  });

  // Catalog placeholders for future packs — not wired into evaluation or packs.
  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.nistAiRmf,
    name: 'NIST AI Risk Management Framework',
    type: 'FRAMEWORK',
    publisher: 'National Institute of Standards and Technology',
    jurisdiction: null,
    authority_tier: 4,
    version: '1.0',
    effective_date: null,
    source_reference: 'NIST AI RMF 1.0',
    provenance: {
      legal_authority: false,
      notes: 'Implementation guidance — not legal/regulatory authority.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.owaspLlm2025,
    name: 'OWASP Top 10 for LLM Applications 2025',
    type: 'SECURITY_GUIDANCE',
    publisher: 'OWASP Foundation / OWASP GenAI Security Project',
    jurisdiction: null,
    authority_tier: 4,
    version: '2025',
    effective_date: '2024-11-01',
    source_reference:
      'OWASP Top 10 for LLM Applications 2025 — https://genai.owasp.org/llm-top-10/',
    provenance: {
      legal_authority: false,
      notes:
        'Security guidance for LLM applications — not legal/regulatory authority; not a certification.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.iso42001,
    name: 'ISO/IEC 42001:2023',
    type: 'STANDARD',
    publisher:
      'International Organization for Standardization / International Electrotechnical Commission',
    jurisdiction: 'INTERNATIONAL',
    authority_tier: 3,
    version: '2023',
    effective_date: '2023-12-18',
    source_reference: 'https://www.iso.org/standard/42001',
    provenance: {
      legal_authority: false,
      notes:
        'AI management-system standard — not statute or regulation; not an Enigma certification.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.iso23894,
    name: 'ISO/IEC 23894:2023',
    type: 'STANDARD',
    publisher: 'ISO / IEC',
    jurisdiction: 'INTERNATIONAL',
    authority_tier: 3,
    version: '2023',
    effective_date: '2023-02-06',
    source_reference: 'https://www.iso.org/standard/77304.html',
    provenance: {
      legal_authority: false,
      notes:
        'AI risk-management guidance — not statute or regulation; not an Enigma certification or risk score.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.iso42005,
    name: 'ISO/IEC 42005:2025',
    type: 'STANDARD',
    publisher: 'ISO / IEC',
    jurisdiction: 'INTERNATIONAL',
    authority_tier: 3,
    version: '2025',
    effective_date: '2025-05-28',
    source_reference: 'https://www.iso.org/standard/42005',
    provenance: {
      legal_authority: false,
      notes:
        'AI system impact-assessment guidance — not statute or regulation; not an Enigma certification or impact score.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.soc2,
    name: 'AICPA Trust Services Criteria (SOC 2)',
    type: 'FRAMEWORK',
    publisher: 'AICPA (Assurance Services Executive Committee)',
    jurisdiction: null,
    authority_tier: 4,
    version: '2017 TSC (Revised Points of Focus — 2022)',
    effective_date: '2022-01-01',
    source_reference:
      'TSP Section 100 — 2017 Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy (With Revised Points of Focus — 2022) — https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022',
    provenance: {
      legal_authority: false,
      notes:
        'SOC 2-informed enterprise assurance framework — not statute, regulation, certification, or an Enigma audit opinion.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.nistCsf2,
    name: 'NIST Cybersecurity Framework (CSF) 2.0',
    type: 'FRAMEWORK',
    publisher: 'National Institute of Standards and Technology',
    jurisdiction: null,
    authority_tier: 4,
    version: '2.0',
    effective_date: '2024-02-26',
    source_reference:
      'NIST CSWP 29 — The NIST Cybersecurity Framework (CSF) 2.0 — https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20',
    provenance: {
      legal_authority: false,
      notes:
        'NIST CSF 2.0-informed cybersecurity governance framework — not statute, regulation, certification, or an Enigma cybersecurity assessment.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.iso38507,
    name: 'ISO/IEC 38507:2022',
    type: 'STANDARD',
    publisher:
      'International Organization for Standardization / International Electrotechnical Commission',
    jurisdiction: 'INTERNATIONAL',
    authority_tier: 3,
    version: '2022',
    effective_date: '2022-04-08',
    source_reference:
      'ISO/IEC 38507:2022 — Information technology — Governance of IT — Governance implications of the use of artificial intelligence by organizations — https://www.iso.org/standard/56641.html',
    provenance: {
      legal_authority: false,
      notes:
        'ISO/IEC 38507-informed organizational AI governance guidance — not statute, regulation, certification, board-governance software, or an Enigma organizational assessment.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.iso27001,
    name: 'ISO/IEC 27001:2022',
    type: 'STANDARD',
    publisher:
      'International Organization for Standardization / International Electrotechnical Commission',
    jurisdiction: 'INTERNATIONAL',
    authority_tier: 3,
    version: '2022',
    effective_date: '2022-10-25',
    source_reference:
      'ISO/IEC 27001:2022 — Information security, cybersecurity and privacy protection — Information security management systems — Requirements — https://www.iso.org/standard/27001',
    provenance: {
      legal_authority: false,
      notes:
        'ISO/IEC 27001-informed ISMS / information-security governance standard — not statute, regulation, certification, SIEM, Annex A score, or an Enigma security assessment. Includes recognition of ISO/IEC 27001:2022/Amd 1:2024 (climate action changes) as amendment context only.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.iso27701,
    name: 'ISO/IEC 27701:2025',
    type: 'STANDARD',
    publisher:
      'International Organization for Standardization / International Electrotechnical Commission',
    jurisdiction: 'INTERNATIONAL',
    authority_tier: 3,
    version: '2025',
    effective_date: '2025-10-14',
    source_reference:
      'ISO/IEC 27701:2025 — Information security, cybersecurity and privacy protection — Privacy information management systems — Requirements and guidance — https://www.iso.org/standard/27701',
    provenance: {
      legal_authority: false,
      notes:
        'ISO/IEC 27701-informed PIMS / privacy-information-management standard — not statute, regulation, GDPR determination, certification, DSAR workflow, DPIA app, privacy score, or an Enigma privacy assessment. ISO/IEC 27701:2019 is withdrawn; this authority reflects the 2025 edition.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.nistPrivacyFramework,
    name: 'NIST Privacy Framework 1.0',
    type: 'FRAMEWORK',
    publisher: 'National Institute of Standards and Technology',
    jurisdiction: null,
    authority_tier: 4,
    version: '1.0',
    effective_date: '2020-01-16',
    source_reference:
      'NIST Privacy Framework: A Tool for Improving Privacy through Enterprise Risk Management, Version 1.0 (NIST CSWP 10) — https://csrc.nist.gov/pubs/cswp/10/nist-privacy-framework-version-10/final',
    provenance: {
      legal_authority: false,
      notes:
        'Voluntary NIST Privacy Framework-informed privacy-risk management guidance — not statute, regulation, certification, GDPR/HIPAA determination, DSAR/DPIA workflow, privacy score, or an Enigma privacy assessment. NIST PF 1.1 draft is not authoritative for this pack.',
    },
  });

  registerPolicyAuthority({
    id: POLICY_AUTHORITY_IDS.euAiAct,
    name: 'European Union Artificial Intelligence Act',
    type: 'REGULATION',
    publisher: 'European Parliament and Council of the European Union',
    jurisdiction: 'EU',
    authority_tier: 1,
    version: '2024/1689',
    effective_date: '2024-08-01',
    source_reference:
      'Regulation (EU) 2024/1689 (consolidated, incl. Regulation (EU) 2026/1744) — https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng',
    provenance: {
      legal_authority: true,
      notes:
        'Binding EU regulation. Application dates vary by provision (Art. 113). Not an Enigma compliance certification.',
    },
  });
}

defineBuiltIns();

/** Test helper — clear and re-seed built-ins. */
export function resetPolicyAuthorityRegistryForTests(): void {
  registry.clear();
  defineBuiltIns();
}
