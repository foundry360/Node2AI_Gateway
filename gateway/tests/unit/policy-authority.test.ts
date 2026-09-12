import { describe, expect, it } from 'vitest';
import {
  HIPAA_PROVENANCE_GRAPH,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  PART2_PROVENANCE_GRAPH,
  POLICY_AUTHORITY_IDS,
  POLICY_AUTHORITY_TYPES,
  assertAuthorityTypeAndTierIndependent,
  getAuthorityForPack,
  getAuthorityIdForPack,
  getPolicyAuthority,
  hipaaPackContribution,
  isPolicyAuthorityType,
  listPolicyAuthorities,
  listPolicyAuthoritiesByType,
  part2PackContribution,
  resolveMatchedRuleProvenance,
  resolvePackContributions,
  treatsAsLegalAuthority,
  type PackEvaluationContribution,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

describe('PolicyAuthority architecture', () => {
  it('represents every PolicyAuthorityType', () => {
    for (const type of POLICY_AUTHORITY_TYPES) {
      expect(isPolicyAuthorityType(type)).toBe(true);
      expect(listPolicyAuthoritiesByType(type).length).toBeGreaterThan(0);
    }
  });

  it('keeps authority type distinct from authority tier', () => {
    const hipaa = getPolicyAuthority(POLICY_AUTHORITY_IDS.hipaa)!;
    const nist = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistAiRmf)!;
    const owasp = getPolicyAuthority(POLICY_AUTHORITY_IDS.owaspLlm2025)!;
    const iso = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso42001)!;

    expect(assertAuthorityTypeAndTierIndependent(hipaa)).toEqual({
      type: 'REGULATION',
      authority_tier: 1,
    });
    expect(assertAuthorityTypeAndTierIndependent(nist)).toEqual({
      type: 'FRAMEWORK',
      authority_tier: 4,
    });
    // Same tier family can host different types — type is not derived from tier.
    expect(nist.authority_tier).toBe(owasp.authority_tier);
    expect(nist.type).not.toBe(owasp.type);
    expect(iso.type).toBe('STANDARD');
    expect(iso.authority_tier).not.toBe(hipaa.authority_tier);
  });

  it('lets a PolicyPack reference a PolicyAuthority', () => {
    expect(getAuthorityIdForPack('pack_hipaa')).toBe(POLICY_AUTHORITY_IDS.hipaa);
    expect(getAuthorityIdForPack('pack_42_cfr_part_2')).toBe(POLICY_AUTHORITY_IDS.part2);

    const hipaaPack = hipaaPackContribution().packs[0]!;
    const part2Pack = part2PackContribution().packs[0]!;
    expect(hipaaPack.authority_id).toBe(POLICY_AUTHORITY_IDS.hipaa);
    expect(part2Pack.authority_id).toBe(POLICY_AUTHORITY_IDS.part2);

    const snap = new InMemoryPolicyRepository().getSnapshot();
    const fromSnap = snap.packs.find((p) => p.pack_id === 'pack_hipaa');
    expect(fromSnap?.authority_id).toBe(POLICY_AUTHORITY_IDS.hipaa);
    expect(getAuthorityForPack('pack_hipaa')?.name).toBe('HIPAA');
  });

  it('resolves HIPAA pack through the authority model with intact provenance', () => {
    const auth = getAuthorityForPack('pack_hipaa')!;
    expect(auth.type).toBe('REGULATION');
    expect(treatsAsLegalAuthority(auth)).toBe(true);

    const src = HIPAA_PROVENANCE_GRAPH.sources.src_45cfr164!;
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.hipaa);
    expect(src.legal_authority).toBe(true);
    expect(src.authority_tier).toBe(1);

    const matched = resolveMatchedRuleProvenance(
      {
        rule_id: 'r_hipaa_phi_protection',
        obligation_ids: ['HIPAA-OBL-PHI-PROTECTION'],
      },
      HIPAA_PROVENANCE_GRAPH,
    );
    expect(matched.citations).toEqual(
      expect.arrayContaining(['45 CFR 164.306', '45 CFR 164.530']),
    );
    expect(matched.authority_tier).toBe(1);
    expect(matched.legal_authority).toBe(true);
  });

  it('resolves 42 CFR Part 2 through the authority model with intact citations', () => {
    const auth = getAuthorityForPack('pack_42_cfr_part_2')!;
    expect(auth.type).toBe('REGULATION');
    expect(auth.source_reference).toBe('42 CFR Part 2');
    expect(treatsAsLegalAuthority(auth)).toBe(true);

    const src = PART2_PROVENANCE_GRAPH.sources.src_42cfr2!;
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.part2);

    const matched = resolveMatchedRuleProvenance(
      {
        rule_id: 'r_part2_confidentiality',
        obligation_ids: ['PART2-OBL-CONFIDENTIALITY'],
      },
      PART2_PROVENANCE_GRAPH,
    );
    expect(matched.citations.length).toBeGreaterThan(0);
    expect(matched.citations.every((c) => c.includes('42 CFR'))).toBe(true);
  });

  it('represents NIST as FRAMEWORK without legal authority', () => {
    const nist = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistAiRmf)!;
    expect(nist.type).toBe('FRAMEWORK');
    expect(treatsAsLegalAuthority(nist)).toBe(false);
    expect(nist.provenance.legal_authority).toBe(false);
  });

  it('represents OWASP as SECURITY_GUIDANCE without legal authority', () => {
    const owasp = getPolicyAuthority(POLICY_AUTHORITY_IDS.owaspLlm2025)!;
    expect(owasp.type).toBe('SECURITY_GUIDANCE');
    expect(owasp.version).toBe('2025');
    expect(treatsAsLegalAuthority(owasp)).toBe(false);
  });

  it('does not use PolicyAuthority type as multi-pack precedence', () => {
    const contributions: PackEvaluationContribution[] = [
      {
        pack_id: 'pack_hipaa',
        pack_name: 'HIPAA',
        pack_version: '3.1.0',
        policy_id: 'pol_hipaa_phi_local',
        policy_name: 'HIPAA PHI input governance',
        policy_version: 3,
        decision: 'ALLOW',
        reason_codes: ['HIPAA_ALLOW'],
        eligible_models: ['local-general-v1'],
        transforms: [],
        obligations: [],
        controls: [],
        applicable: true,
        matched: ['hipaa'],
        rule_ids: ['r1'],
        obligation_ids: [],
      },
      {
        pack_id: 'pack_42_cfr_part_2',
        pack_name: '42 CFR Part 2',
        pack_version: '1.0.0',
        policy_id: 'pol_part2_sud_records',
        policy_name: 'Part 2 SUD record input governance',
        policy_version: 1,
        decision: 'DENY',
        reason_codes: ['PART2_DENY'],
        eligible_models: [],
        transforms: [],
        obligations: [{ code: 'LOCAL_MODEL_ONLY' }],
        controls: [],
        applicable: true,
        matched: ['part2'],
        rule_ids: ['r2'],
        obligation_ids: ['PART2-OBL-CONFIDENTIALITY'],
      },
    ];

    const resolved = resolvePackContributions(contributions);
    // Same REGULATION type must not invent precedence — unresolved → REVIEW.
    expect(resolved.resolution.category).toBe('RESTRICTIVE');
    expect(resolved.decision).toBe('DENY');
    expect(resolved.reason_codes).toContain('RESOLUTION_CONSEQUENCE_DENY');
    expect(getAuthorityForPack('pack_hipaa')!.type).toBe('REGULATION');
    expect(getAuthorityForPack('pack_42_cfr_part_2')!.type).toBe('REGULATION');
  });

  it('preserves HIPAA evaluation decision path with authority metadata present', async () => {
    const clinician: User = {
      user_id: 'u1',
      organization_id: 'o1',
      roles: ['clinician'],
      permissions: [],
      status: 'active',
    };
    const clinicalApp: Application = {
      application_id: 'a1',
      organization_id: 'o1',
      name: 'App',
      type: 'clinical',
      environment: 'prod',
      status: 'active',
      trust_level: 'trusted',
      allowed_models: ['local-general-v1', 'cloud-public-gpt'],
      allowed_datasets: [],
      allowed_operations: ['summarize', 'write'],
    };
    const pdp = new PackBackedEnterprisePdp(new InMemoryPolicyRepository());
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });

    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toEqual(
      expect.arrayContaining(['HIPAA_PHI_WRITE_REQUIRES_APPROVAL']),
    );
    expect(decision.explanation.provenance?.matched_rules?.length).toBeGreaterThan(0);
    expect(
      decision.explanation.provenance?.sources?.some(
        (s) => s.authority_id === POLICY_AUTHORITY_IDS.hipaa,
      ),
    ).toBe(true);
    expect(getAuthorityForPack('pack_hipaa')?.type).toBe('REGULATION');
  });

  it('lists catalog authorities; NIST CSF 2 pack linked as Pack #10', () => {
    const ids = listPolicyAuthorities().map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        POLICY_AUTHORITY_IDS.hipaa,
        POLICY_AUTHORITY_IDS.part2,
        POLICY_AUTHORITY_IDS.nistAiRmf,
        POLICY_AUTHORITY_IDS.owaspLlm2025,
        POLICY_AUTHORITY_IDS.iso42001,
        POLICY_AUTHORITY_IDS.iso23894,
        POLICY_AUTHORITY_IDS.iso42005,
        POLICY_AUTHORITY_IDS.soc2,
        POLICY_AUTHORITY_IDS.nistCsf2,
        POLICY_AUTHORITY_IDS.iso38507,
        POLICY_AUTHORITY_IDS.iso27001,
        POLICY_AUTHORITY_IDS.iso27701,
        POLICY_AUTHORITY_IDS.nistPrivacyFramework,
        POLICY_AUTHORITY_IDS.euAiAct,
      ]),
    );
    expect(getAuthorityIdForPack('pack_soc2')).toBe(POLICY_AUTHORITY_IDS.soc2);
    expect(getAuthorityIdForPack('pack_nist_csf_2')).toBe(POLICY_AUTHORITY_IDS.nistCsf2);
    expect(getAuthorityIdForPack('pack_iso_38507')).toBe(POLICY_AUTHORITY_IDS.iso38507);
    expect(getAuthorityIdForPack('pack_iso_27001')).toBe(POLICY_AUTHORITY_IDS.iso27001);
    expect(getAuthorityIdForPack('pack_iso_27701')).toBe(POLICY_AUTHORITY_IDS.iso27701);
    expect(getAuthorityIdForPack('pack_nist_privacy_framework')).toBe(
      POLICY_AUTHORITY_IDS.nistPrivacyFramework,
    );
  });
});
