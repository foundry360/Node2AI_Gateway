import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  ISO_42001_PACK_META,
  ISO_42001_PROVENANCE_GRAPH,
  ISO_42001_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyIso42001PackV1Input,
  compileIso42001Pack,
  deriveIso42001ManagementGates,
  ensureDefaultOverlayRegistry,
  getAuthorityForPack,
  getPolicyAuthority,
  iso42001PackContribution,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withOperatorExplanation,
  type BaselineFacts,
  type InterpretedResult,
  type PackEvaluationContribution,
  type PolicyDecision,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import type { ManagementSystemEvidence } from '../../src/policy/types.js';

ensureDefaultOverlayRegistry();

const user: User = {
  user_id: 'u1',
  organization_id: 'o1',
  roles: ['operator'],
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
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

export const MANAGEMENT_SYSTEM_ALL: ManagementSystemEvidence = {
  ai_policy_established: true,
  roles_responsibilities_documented: true,
  ai_system_inventory_documented: true,
  risk_process_established: true,
  risk_assessment_completed: true,
  risk_treatment_documented: true,
  impact_assessment_completed: true,
  data_governance_established: true,
  human_oversight_defined: true,
  operational_controls_defined: true,
  monitoring_established: true,
  performance_evaluation_established: true,
  incident_process_established: true,
  internal_review_completed: true,
  continual_improvement_process_established: true,
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

function isoFacts(overrides: Partial<BaselineFacts> = {}): BaselineFacts {
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
    regulatory_applicability: ['ISO_42001'],
    evaluation_as_of: '2026-09-01',
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

describe('ISO/IEC 42001 Pack #6', () => {
  it('1. Authority is STANDARD with legal_authority false', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso42001)!;
    expect(auth.id).toBe('auth_iso_42001');
    expect(auth.type).toBe('STANDARD');
    expect(auth.version).toBe('2023');
    expect(auth.authority_tier).toBe(3);
    expect(auth.effective_date).toBe('2023-12-18');
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.source_reference).toContain('iso.org/standard/42001');
    expect(getAuthorityForPack('pack_iso_42001')?.id).toBe(POLICY_AUTHORITY_IDS.iso42001);
  });

  it('2. Pack registration — domain, interpreters, compile', () => {
    expect(listDomainPackIds('ai_risk')).toContain('pack_iso_42001');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['iso_42001_pack_v1', 'iso_42001_pack_v1_output']),
    );
    const compiled = compileIso42001Pack();
    expect(compiled.pack_id).toBe(ISO_42001_PACK_META.pack_id);
    expect(compiled.pack_version).toBe('1.0.0');
    expect(iso42001PackContribution().packs[0]?.authority_id).toBe(
      POLICY_AUTHORITY_IDS.iso42001,
    );
    expect(ISO_42001_RULES.length).toBeGreaterThanOrEqual(10);
  });

  it('3. Not applicable when ISO_42001 not tagged', () => {
    const result = applyIso42001PackV1Input(
      baseAllow(),
      isoFacts({ regulatory_applicability: ['NIST_AI_RMF'] }),
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.matched).toContain('iso_42001_pack_v1_skip_not_applicable');
  });

  it('4. Missing management-system evidence → REVIEW', () => {
    const result = applyIso42001PackV1Input(baseAllow(), isoFacts());
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain('ISO42001_AIMS_GOVERNANCE_REVIEW');
  });

  it('5. Satisfied management-system evidence → ALLOW_WITH_CONTROLS path', () => {
    const result = applyIso42001PackV1Input(
      baseAllow(),
      isoFacts({ governance_context: { management_system: MANAGEMENT_SYSTEM_ALL } }),
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toContain('ISO42001_CONTROLS_SATISFIED');
  });

  it('6–15. Individual missing gates → REVIEW', () => {
    const cases: Array<{ patch: Partial<ManagementSystemEvidence>; code: string }> = [
      {
        patch: { ...MANAGEMENT_SYSTEM_ALL, risk_assessment_completed: false },
        code: 'ISO42001_RISK_MANAGEMENT_REVIEW',
      },
      {
        patch: { ...MANAGEMENT_SYSTEM_ALL, impact_assessment_completed: false },
        code: 'ISO42001_IMPACT_ASSESSMENT_REVIEW',
      },
      {
        patch: { ...MANAGEMENT_SYSTEM_ALL, data_governance_established: false },
        code: 'ISO42001_DATA_GOVERNANCE_REVIEW',
      },
      {
        patch: { ...MANAGEMENT_SYSTEM_ALL, human_oversight_defined: false },
        code: 'ISO42001_HUMAN_OVERSIGHT_REVIEW',
      },
      {
        patch: { ...MANAGEMENT_SYSTEM_ALL, monitoring_established: false },
        code: 'ISO42001_MONITORING_EVALUATION_REVIEW',
      },
      {
        patch: { ...MANAGEMENT_SYSTEM_ALL, incident_process_established: false },
        code: 'ISO42001_INCIDENT_MANAGEMENT_REVIEW',
      },
      {
        patch: {
          ...MANAGEMENT_SYSTEM_ALL,
          continual_improvement_process_established: false,
        },
        code: 'ISO42001_CONTINUAL_IMPROVEMENT_REVIEW',
      },
      {
        patch: { ...MANAGEMENT_SYSTEM_ALL, ai_system_inventory_documented: false },
        code: 'ISO42001_AI_SCOPE_INVENTORY_REVIEW',
      },
      {
        patch: { ...MANAGEMENT_SYSTEM_ALL, operational_controls_defined: false },
        code: 'ISO42001_OPERATIONAL_CONTROLS_REVIEW',
      },
    ];
    for (const c of cases) {
      const result = applyIso42001PackV1Input(
        baseAllow(),
        isoFacts({ governance_context: { management_system: c.patch } }),
      );
      expect(result.decision).toBe('REVIEW');
      expect(result.reason_codes).toContain(c.code);
    }
  });

  it('17–18. Provenance chain with clause citations', () => {
    const src = ISO_42001_PROVENANCE_GRAPH.sources.src_iso_iec_42001_2023!;
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.iso42001);
    expect(src.authority_type).toBe('STANDARD');
    expect(src.legal_authority).toBe(false);
    const obl = ISO_42001_PROVENANCE_GRAPH.obligations['ISO42001-OBL-RISK-MANAGEMENT']!;
    expect(obl.citations.some((c) => c.includes('Clause 6'))).toBe(true);
  });

  it('19. ISO + NIST complementary/agreement', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_42001',
        policy_id: 'pol_iso_42001_input',
        decision: 'ALLOW',
        reason_codes: ['ISO42001_CONTROLS_SATISFIED'],
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      }),
      contrib({
        pack_id: 'pack_nist_ai_rmf',
        policy_id: 'pol_nist_ai_rmf_input',
        decision: 'ALLOW',
        reason_codes: ['NIST_RMF_GOVERNANCE_DOCUMENTED'],
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
      }),
    ]);
    expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
  });

  it('20. ISO + OWASP complementary', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_42001',
        policy_id: 'pol_iso_42001_input',
        decision: 'ALLOW',
        reason_codes: ['ISO42001_CONTROLS_SATISFIED'],
        obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
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
  });

  it('21. ISO + HIPAA distinct authorities (no precedence)', () => {
    expect(getAuthorityForPack('pack_iso_42001')!.type).toBe('STANDARD');
    expect(getAuthorityForPack('pack_hipaa')!.type).toBe('REGULATION');
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_42001',
        policy_id: 'pol_iso_42001_input',
        decision: 'ALLOW',
        reason_codes: ['ISO42001_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'ALLOW',
        reason_codes: ['HIPAA_ALLOW'],
      }),
    ]);
    expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
  });

  it('22. ISO + EU AI Act — STANDARD vs REGULATION, independent', () => {
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_iso_42001')!)).toBe(false);
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_eu_ai_act')!)).toBe(true);
  });

  it('23. Unresolved conflict → REVIEW (no ISO precedence)', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_42001',
        policy_id: 'pol_iso_42001_input',
        decision: 'ALLOW',
        reason_codes: ['ISO42001_CONTROLS_SATISFIED'],
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
  });

  it('24–25. Historical evaluation_as_of + policy_evaluations snapshot', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user,
      application: app,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_42001'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2024-06-01',
      governance_context: { management_system: MANAGEMENT_SYSTEM_ALL },
      request_id: 'req_iso_hist',
    });
    expect(decision.decision).not.toBe('REVIEW');
    expect(decision.reason_codes).toContain('ISO42001_CONTROLS_SATISFIED');
    const stored = repo.getEvaluation(decision.evaluation_id!);
    expect(stored?.decision).toBe(decision.decision);
    expect(stored?.evaluation_id).toBe(decision.evaluation_id);
  });

  it('26. Live completions path exercises ISO without special endpoint', async () => {
    const gw = await createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_demo',
      user: { id: 'user_demo' },
      operation: 'summarize',
      model: 'local-general-v1',
      messages: [{ role: 'user', content: 'Hello' }],
      regulatory_applicability: ['ISO_42001'],
      governance_context: { management_system: MANAGEMENT_SYSTEM_ALL },
    });
    expect(result).toBeTruthy();
  });

  it('27–28. Decision explanation without certification language', () => {
    const applied = applyIso42001PackV1Input(baseAllow(), isoFacts());
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
              })),
            }
          : undefined,
      },
      evidence: {},
      evaluation_id: 'eval_iso_test',
      fail_closed: false,
    };
    const explained = withOperatorExplanation(decision);
    const narrative = explained.explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/ISO certified/i);
    expect(narrative).not.toMatch(/ISO compliant/i);
    expect(
      explained.explanation.provenance?.sources?.some(
        (s) =>
          s.authority_id === POLICY_AUTHORITY_IDS.iso42001 && s.legal_authority === false,
      ),
    ).toBe(true);
  });

  it('33. Six-authority PDP through generic engine', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const clinician: User = { ...user, roles: ['clinician'] };
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: { ...app, type: 'clinical', allowed_operations: ['summarize'] },
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
          'REGULATORY_APPLICABILITY:EU_AI_ACT',
          'REGULATORY_APPLICABILITY:ISO_42001',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      evaluation_as_of: '2026-09-01',
      governance_context: {
        accountability_documented: true,
        system_context_documented: true,
        measurement_documented: true,
        risk_response_documented: true,
        security_controls: {
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
        },
        management_system: MANAGEMENT_SYSTEM_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_six_auth',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42001)).toBe(
      true,
    );
    expect(repo.getEvaluation(decision.evaluation_id!)?.evaluation_id).toBe(
      decision.evaluation_id,
    );
  });

  it('Gate derivation does not invent management evidence', () => {
    const gates = deriveIso42001ManagementGates(isoFacts());
    expect(gates.aims_governance_established).toBe(false);
    expect(gates.risk_management_established).toBe(false);
  });
});
