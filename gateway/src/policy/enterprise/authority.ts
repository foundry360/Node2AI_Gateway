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
  nistAiRmf: 'auth_nist_ai_rmf',
  owaspLlm2025: 'auth_owasp_llm_2025',
  iso42001: 'auth_iso_42001',
  iso23894: 'auth_iso_23894',
  iso42005: 'auth_iso_42005',
  euAiAct: 'auth_eu_ai_act',
} as const;

/** Pack → governing PolicyAuthority (catalog link; not evaluation precedence). */
const PACK_AUTHORITY_BY_PACK_ID: Record<string, string> = {
  pack_hipaa: POLICY_AUTHORITY_IDS.hipaa,
  pack_42_cfr_part_2: POLICY_AUTHORITY_IDS.part2,
  pack_nist_ai_rmf: POLICY_AUTHORITY_IDS.nistAiRmf,
  pack_owasp_llm_2025: POLICY_AUTHORITY_IDS.owaspLlm2025,
  pack_eu_ai_act: POLICY_AUTHORITY_IDS.euAiAct,
  pack_iso_42001: POLICY_AUTHORITY_IDS.iso42001,
  pack_iso_23894: POLICY_AUTHORITY_IDS.iso23894,
  pack_iso_42005: POLICY_AUTHORITY_IDS.iso42005,
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
