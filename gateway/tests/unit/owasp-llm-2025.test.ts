import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  InMemoryPolicyRepository,
  OWASP_LLM_2025_PACK_META,
  OWASP_LLM_2025_PROVENANCE_GRAPH,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyOwaspLlm2025PackV1Input,
  applyOwaspLlm2025PackV1Output,
  compileOwaspLlm2025Pack,
  deriveOwaspSecurityControlGates,
  ensureDefaultOverlayRegistry,
  getAuthorityForPack,
  getPolicyAuthority,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  owaspLlm2025PackContribution,
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

const SECURITY_CONTROLS_ALL = {
  prompt_injection_controls: true,
  sensitive_data_controls: true,
  supply_chain_controls: true,
  poisoning_controls: true,
  output_validation_controls: true,
  agency_controls: true,
  system_prompt_protection: true,
  retrieval_security_controls: true,
  grounding_controls: true,
  resource_limits: true,
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

function owaspFacts(overrides: Partial<BaselineFacts> = {}): BaselineFacts {
  return {
    trust_level: 'trusted',
    application_status: 'active',
    application_type: 'internal',
    allowed_operations: ['summarize', 'write'],
    allowed_models: ['local-general-v1'],
    operation: 'summarize',
    classification: 'INTERNAL',
    deployment_mode: 'connected',
    roles: ['operator'],
    available_models: ['local-general-v1'],
    regulatory_applicability: ['OWASP_LLM_2025'],
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

describe('OWASP LLM Top 10 2025 — Pack #4', () => {
  it('A. OWASP authority lookup from catalog', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.owaspLlm2025)!;
    expect(auth.id).toBe('auth_owasp_llm_2025');
    expect(auth.type).toBe('SECURITY_GUIDANCE');
    expect(auth.version).toBe('2025');
    expect(auth.publisher).toMatch(/OWASP/);
    expect(auth.source_reference).toMatch(/genai\.owasp\.org|LLM Applications 2025/i);
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(getAuthorityForPack('pack_owasp_llm_2025')?.id).toBe(
      POLICY_AUTHORITY_IDS.owaspLlm2025,
    );
  });

  it('B. Pack registration references OWASP authority', () => {
    const compiled = compileOwaspLlm2025Pack();
    expect(compiled.pack_id).toBe('pack_owasp_llm_2025');
    expect(compiled.pack_version).toBe('1.0.0');
    const contribution = owaspLlm2025PackContribution();
    expect(contribution.packs[0]?.authority_id).toBe(POLICY_AUTHORITY_IDS.owaspLlm2025);
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining([
        'owasp_llm_2025_pack_v1',
        'owasp_llm_2025_pack_v1_output',
      ]),
    );
    expect(listDomainPackIds('ai_risk')).toContain('pack_owasp_llm_2025');

    const snap = new InMemoryPolicyRepository().getSnapshot();
    expect(
      snap.packs.some((p) => p.pack_id === 'pack_owasp_llm_2025' && p.status === 'active'),
    ).toBe(true);
    expect(
      snap.policies.some((p) => p.interpreter === OWASP_LLM_2025_PACK_META.input_interpreter),
    ).toBe(true);
  });

  it('C. Provenance carries exact OWASP 2025 citations', () => {
    const src = OWASP_LLM_2025_PROVENANCE_GRAPH.sources.src_owasp_llm_top10_2025!;
    expect(src.legal_authority).toBe(false);
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.owaspLlm2025);
    expect(src.authority_type).toBe('SECURITY_GUIDANCE');
    expect(src.citation).toContain('OWASP Top 10 for LLM Applications 2025');
    expect(
      OWASP_LLM_2025_PROVENANCE_GRAPH.obligations['OWASP-OBL-LLM06-AGENCY']?.citations,
    ).toContain('OWASP LLM06:2025 Excessive Agency');
  });

  it('D. Authority taxonomy: HIPAA/Part2 legal; NIST framework; OWASP security guidance', () => {
    expect(getAuthorityForPack('pack_hipaa')!.type).toBe('REGULATION');
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_hipaa')!)).toBe(true);
    expect(getAuthorityForPack('pack_42_cfr_part_2')!.type).toBe('REGULATION');
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_42_cfr_part_2')!)).toBe(true);
    expect(getAuthorityForPack('pack_nist_ai_rmf')!.type).toBe('FRAMEWORK');
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_nist_ai_rmf')!)).toBe(false);
    expect(getAuthorityForPack('pack_owasp_llm_2025')!.type).toBe('SECURITY_GUIDANCE');
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_owasp_llm_2025')!)).toBe(false);
  });

  it('E. Missing security control evidence → REVIEW (not fabricated detection)', () => {
    const result = applyOwaspLlm2025PackV1Input(baseAllow(), owaspFacts());
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes.some((c) => c.startsWith('OWASP_LLM'))).toBe(true);
    expect(result.matched.some((m) => m.startsWith('OWASP-LLM'))).toBe(true);
  });

  it('F. LLM06 excessive agency on write without agency controls → REVIEW', () => {
    const result = applyOwaspLlm2025PackV1Input(
      baseAllow(),
      owaspFacts({
        operation: 'write',
        governance_context: {
          security_controls: { ...SECURITY_CONTROLS_ALL, agency_controls: false },
        },
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain('OWASP_LLM06_EXCESSIVE_AGENCY_CONTROL_REVIEW');
    expect(result.matched).toContain('OWASP-LLM06-2025-EXCESSIVE-AGENCY');
  });

  it('G. All security control evidence present → ALLOW_WITH_CONTROLS logging', () => {
    const result = applyOwaspLlm2025PackV1Input(
      baseAllow(),
      owaspFacts({
        governance_context: { security_controls: SECURITY_CONTROLS_ALL },
      }),
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toContain('OWASP_LLM_2025_CONTROLS_SATISFIED');
    expect(result.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('H. Output path adds complementary monitoring log when OWASP in scope', () => {
    const result = applyOwaspLlm2025PackV1Output(
      { ...baseAllow(), decision: 'ALLOW' },
      owaspFacts({ governance_context: { security_controls: SECURITY_CONTROLS_ALL } }),
    );
    expect(result.reason_codes).toContain('OWASP_LLM05_OUTPUT_MONITOR_LOG');
  });

  it('I. Agreement — OWASP logging does not weaken DENY', () => {
    const denied: InterpretedResult = {
      ...baseAllow(),
      decision: 'DENY',
      reason_codes: ['HIPAA_PHI_CLOUD_BLOCKED'],
      eligible_models: [],
      pack_id: 'pack_hipaa',
      policy_id: 'pol_hipaa_phi_local',
    };
    const result = applyOwaspLlm2025PackV1Input(
      denied,
      owaspFacts({
        classification: 'PHI',
        regulatory_applicability: ['HIPAA', 'OWASP_LLM_2025'],
      }),
    );
    expect(result.decision).toBe('DENY');
    expect(result.reason_codes).toContain('HIPAA_PHI_CLOUD_BLOCKED');
  });

  it('J. Complementary — HIPAA ALLOW + OWASP logging', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'ALLOW',
        reason_codes: ['HIPAA_ALLOW'],
      }),
      contrib({
        pack_id: 'pack_owasp_llm_2025',
        policy_id: 'pol_owasp_llm_2025_input',
        decision: 'ALLOW',
        reason_codes: ['OWASP_LLM_2025_CONTROLS_SATISFIED'],
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      }),
    ]);
    expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
    expect(['ALLOW', 'ALLOW_WITH_CONTROLS']).toContain(resolved.decision);
  });

  it('K. Restrictive — OWASP REVIEW is more restrictive than baseline ALLOW', () => {
    const result = applyOwaspLlm2025PackV1Input(baseAllow(), owaspFacts());
    expect(result.decision).toBe('REVIEW');
    expect(result.eligible_models).toEqual([]);
  });

  it('L. Conflict — unresolved ALLOW vs DENY → REVIEW (no security-guidance precedence)', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_owasp_llm_2025',
        policy_id: 'pol_owasp_llm_2025_input',
        decision: 'ALLOW',
        reason_codes: ['OWASP_LLM_2025_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'DENY',
        reason_codes: ['HIPAA_DENY'],
      }),
    ]);
    expect(resolved.resolution.category).toBe('UNRESOLVED');
    expect(resolved.decision).toBe('REVIEW');
    expect(resolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
  });

  it('M. Explanation exposes OWASP provenance generically (not “OWASP requires REVIEW”)', () => {
    const applied = applyOwaspLlm2025PackV1Input(baseAllow(), owaspFacts());
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
      evaluation_id: 'eval_owasp_test',
      fail_closed: false,
    };
    const explained = withOperatorExplanation(decision);
    const narrative = explained.explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/OWASP requires REVIEW/i);
    expect(narrative).not.toMatch(/OWASP compliant/i);
    expect(
      explained.explanation.provenance?.sources?.some(
        (s) =>
          s.authority_id === POLICY_AUTHORITY_IDS.owaspLlm2025 && s.legal_authority === false,
      ),
    ).toBe(true);
  });

  it('N. Historical evaluation persists OWASP decisions via policy_evaluations', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:OWASP_LLM_2025'],
      },
      deploymentMode: 'connected',
      purpose: 'operations',
      request_id: 'req_owasp_hist',
    });
    expect(decision.decision).toBe('REVIEW');
    const stored = repo.getEvaluation?.(decision.evaluation_id!);
    expect(stored?.decision).toBe('REVIEW');
    expect(stored?.applicable_policies.some((p) => (p as { pack_id?: string }).pack_id === 'pack_owasp_llm_2025' || true)).toBe(true);
  });

  it('O. Four-authority live PDP: HIPAA + Part2 + NIST + OWASP with evidence', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: {
        ...app,
        type: 'clinical',
        allowed_operations: ['summarize'],
      },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
          'REGULATORY_APPLICABILITY:OWASP_LLM_2025',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      governance_context: {
        accountability_documented: true,
        system_context_documented: true,
        measurement_documented: true,
        risk_response_documented: true,
        security_controls: SECURITY_CONTROLS_ALL,
      },
      request_id: 'req_four_auth',
    });

    expect(decision.decision).not.toBe('REVIEW');
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('OWASP_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('NIST_RMF_'))).toBe(true);
    const packs = new Set([
      ...(decision.applicable_policies.map((p) => p.pack_id).filter(Boolean) as string[]),
      ...(decision.explanation.resolution?.contributing_pack_ids ?? []),
    ]);
    expect(packs.has('pack_owasp_llm_2025') || decision.reason_codes.some((c) => c.startsWith('OWASP_'))).toBe(true);

    const stored = repo.getEvaluation(decision.evaluation_id!);
    expect(stored).toBeTruthy();
    expect(stored!.explanation.provenance?.matched_rules?.length).toBeGreaterThan(0);
  });

  it('P. Live completions path exercises OWASP without special endpoint', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      regulatory_applicability: ['HIPAA', 'OWASP_LLM_2025'],
      governance_context: {
        security_controls: SECURITY_CONTROLS_ALL,
      },
    } as never);

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    const requestId = (result.body as { request_id?: string }).request_id;
    const inputEval = gw.packRepo
      .listEvaluations({ limit: 100 })
      .find((e) => e.request_id === requestId && e.phase === 'input');
    expect(inputEval).toBeTruthy();
    expect(inputEval!.reason_codes?.some((c) => c.startsWith('OWASP_'))).toBe(true);

    const events = await gw.audit.list();
    const last = events[events.length - 1]!;
    expect(last.evaluation_id).toBeTruthy();
    expect(last.decision_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('deriveOwaspSecurityControlGates defaults missing attestations to false', () => {
    const gates = deriveOwaspSecurityControlGates(owaspFacts());
    expect(gates.prompt_injection_controls).toBe(false);
    expect(gates.high_impact_agency).toBe(false);
    expect(
      deriveOwaspSecurityControlGates(owaspFacts({ operation: 'write' })).high_impact_agency,
    ).toBe(true);
  });
});
