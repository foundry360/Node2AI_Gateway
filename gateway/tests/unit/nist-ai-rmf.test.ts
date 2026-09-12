import { describe, expect, it } from 'vitest';
import {
  InMemoryPolicyRepository,
  NIST_AI_RMF_PACK_META,
  NIST_AI_RMF_PROVENANCE_GRAPH,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyNistAiRmfPackV1Input,
  applyNistAiRmfPackV1Output,
  compileNistAiRmfPack,
  ensureDefaultOverlayRegistry,
  getAuthorityForPack,
  getPolicyAuthority,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  nistAiRmfPackContribution,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withOperatorExplanation,
  type BaselineFacts,
  type InterpretedResult,
  type PackEvaluationContribution,
  type PolicyDecision,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

ensureDefaultOverlayRegistry();

const clinician: User = {
  user_id: 'u1',
  organization_id: 'o1',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const app: Application = {
  application_id: 'a1',
  organization_id: 'o1',
  name: 'App',
  type: 'internal',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

function baseAllow(): InterpretedResult {
  return {
    decision: 'ALLOW',
    reason_codes: ['BASELINE_ALLOW'],
    eligible_models: ['local-general-v1'],
    transforms: [],
    obligations: [],
    policy_id: 'pol_baseline_input',
    policy_version: 2,
    pack_id: 'pack_enterprise_baseline',
    matched: ['baseline'],
  };
}

function nistFacts(overrides: Partial<BaselineFacts> = {}): BaselineFacts {
  return {
    trust_level: 'trusted',
    application_status: 'active',
    application_type: 'internal',
    allowed_operations: ['summarize'],
    allowed_models: ['local-general-v1'],
    operation: 'summarize',
    classification: 'INTERNAL',
    deployment_mode: 'connected',
    roles: ['operator'],
    available_models: ['local-general-v1'],
    regulatory_applicability: ['NIST_AI_RMF'],
    ...overrides,
  };
}

function contrib(
  partial: Partial<PackEvaluationContribution> &
    Pick<PackEvaluationContribution, 'pack_id' | 'policy_id' | 'decision'>,
): PackEvaluationContribution {
  return {
    pack_name: partial.pack_id,
    pack_version: '1.0.0',
    policy_name: partial.policy_id,
    policy_version: 1,
    reason_codes: [],
    rule_ids: [],
    obligation_ids: [],
    obligations: [],
    controls: [],
    transforms: [],
    eligible_models: ['local-general-v1'],
    matched: [],
    applicable: true,
    ...partial,
  };
}

describe('NIST AI RMF — Pack #3', () => {
  it('A. NIST authority lookup from catalog', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistAiRmf)!;
    expect(auth.type).toBe('FRAMEWORK');
    expect(auth.name).toMatch(/NIST AI Risk Management Framework/i);
    expect(getAuthorityForPack('pack_nist_ai_rmf')?.id).toBe(POLICY_AUTHORITY_IDS.nistAiRmf);
  });

  it('B. Pack registration references NIST authority', () => {
    const compiled = compileNistAiRmfPack();
    expect(compiled.pack_id).toBe('pack_nist_ai_rmf');
    expect(compiled.pack_version).toBe('1.0.0');
    const contribution = nistAiRmfPackContribution();
    expect(contribution.packs[0]?.authority_id).toBe(POLICY_AUTHORITY_IDS.nistAiRmf);
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['nist_ai_rmf_pack_v1', 'nist_ai_rmf_pack_v1_output']),
    );
    expect(listDomainPackIds('ai_risk')).toContain('pack_nist_ai_rmf');

    const snap = new InMemoryPolicyRepository().getSnapshot();
    expect(snap.packs.some((p) => p.pack_id === 'pack_nist_ai_rmf' && p.status === 'active')).toBe(
      true,
    );
    expect(
      snap.policies.some((p) => p.interpreter === NIST_AI_RMF_PACK_META.input_interpreter),
    ).toBe(true);
  });

  it('C. Provenance carries exact NIST citations', () => {
    const src = NIST_AI_RMF_PROVENANCE_GRAPH.sources.src_nist_ai_rmf_100_1!;
    expect(src.legal_authority).toBe(false);
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.nistAiRmf);
    expect(src.citation).toContain('NIST AI 100-1');
    expect(
      NIST_AI_RMF_PROVENANCE_GRAPH.obligations['NIST-OBL-MAP-CONTEXT']?.citations,
    ).toContain('NIST AI 100-1 MAP 1.1');
    expect(
      NIST_AI_RMF_PROVENANCE_GRAPH.obligations['NIST-OBL-GOVERN-ACCOUNTABILITY']?.citations,
    ).toEqual(expect.arrayContaining(['NIST AI 100-1 GOVERN 2.1', 'NIST AI 100-1 GOVERN 1.1']));
  });

  it('D. Authority semantics remain FRAMEWORK and non-legal', () => {
    const auth = getAuthorityForPack('pack_nist_ai_rmf')!;
    expect(auth.type).toBe('FRAMEWORK');
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.provenance.legal_authority).toBe(false);
  });

  it('E. GOVERN — undocumented accountability → REVIEW', () => {
    const result = applyNistAiRmfPackV1Input(
      baseAllow(),
      nistFacts({
        nist_governance_documented: false,
        nist_map_context_documented: true,
        nist_measure_documented: true,
        nist_manage_response_documented: true,
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain('NIST_RMF_GOVERNANCE_CONTEXT_REVIEW');
    expect(result.matched).toContain('NIST-R-INPUT-GOVERN-CONTEXT-REVIEW');
    expect(result.provenance?.matched_rules[0]?.citations).toEqual(
      expect.arrayContaining(['NIST AI 100-1 GOVERN 2.1']),
    );
  });

  it('F. MAP — undocumented context → REVIEW', () => {
    const result = applyNistAiRmfPackV1Input(
      baseAllow(),
      nistFacts({
        nist_governance_documented: true,
        nist_map_context_documented: false,
        nist_measure_documented: true,
        nist_manage_response_documented: true,
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain('NIST_RMF_MAP_CONTEXT_REVIEW');
    expect(result.provenance?.matched_rules.some((r) => r.citations.includes('NIST AI 100-1 MAP 1.1'))).toBe(
      true,
    );
  });

  it('G. MEASURE — undocumented measurement evidence → REVIEW', () => {
    const result = applyNistAiRmfPackV1Input(
      baseAllow(),
      nistFacts({
        nist_governance_documented: true,
        nist_map_context_documented: true,
        nist_measure_documented: false,
        nist_manage_response_documented: true,
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain('NIST_RMF_MEASURE_EVIDENCE_REVIEW');
  });

  it('H. MANAGE — undocumented risk response → REVIEW', () => {
    const result = applyNistAiRmfPackV1Input(
      baseAllow(),
      nistFacts({
        nist_governance_documented: true,
        nist_map_context_documented: true,
        nist_measure_documented: true,
        nist_manage_response_documented: false,
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain('NIST_RMF_MANAGE_RESPONSE_REVIEW');
  });

  it('I. Agreement — NIST logging agrees with DENY without weakening it', () => {
    const denied: InterpretedResult = {
      ...baseAllow(),
      decision: 'DENY',
      reason_codes: ['HIPAA_PHI_CLOUD_BLOCKED'],
      eligible_models: [],
      pack_id: 'pack_hipaa',
      policy_id: 'pol_hipaa_phi_local',
    };
    const result = applyNistAiRmfPackV1Input(
      denied,
      nistFacts({
        nist_governance_documented: false,
        classification: 'PHI',
        regulatory_applicability: ['HIPAA', 'NIST_AI_RMF'],
      }),
    );
    expect(result.decision).toBe('DENY');
    expect(result.reason_codes).toContain('HIPAA_PHI_CLOUD_BLOCKED');
    expect(result.matched.some((m) => m.includes('nist'))).toBe(true);
  });

  it('J. Complementary — satisfied gates add LOG without changing ALLOW', () => {
    const result = applyNistAiRmfPackV1Input(
      baseAllow(),
      nistFacts({
        nist_governance_documented: true,
        nist_map_context_documented: true,
        nist_measure_documented: true,
        nist_manage_response_documented: true,
      }),
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toContain('NIST_RMF_CONTROLS_SATISFIED');
    expect(result.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('K. Restrictive — NIST REVIEW is more restrictive than baseline ALLOW', () => {
    const result = applyNistAiRmfPackV1Input(
      baseAllow(),
      nistFacts({ nist_governance_documented: false }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.eligible_models).toEqual([]);
  });

  it('L. Conflict — unresolved ALLOW vs DENY → REVIEW (no framework precedence)', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_nist_ai_rmf',
        policy_id: 'pol_nist_ai_rmf_input',
        decision: 'ALLOW',
        reason_codes: ['NIST_RMF_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'DENY',
        reason_codes: ['HIPAA_DENY'],
      }),
    ]);
    expect(resolved.resolution.category).toBe('RESTRICTIVE');
    expect(resolved.decision).toBe('DENY');
    expect(resolved.reason_codes).toContain('RESOLUTION_CONSEQUENCE_DENY');
    expect(getAuthorityForPack('pack_nist_ai_rmf')!.type).toBe('FRAMEWORK');
    expect(getAuthorityForPack('pack_hipaa')!.type).toBe('REGULATION');
  });

  it('M. Explanation exposes NIST provenance generically', () => {
    const applied = applyNistAiRmfPackV1Input(
      baseAllow(),
      nistFacts({
        nist_governance_documented: false,
        nist_map_context_documented: true,
        nist_measure_documented: true,
        nist_manage_response_documented: true,
      }),
    );
    const decision: PolicyDecision = {
      decision: applied.decision,
      reason: applied.reason_codes.join(', '),
      reason_codes: applied.reason_codes,
      applicable_policies: [
        {
          policy_id: applied.policy_id,
          version: applied.policy_version,
          pack_id: applied.pack_id,
        },
      ],
      obligations: applied.obligations,
      transformations: [],
      restrictions: {},
      approval_requirements: [],
      conflicts: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: applied.reason_codes.join(', '),
        provenance: applied.provenance
          ? {
              matched_rules: applied.provenance.matched_rules,
              sources: applied.provenance.sources?.map((s) => ({
                source_id: s.source_id,
                authority: s.authority,
                authority_tier: s.authority_tier,
                authority_type: s.authority_type,
                legal_authority: s.legal_authority,
                authority_id: s.authority_id,
                citation: s.citation,
                title: s.title,
                publisher: s.publisher,
                canonical_url: s.canonical_url,
              })),
            }
          : undefined,
      },
      evidence: {},
      evaluation_id: 'eval_nist_test',
      fail_closed: false,
    };
    const explained = withOperatorExplanation(decision);
    expect(explained.explanation.operator?.authorities?.some((a) => a.authority.includes('NIST'))).toBe(
      true,
    );
    expect(
      explained.explanation.provenance?.sources?.some(
        (s) => s.authority_id === POLICY_AUTHORITY_IDS.nistAiRmf && s.legal_authority === false,
      ),
    ).toBe(true);
  });

  it('N. Historical evaluation persists NIST decisions via policy_evaluations path', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: app,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_AI_RMF'],
      },
      deploymentMode: 'connected',
      purpose: 'unknown',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.evaluation_id).toBeTruthy();
    const stored = repo.getEvaluation?.(decision.evaluation_id!);
    expect(stored).toBeTruthy();
    expect(stored?.decision).toBe('REVIEW');
  });

  it('O. Output path adds complementary monitoring log when NIST is in scope', () => {
    const result = applyNistAiRmfPackV1Output(
      {
        ...baseAllow(),
        decision: 'ALLOW',
        phase: undefined,
      } as InterpretedResult,
      nistFacts({
        nist_governance_documented: true,
        nist_map_context_documented: true,
        nist_measure_documented: true,
        nist_manage_response_documented: true,
        inspection_sensitivity: 'INTERNAL',
      }),
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toContain('NIST_RMF_OUTPUT_MONITOR_LOG');
    expect(result.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('P. Snapshot keeps HIPAA and Part 2 active alongside NIST', () => {
    const snap = new InMemoryPolicyRepository().getSnapshot();
    expect(snap.packs.map((p) => p.pack_id)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_42_cfr_part_2', 'pack_nist_ai_rmf']),
    );
  });
});
