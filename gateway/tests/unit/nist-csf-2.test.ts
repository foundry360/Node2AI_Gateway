import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  NIST_CSF_2_PACK_META,
  NIST_CSF_2_PROVENANCE_GRAPH,
  NIST_CSF_2_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyNistCsf2PackV1Input,
  compileNistCsf2Pack,
  deriveNistCsf2Gates,
  ensureDefaultOverlayRegistry,
  getAuthorityForPack,
  getPolicyAuthority,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  nistCsf2PackContribution,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withOperatorExplanation,
  type BaselineFacts,
  type InterpretedResult,
  type PackEvaluationContribution,
  type PolicyDecision,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import type { CybersecurityGovernanceEvidence } from '../../src/policy/types.js';
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

export const CYBERSECURITY_ALL: CybersecurityGovernanceEvidence = {
  govern: {
    accountability_documented: true,
    cybersecurity_roles_defined: true,
    cybersecurity_policy_documented: true,
  },
  identify: {
    assets_identified: true,
    dependencies_identified: true,
    cybersecurity_risk_identified: true,
  },
  protect: {
    access_controls_documented: true,
    safeguards_implemented: true,
    data_protection_documented: true,
  },
  detect: {
    monitoring_established: true,
    anomalous_activity_detection: true,
    cybersecurity_events_logged: true,
  },
  respond: {
    response_plan_documented: true,
    incident_response_process: true,
    communication_process: true,
  },
  recover: {
    recovery_plan_documented: true,
    recovery_process: true,
    lessons_learned_process: true,
  },
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

function csfFacts(overrides: Partial<BaselineFacts> = {}): BaselineFacts {
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
    regulatory_applicability: ['NIST_CSF_2'],
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

describe('NIST CSF 2.0 Pack #10', () => {
  it('Authority is FRAMEWORK with legal_authority false', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistCsf2)!;
    expect(auth.id).toBe('auth_nist_csf_2');
    expect(auth.type).toBe('FRAMEWORK');
    expect(auth.version).toBe('2.0');
    expect(auth.effective_date).toBe('2024-02-26');
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.source_reference).toMatch(/nist\.gov|CSF 2\.0|CSWP 29/i);
    expect(getAuthorityForPack('pack_nist_csf_2')?.id).toBe(POLICY_AUTHORITY_IDS.nistCsf2);
  });

  it('Pack registration and applicability skip', () => {
    expect(listDomainPackIds('ai_risk')).toContain('pack_nist_csf_2');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['nist_csf_2_pack_v1', 'nist_csf_2_pack_v1_output']),
    );
    expect(compileNistCsf2Pack().pack_id).toBe(NIST_CSF_2_PACK_META.pack_id);
    expect(nistCsf2PackContribution().packs[0]?.authority_id).toBe(
      POLICY_AUTHORITY_IDS.nistCsf2,
    );
    expect(NIST_CSF_2_RULES.length).toBeGreaterThanOrEqual(13);

    const skip = applyNistCsf2PackV1Input(
      baseAllow(),
      csfFacts({ regulatory_applicability: ['SOC_2'] }),
    );
    expect(skip.matched).toContain('nist_csf_2_pack_v1_skip_not_applicable');
  });

  it('Missing vs satisfied cybersecurity evidence', () => {
    expect(applyNistCsf2PackV1Input(baseAllow(), csfFacts()).decision).toBe('REVIEW');
    expect(applyNistCsf2PackV1Input(baseAllow(), csfFacts()).reason_codes).toContain(
      'NIST_CSF_2_GOVERN_ACCOUNTABILITY_REVIEW',
    );

    const ok = applyNistCsf2PackV1Input(
      baseAllow(),
      csfFacts({ governance_context: { cybersecurity: CYBERSECURITY_ALL } }),
    );
    expect(ok.decision).toBe('ALLOW');
    expect(ok.reason_codes).toContain('NIST_CSF_2_CONTROLS_SATISFIED');
    expect(ok.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('Individual CSF Function families → REVIEW when missing', () => {
    const cases: Array<{
      patch: CybersecurityGovernanceEvidence;
      code: string;
    }> = [
      {
        patch: {
          ...CYBERSECURITY_ALL,
          govern: { ...CYBERSECURITY_ALL.govern!, accountability_documented: false },
        },
        code: 'NIST_CSF_2_GOVERN_ACCOUNTABILITY_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          govern: { ...CYBERSECURITY_ALL.govern!, cybersecurity_policy_documented: false },
        },
        code: 'NIST_CSF_2_GOVERN_POLICY_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          identify: { ...CYBERSECURITY_ALL.identify!, assets_identified: false },
        },
        code: 'NIST_CSF_2_IDENTIFY_ASSETS_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          identify: { ...CYBERSECURITY_ALL.identify!, cybersecurity_risk_identified: false },
        },
        code: 'NIST_CSF_2_IDENTIFY_RISK_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          protect: { ...CYBERSECURITY_ALL.protect!, safeguards_implemented: false },
        },
        code: 'NIST_CSF_2_PROTECT_ACCESS_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          protect: { ...CYBERSECURITY_ALL.protect!, data_protection_documented: false },
        },
        code: 'NIST_CSF_2_PROTECT_DATA_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          detect: { ...CYBERSECURITY_ALL.detect!, monitoring_established: false },
        },
        code: 'NIST_CSF_2_DETECT_MONITORING_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          detect: { ...CYBERSECURITY_ALL.detect!, cybersecurity_events_logged: false },
        },
        code: 'NIST_CSF_2_DETECT_EVENTS_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          respond: { ...CYBERSECURITY_ALL.respond!, incident_response_process: false },
        },
        code: 'NIST_CSF_2_RESPOND_PLAN_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          respond: { ...CYBERSECURITY_ALL.respond!, communication_process: false },
        },
        code: 'NIST_CSF_2_RESPOND_COMMUNICATION_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          recover: { ...CYBERSECURITY_ALL.recover!, recovery_process: false },
        },
        code: 'NIST_CSF_2_RECOVER_PLAN_REVIEW',
      },
      {
        patch: {
          ...CYBERSECURITY_ALL,
          recover: { ...CYBERSECURITY_ALL.recover!, lessons_learned_process: false },
        },
        code: 'NIST_CSF_2_RECOVER_IMPROVEMENT_REVIEW',
      },
    ];
    for (const c of cases) {
      const result = applyNistCsf2PackV1Input(
        baseAllow(),
        csfFacts({ governance_context: { cybersecurity: c.patch } }),
      );
      expect(result.decision).toBe('REVIEW');
      expect(result.reason_codes).toContain(c.code);
    }
  });

  it('Provenance + no certification language', () => {
    const src = NIST_CSF_2_PROVENANCE_GRAPH.sources.src_nist_csf_2_0!;
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.nistCsf2);
    expect(src.authority_type).toBe('FRAMEWORK');
    expect(src.legal_authority).toBe(false);
    expect(src.citation).toMatch(/CSF 2\.0/i);

    const applied = applyNistCsf2PackV1Input(
      baseAllow(),
      csfFacts({ governance_context: { cybersecurity: CYBERSECURITY_ALL } }),
    );
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
      evaluation_id: 'eval_csf',
      fail_closed: false,
    } as PolicyDecision);
    const narrative = explained.explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/NIST CSF certified|NIST CSF compliant|CSF scored/i);
  });

  it('Multi-pack independence + unresolved conflict', () => {
    for (const [pack_id, policy_id, code] of [
      ['pack_nist_ai_rmf', 'pol_nist_ai_rmf_input', 'NIST_RMF_GOVERNANCE_DOCUMENTED'],
      ['pack_owasp_llm_2025', 'pol_owasp_llm_2025_input', 'OWASP_LLM_2025_CONTROLS_SATISFIED'],
      ['pack_iso_42001', 'pol_iso_42001_input', 'ISO42001_CONTROLS_SATISFIED'],
      ['pack_iso_23894', 'pol_iso_23894_input', 'ISO23894_CONTROLS_SATISFIED'],
      ['pack_iso_42005', 'pol_iso_42005_input', 'ISO42005_CONTROLS_SATISFIED'],
      ['pack_soc2', 'pol_soc2_input', 'SOC2_CONTROLS_SATISFIED'],
      ['pack_eu_ai_act', 'pol_eu_ai_act_input', 'EU_AI_ACT_MINIMAL_OR_NO_RISK'],
      ['pack_hipaa', 'pol_hipaa_phi_local', 'HIPAA_ALLOW'],
      ['pack_42_cfr_part_2', 'pol_part2_sud_records', 'PART2_ALLOW'],
    ] as const) {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: 'pack_nist_csf_2',
          policy_id: 'pol_nist_csf_2_input',
          decision: 'ALLOW',
          reason_codes: ['NIST_CSF_2_CONTROLS_SATISFIED'],
        }),
        contrib({ pack_id, policy_id, decision: 'ALLOW', reason_codes: [code] }),
      ]);
      expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
    }

    const conflict = resolvePackContributions([
      contrib({
        pack_id: 'pack_nist_csf_2',
        policy_id: 'pol_nist_csf_2_input',
        decision: 'ALLOW',
        reason_codes: ['NIST_CSF_2_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'DENY',
        reason_codes: ['HIPAA_DENY'],
      }),
    ]);
    expect(conflict.resolution.category).toBe('UNRESOLVED');
    expect(conflict.decision).toBe('REVIEW');
    expect(conflict.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
  });

  it('CSF ALLOW + other REVIEW → REVIEW; DENY contribution wins via unresolved/restrictive path', () => {
    const withReview = resolvePackContributions([
      contrib({
        pack_id: 'pack_nist_csf_2',
        policy_id: 'pol_nist_csf_2_input',
        decision: 'ALLOW',
        reason_codes: ['NIST_CSF_2_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_iso_42005',
        policy_id: 'pol_iso_42005_input',
        decision: 'REVIEW',
        reason_codes: ['ISO42005_IMPACT_ASSESSMENT_REVIEW'],
      }),
    ]);
    expect(withReview.decision).toBe('REVIEW');
  });

  it('Historical evaluation + live path + context isolation', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_CSF_2'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2024-06-01',
      governance_context: { cybersecurity: CYBERSECURITY_ALL },
      request_id: 'req_csf_hist',
    });
    expect(decision.reason_codes).toContain('NIST_CSF_2_CONTROLS_SATISFIED');
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
      regulatory_applicability: ['NIST_CSF_2'],
      governance_context: { cybersecurity: CYBERSECURITY_ALL },
    });
    expect(live).toBeTruthy();

    const mixed = applyNistCsf2PackV1Input(
      baseAllow(),
      csfFacts({
        governance_context: {
          cybersecurity: CYBERSECURITY_ALL,
          assurance: { control_environment_documented: false },
          security_controls: { prompt_injection_controls: false },
          impact: { impact_assessment_completed: false },
        },
      }),
    );
    expect(mixed.decision).toBe('ALLOW');
    expect(mixed.reason_codes).toContain('NIST_CSF_2_CONTROLS_SATISFIED');
  });

  it('Ten-authority PDP through generic engine', async () => {
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
          'REGULATORY_APPLICABILITY:SOC_2',
          'REGULATORY_APPLICABILITY:NIST_CSF_2',
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
        management_system: {
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
        },
        ai_risk: {
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
        },
        impact: {
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
        },
        assurance: {
          control_environment_documented: true,
          access_controls_verified: true,
          change_management_controls_verified: true,
          logical_access_controls_verified: true,
          data_protection_controls_verified: true,
          system_monitoring_controls_verified: true,
          incident_response_controls_verified: true,
          availability_controls_verified: true,
          processing_integrity_controls_verified: true,
          confidentiality_controls_verified: true,
        },
        cybersecurity: CYBERSECURITY_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_ten_auth',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('NIST_CSF_2_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.nistCsf2)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.soc2)).toBe(true);
  });

  it('Gate derivation + anti-regression', () => {
    const gates = deriveNistCsf2Gates(csfFacts());
    expect(gates.govern_accountability).toBe(false);
    expect(gates.recover_improvement).toBe(false);

    const forbidden = [
      'NistCsfEvaluator',
      'NistCsfEngine',
      'NistCsfResolver',
      'NistCsfGateway',
      'NistCsfScore',
      'NistCsfDashboard',
      'NistCsfAssessmentEngine',
    ];
    const root = resolve(process.cwd(), 'src');
    for (const name of forbidden) {
      expect(
        existsSync(resolve(root, `policy/enterprise/packs/nist-csf-2/${name}.ts`)),
      ).toBe(false);
    }
    const packSrc = readFileSync(
      resolve(root, 'policy/enterprise/packs/nist-csf-2/pack.ts'),
      'utf8',
    );
    expect(packSrc).not.toMatch(/NistCsfEvaluator|Date\.now\s*\(/);
  });

  it('Does not infer NIST_CSF_2 from app name', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user,
      application: { ...app, name: 'NIST CSF Cybersecurity Platform' },
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: [],
      },
      deploymentMode: 'connected',
      request_id: 'req_csf_no_infer',
    });
    expect(decision.reason_codes.some((c) => c.startsWith('NIST_CSF_2_'))).toBe(false);
  });
});
