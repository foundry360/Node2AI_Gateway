import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  ISO_42005_PACK_META,
  ISO_42005_PROVENANCE_GRAPH,
  ISO_42005_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyIso42005PackV1Input,
  compileIso42005Pack,
  deriveIso42005ImpactGates,
  ensureDefaultOverlayRegistry,
  getAuthorityForPack,
  getPolicyAuthority,
  iso42005PackContribution,
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
import type {
  AiRiskManagementEvidence,
  ImpactAssessmentEvidence,
  ManagementSystemEvidence,
} from '../../src/policy/types.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

export const IMPACT_ALL: ImpactAssessmentEvidence = {
  impact_assessment_completed: true,
  impact_scope_defined: true,
  affected_stakeholders_identified: true,
  potential_impacts_identified: true,
  impact_severity_assessed: true,
  impact_likelihood_assessed: true,
  mitigations_defined: true,
  mitigations_implemented: true,
  residual_impact_reviewed: true,
  impact_monitoring_established: true,
  impact_review_established: true,
};

const AI_RISK_ALL: AiRiskManagementEvidence = {
  risk_management_established: true,
  risk_context_defined: true,
  risk_identification_completed: true,
  risk_analysis_completed: true,
  risk_evaluation_completed: true,
  risk_treatment_defined: true,
  risk_treatment_implemented: true,
  residual_risk_accepted: true,
  risk_monitoring_established: true,
  risk_communication_established: true,
  risk_review_established: true,
};

