/**
 * Generic policy domain model.
 * A domain is a governance area (e.g. healthcare), not a policy pack.
 * Packs (HIPAA, future HITECH, …) register under a domain via membership.
 */

export type PolicyDomainStatus = 'active' | 'draft' | 'retired';

export interface PolicyDomain {
  domain_id: string;
  name: string;
  description: string;
  status: PolicyDomainStatus;
  /**
   * Packs that belong to this domain.
   * Membership only — does not load or execute pack content.
   */
  pack_ids: string[];
}

/** Healthcare regulatory governance domain. HIPAA #1; Part 2 #2; ONC HTI-1 #3; CMS #4. */
export const HEALTHCARE_DOMAIN: PolicyDomain = {
  domain_id: 'healthcare',
  name: 'Healthcare',
  description:
    'Healthcare regulatory governance domain. Contains versioned regulatory policy packs (HIPAA Pack #1, 42 CFR Part 2 Pack #2, ONC HTI-1 Pack #3, CMS Pack #4). Not itself a policy pack or compliance checklist.',
  status: 'active',
  pack_ids: ['pack_hipaa', 'pack_42_cfr_part_2', 'pack_onc_hti1', 'pack_cms'],
};

/** Cross-cutting AI risk / AI governance domain. Packs #3–#12 register here. */
export const AI_RISK_DOMAIN: PolicyDomain = {
  domain_id: 'ai_risk',
  name: 'AI Risk',
  description:
    'AI governance domain for framework, security-guidance, and standards packs (NIST AI RMF, OWASP LLM 2025, EU AI Act, ISO/IEC 42001 / 23894 / 42005 / 38507 / 27001 / 27701, NIST Privacy Framework 1.0, SOC 2 / AICPA TSC, NIST CSF 2.0). Membership only — not a certification checklist or scoring product.',
  status: 'active',
  pack_ids: ['pack_nist_ai_rmf'],
};

const DOMAIN_REGISTRY = new Map<string, PolicyDomain>([
  [HEALTHCARE_DOMAIN.domain_id, HEALTHCARE_DOMAIN],
  [AI_RISK_DOMAIN.domain_id, AI_RISK_DOMAIN],
]);

export function getPolicyDomain(domainId: string): PolicyDomain | undefined {
  return DOMAIN_REGISTRY.get(domainId);
}

export function listPolicyDomains(): PolicyDomain[] {
  return [...DOMAIN_REGISTRY.values()];
}

/** Register or replace a domain definition (generic — used by tests and future domains). */
export function registerPolicyDomain(domain: PolicyDomain): void {
  DOMAIN_REGISTRY.set(domain.domain_id, {
    ...domain,
    pack_ids: [...domain.pack_ids],
  });
}

/** Associate a pack with a domain without duplicating pack content. */
export function addPackToDomain(domainId: string, packId: string): PolicyDomain | undefined {
  const domain = DOMAIN_REGISTRY.get(domainId);
  if (!domain) return undefined;
  if (!domain.pack_ids.includes(packId)) {
    domain.pack_ids = [...domain.pack_ids, packId];
  }
  return domain;
}

export function listDomainPackIds(domainId: string): string[] {
  return [...(DOMAIN_REGISTRY.get(domainId)?.pack_ids ?? [])];
}

/**
 * Cross-pack resolution concepts (architecture contract — not automatic winners).
 * Precedence is metadata-driven; do not assume "newer wins" or "most restrictive wins"
 * unless pack/domain policy explicitly declares it.
 */
export type CrossPackResolutionMode =
  | 'pack_declared_precedence'
  | 'deny_unresolved'
  | 'compose_restrictive'
  | 'manual_review';

export interface CrossPackInteraction {
  pack_a: string;
  pack_b: string;
  interaction: 'conflict' | 'reinforcement' | 'independent' | 'exception';
  resolution?: CrossPackResolutionMode;
  detail?: string;
}