const MANAGEMENT_SYSTEM_ALL: ManagementSystemEvidence = {
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
    regulatory_applicability: ['ISO_42005'],
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

describe('ISO/IEC 42005 Pack #8', () => {
  it('1–3. Authority is STANDARD with legal_authority false', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso42005)!;
    expect(auth.id).toBe('auth_iso_42005');
    expect(auth.type).toBe('STANDARD');
    expect(auth.version).toBe('2025');
    expect(auth.effective_date).toBe('2025-05-28');
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.source_reference).toContain('42005');
    expect(getAuthorityForPack('pack_iso_42005')?.id).toBe(POLICY_AUTHORITY_IDS.iso42005);
  });

  it('4–5. Pack registration and applicability skip', () => {
    expect(listDomainPackIds('ai_risk')).toContain('pack_iso_42005');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['iso_42005_pack_v1', 'iso_42005_pack_v1_output']),
    );
    expect(compileIso42005Pack().pack_id).toBe(ISO_42005_PACK_META.pack_id);
    expect(iso42005PackContribution().packs[0]?.authority_id).toBe(
      POLICY_AUTHORITY_IDS.iso42005,
    );
    expect(ISO_42005_RULES.length).toBeGreaterThanOrEqual(12);

    const skip = applyIso42005PackV1Input(
      baseAllow(),
      isoFacts({ regulatory_applicability: ['ISO_23894'] }),
    );
    expect(skip.matched).toContain('iso_42005_pack_v1_skip_not_applicable');
  });

  it('6–7. Missing vs satisfied impact-assessment evidence', () => {
    expect(applyIso42005PackV1Input(baseAllow(), isoFacts()).decision).toBe('REVIEW');
    expect(applyIso42005PackV1Input(baseAllow(), isoFacts()).reason_codes).toContain(
      'ISO42005_IMPACT_ASSESSMENT_REVIEW',
    );

    const ok = applyIso42005PackV1Input(
      baseAllow(),
      isoFacts({ governance_context: { impact: IMPACT_ALL } }),
    );
    expect(ok.decision).toBe('ALLOW');
    expect(ok.reason_codes).toContain('ISO42005_CONTROLS_SATISFIED');
  });

  it('8–17. Individual missing gates → REVIEW', () => {
    const cases: Array<{ patch: Partial<ImpactAssessmentEvidence>; code: string }> = [
      {
        patch: { ...IMPACT_ALL, impact_scope_defined: false },
        code: 'ISO42005_IMPACT_SCOPE_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, affected_stakeholders_identified: false },
        code: 'ISO42005_STAKEHOLDERS_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, potential_impacts_identified: false },
        code: 'ISO42005_IMPACTS_IDENTIFIED_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, impact_assessment_completed: false },
        code: 'ISO42005_IMPACT_ASSESSMENT_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, impact_severity_assessed: false },
        code: 'ISO42005_IMPACT_SEVERITY_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, impact_likelihood_assessed: false },
        code: 'ISO42005_IMPACT_LIKELIHOOD_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, mitigations_defined: false },
        code: 'ISO42005_MITIGATIONS_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, mitigations_implemented: false },
        code: 'ISO42005_MITIGATIONS_IMPLEMENTED_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, residual_impact_reviewed: false },
        code: 'ISO42005_RESIDUAL_IMPACT_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, impact_monitoring_established: false },
        code: 'ISO42005_IMPACT_MONITORING_REVIEW',
      },
      {
        patch: { ...IMPACT_ALL, impact_review_established: false },
        code: 'ISO42005_IMPACT_REVIEW_PROCESS_REVIEW',
      },
    ];
    for (const c of cases) {
      const result = applyIso42005PackV1Input(
        baseAllow(),
        isoFacts({ governance_context: { impact: c.patch } }),
      );
      expect(result.decision).toBe('REVIEW');
      expect(result.reason_codes).toContain(c.code);
    }
  });

  it('18–20. Aggregate + provenance with section citations', () => {
    const src = ISO_42005_PROVENANCE_GRAPH.sources.src_iso_iec_42005_2025!;
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.iso42005);
    expect(src.authority_type).toBe('STANDARD');
    expect(src.legal_authority).toBe(false);
    const obl = ISO_42005_PROVENANCE_GRAPH.obligations['ISO42005-OBL-IMPACT-ASSESSMENT']!;
    expect(obl.citations.some((c) => /impact assessment/i.test(c))).toBe(true);
  });

  it('21–22. ISO 42001 / 23894 + ISO 42005 remain independent', () => {
    for (const peer of [
      {
        pack_id: 'pack_iso_42001',
        policy_id: 'pol_iso_42001_input',
        code: 'ISO42001_CONTROLS_SATISFIED',
      },
      {
        pack_id: 'pack_iso_23894',
        policy_id: 'pol_iso_23894_input',
        code: 'ISO23894_CONTROLS_SATISFIED',
      },
    ] as const) {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: peer.pack_id,
          policy_id: peer.policy_id,
          decision: 'ALLOW',
          reason_codes: [peer.code],
          obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        }),
        contrib({
          pack_id: 'pack_iso_42005',
          policy_id: 'pol_iso_42005_input',
          decision: 'ALLOW',
          reason_codes: ['ISO42005_CONTROLS_SATISFIED'],
          obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }],
        }),
      ]);
      expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
      expect(getAuthorityForPack(peer.pack_id)!.id).not.toBe(
        getAuthorityForPack('pack_iso_42005')!.id,
      );
    }
  });

  it('23–27. Multi-pack with NIST, OWASP, HIPAA, Part2, EU', () => {
    for (const [pack_id, policy_id, code] of [
      ['pack_nist_ai_rmf', 'pol_nist_ai_rmf_input', 'NIST_RMF_GOVERNANCE_DOCUMENTED'],
      ['pack_owasp_llm_2025', 'pol_owasp_llm_2025_input', 'OWASP_LLM_2025_CONTROLS_SATISFIED'],
      ['pack_hipaa', 'pol_hipaa_phi_local', 'HIPAA_ALLOW'],
      ['pack_42_cfr_part_2', 'pol_part2_sud_records', 'PART2_ALLOW'],
      ['pack_eu_ai_act', 'pol_eu_ai_act_input', 'EU_AI_ACT_MINIMAL_OR_NO_RISK'],
    ] as const) {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_42005',
          policy_id: 'pol_iso_42005_input',
          decision: 'ALLOW',
          reason_codes: ['ISO42005_CONTROLS_SATISFIED'],
        }),
        contrib({ pack_id, policy_id, decision: 'ALLOW', reason_codes: [code] }),
      ]);
      expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
    }
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_iso_42005')!)).toBe(false);
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_eu_ai_act')!)).toBe(true);
  });

  it('28. Unresolved conflict → REVIEW (no ISO precedence)', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_42005',
        policy_id: 'pol_iso_42005_input',
        decision: 'ALLOW',
        reason_codes: ['ISO42005_CONTROLS_SATISFIED'],
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

  it('29–33. Historical evaluation + live path + explanation', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_42005'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2024-06-01',
      governance_context: { impact: IMPACT_ALL },
      request_id: 'req_iso42005_hist',
    });
    expect(decision.reason_codes).toContain('ISO42005_CONTROLS_SATISFIED');
    expect(repo.getEvaluation(decision.evaluation_id!)?.evaluation_id).toBe(
      decision.evaluation_id,
    );

    const gw = await createPhase1Gateway();
    const live = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_demo',
      user: { id: 'user_demo' },
      operation: 'summarize',
      model: 'local-general-v1',
      messages: [{ role: 'user', content: 'Hello' }],
      regulatory_applicability: ['ISO_42005'],
      governance_context: { impact: IMPACT_ALL },
    });
    expect(live).toBeTruthy();

    const applied = applyIso42005PackV1Input(baseAllow(), isoFacts());
    const explained = withOperatorExplanation({
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
      evaluation_id: 'eval_iso42005',
      fail_closed: false,
    } as PolicyDecision);
    const narrative = explained.explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/ISO certified/i);
    expect(narrative).not.toMatch(/impact score/i);
  });

  it('36–40. Eight-authority PDP; impact ≠ risk; completion ≠ auto-authorize', async () => {
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
          'REGULATORY_APPLICABILITY:ISO_23894',
          'REGULATORY_APPLICABILITY:ISO_42005',
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
        ai_risk: AI_RISK_ALL,
        impact: IMPACT_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_eight_auth',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42005_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('ISO23894_'))).toBe(true);
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42005)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso23894)).toBe(
      true,
    );

    // Impact context does not overwrite risk context
    const mixed = applyIso42005PackV1Input(
      baseAllow(),
      isoFacts({
        governance_context: {
          impact: IMPACT_ALL,
          ai_risk: { risk_management_established: false },
        },
      }),
    );
    expect(mixed.decision).toBe('ALLOW');
    expect(mixed.reason_codes).toContain('ISO42005_CONTROLS_SATISFIED');

    // Impact assessment completion alone does not auto-authorize
    const incomplete = applyIso42005PackV1Input(
      baseAllow(),
      isoFacts({
        governance_context: {
          impact: {
            impact_assessment_completed: true,
            impact_scope_defined: false,
          },
        },
      }),
    );
    expect(incomplete.decision).toBe('REVIEW');
  });

  it('Gate derivation does not invent impact evidence', () => {
    const gates = deriveIso42005ImpactGates(isoFacts());
    expect(gates.impact_assessment_completed).toBe(false);
    expect(gates.impact_scope_defined).toBe(false);
  });

  it('38. No ISO-specific evaluator/resolver/engine artifacts', () => {
    const forbidden = [
      'Iso42005Evaluator',
      'Iso42005Engine',
      'Iso42005Resolver',
      'Iso42005Decision',
      'Iso42005Gateway',
      'Iso42005Database',
      'Iso42005Dashboard',
      'Iso42005AssessmentEngine',
      'Iso42005Score',
      'ImpactScore',
      'ImpactDashboard',
    ];
    const root = resolve(process.cwd(), 'src');
    for (const name of forbidden) {
      expect(
        existsSync(resolve(root, `policy/enterprise/packs/iso-42005/${name}.ts`)),
      ).toBe(false);
    }
    const packSrc = readFileSync(
      resolve(root, 'policy/enterprise/packs/iso-42005/pack.ts'),
      'utf8',
    );
    expect(packSrc).not.toMatch(/Iso42005Evaluator|Iso42005Engine|Iso42005Resolver/);
  });
});
