import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  SOC2_PACK_META,
  SOC2_PROVENANCE_GRAPH,
  SOC2_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applySoc2PackV1Input,
  compileSoc2Pack,
  deriveSoc2AssuranceGates,
  ensureDefaultOverlayRegistry,
  getAuthorityForPack,
  getPolicyAuthority,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  resolvePackContributions,
  soc2PackContribution,
  treatsAsLegalAuthority,
  withOperatorExplanation,
  type BaselineFacts,
  type InterpretedResult,
  type PackEvaluationContribution,
  type PolicyDecision,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import type {
  AssuranceControlEvidence,
  ImpactAssessmentEvidence,
  ManagementSystemEvidence,
  AiRiskManagementEvidence,
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

/** Core assurance evidence (privacy not in scope by default). */
export const ASSURANCE_ALL: AssuranceControlEvidence = {
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
};

const IMPACT_ALL: ImpactAssessmentEvidence = {
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

function soc2Facts(overrides: Partial<BaselineFacts> = {}): BaselineFacts {
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
    regulatory_applicability: ['SOC_2'],
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

describe('SOC 2 / AICPA Trust Services Criteria Pack #9', () => {
  it('1–3. Authority is FRAMEWORK with legal_authority false', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.soc2)!;
    expect(auth.id).toBe('auth_soc2');
    expect(auth.type).toBe('FRAMEWORK');
    expect(auth.publisher).toMatch(/AICPA/i);
    expect(auth.version).toMatch(/2017 TSC/i);
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.source_reference).toMatch(/aicpa-cima\.com|TSP Section 100/i);
    expect(getAuthorityForPack('pack_soc2')?.id).toBe(POLICY_AUTHORITY_IDS.soc2);
  });

  it('4–5. Pack registration and applicability skip', () => {
    expect(listDomainPackIds('ai_risk')).toContain('pack_soc2');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['soc2_pack_v1', 'soc2_pack_v1_output']),
    );
    expect(compileSoc2Pack().pack_id).toBe(SOC2_PACK_META.pack_id);
    expect(soc2PackContribution().packs[0]?.authority_id).toBe(POLICY_AUTHORITY_IDS.soc2);
    expect(SOC2_RULES.length).toBeGreaterThanOrEqual(12);

    const skip = applySoc2PackV1Input(
      baseAllow(),
      soc2Facts({ regulatory_applicability: ['ISO_42005'] }),
    );
    expect(skip.matched).toContain('soc2_pack_v1_skip_not_applicable');
  });

  it('6–7. Missing vs satisfied assurance evidence', () => {
    expect(applySoc2PackV1Input(baseAllow(), soc2Facts()).decision).toBe('REVIEW');
    expect(applySoc2PackV1Input(baseAllow(), soc2Facts()).reason_codes).toContain(
      'SOC2_CONTROL_ENVIRONMENT_REVIEW',
    );

    const ok = applySoc2PackV1Input(
      baseAllow(),
      soc2Facts({ governance_context: { assurance: ASSURANCE_ALL } }),
    );
    expect(ok.decision).toBe('ALLOW');
    expect(ok.reason_codes).toContain('SOC2_CONTROLS_SATISFIED');
    expect(ok.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('8–17. Individual missing gates → REVIEW; privacy only when applicable', () => {
    const cases: Array<{ patch: Partial<AssuranceControlEvidence>; code: string }> = [
      {
        patch: { ...ASSURANCE_ALL, control_environment_documented: false },
        code: 'SOC2_CONTROL_ENVIRONMENT_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, access_controls_verified: false },
        code: 'SOC2_ACCESS_CONTROLS_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, change_management_controls_verified: false },
        code: 'SOC2_CHANGE_MANAGEMENT_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, logical_access_controls_verified: false },
        code: 'SOC2_LOGICAL_ACCESS_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, data_protection_controls_verified: false },
        code: 'SOC2_DATA_PROTECTION_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, system_monitoring_controls_verified: false },
        code: 'SOC2_MONITORING_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, incident_response_controls_verified: false },
        code: 'SOC2_INCIDENT_RESPONSE_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, availability_controls_verified: false },
        code: 'SOC2_AVAILABILITY_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, processing_integrity_controls_verified: false },
        code: 'SOC2_PROCESSING_INTEGRITY_REVIEW',
      },
      {
        patch: { ...ASSURANCE_ALL, confidentiality_controls_verified: false },
        code: 'SOC2_CONFIDENTIALITY_REVIEW',
      },
    ];
    for (const c of cases) {
      const result = applySoc2PackV1Input(
        baseAllow(),
        soc2Facts({ governance_context: { assurance: c.patch } }),
      );
      expect(result.decision).toBe('REVIEW');
      expect(result.reason_codes).toContain(c.code);
    }

    // Privacy not assumed — without privacy_category_applicable, CONTROLS_SATISFIED still works
    const noPrivacy = applySoc2PackV1Input(
      baseAllow(),
      soc2Facts({ governance_context: { assurance: ASSURANCE_ALL } }),
    );
    expect(noPrivacy.decision).toBe('ALLOW');

    const privacyMissing = applySoc2PackV1Input(
      baseAllow(),
      soc2Facts({
        governance_context: {
          assurance: {
            ...ASSURANCE_ALL,
            privacy_category_applicable: true,
            privacy_controls_verified: false,
          },
        },
      }),
    );
    expect(privacyMissing.decision).toBe('REVIEW');
    expect(privacyMissing.reason_codes).toContain('SOC2_PRIVACY_REVIEW');
  });

  it('18–20. Provenance with TSC citations; no certification language', () => {
    const src = SOC2_PROVENANCE_GRAPH.sources.src_aicpa_trust_services_criteria!;
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.soc2);
    expect(src.authority_type).toBe('FRAMEWORK');
    expect(src.legal_authority).toBe(false);
    const obl = SOC2_PROVENANCE_GRAPH.obligations['SOC2-OBL-ACCESS-CONTROLS']!;
    expect(obl.citations.some((c) => /access/i.test(c))).toBe(true);

    const applied = applySoc2PackV1Input(
      baseAllow(),
      soc2Facts({ governance_context: { assurance: ASSURANCE_ALL } }),
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
      evaluation_id: 'eval_soc2',
      fail_closed: false,
    } as PolicyDecision);
    const narrative = explained.explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/SOC 2 certified|SOC 2 compliant|audit passed/i);
  });

  it('21–27. Multi-pack independence with ISO / NIST / OWASP / EU / HIPAA / Part2', () => {
    for (const [pack_id, policy_id, code] of [
      ['pack_iso_42001', 'pol_iso_42001_input', 'ISO42001_CONTROLS_SATISFIED'],
      ['pack_iso_23894', 'pol_iso_23894_input', 'ISO23894_CONTROLS_SATISFIED'],
      ['pack_iso_42005', 'pol_iso_42005_input', 'ISO42005_CONTROLS_SATISFIED'],
      ['pack_nist_ai_rmf', 'pol_nist_ai_rmf_input', 'NIST_RMF_GOVERNANCE_DOCUMENTED'],
      ['pack_owasp_llm_2025', 'pol_owasp_llm_2025_input', 'OWASP_LLM_2025_CONTROLS_SATISFIED'],
      ['pack_hipaa', 'pol_hipaa_phi_local', 'HIPAA_ALLOW'],
      ['pack_42_cfr_part_2', 'pol_part2_sud_records', 'PART2_ALLOW'],
      ['pack_eu_ai_act', 'pol_eu_ai_act_input', 'EU_AI_ACT_MINIMAL_OR_NO_RISK'],
    ] as const) {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: 'pack_soc2',
          policy_id: 'pol_soc2_input',
          decision: 'ALLOW',
          reason_codes: ['SOC2_CONTROLS_SATISFIED'],
        }),
        contrib({ pack_id, policy_id, decision: 'ALLOW', reason_codes: [code] }),
      ]);
      expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
      expect(getAuthorityForPack('pack_soc2')!.id).not.toBe(getAuthorityForPack(pack_id)!.id);
    }
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_soc2')!)).toBe(false);
    expect(treatsAsLegalAuthority(getAuthorityForPack('pack_eu_ai_act')!)).toBe(true);
  });

  it('28. Unresolved conflict → REVIEW (no SOC 2 precedence)', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_soc2',
        policy_id: 'pol_soc2_input',
        decision: 'ALLOW',
        reason_codes: ['SOC2_CONTROLS_SATISFIED'],
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

  it('29–33. Historical evaluation + live path + context isolation', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:SOC_2'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2024-06-01',
      governance_context: { assurance: ASSURANCE_ALL },
      request_id: 'req_soc2_hist',
    });
    expect(decision.reason_codes).toContain('SOC2_CONTROLS_SATISFIED');
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
      regulatory_applicability: ['SOC_2'],
      governance_context: { assurance: ASSURANCE_ALL },
    });
    expect(live).toBeTruthy();

    // Assurance does not overwrite impact/ai_risk/management_system
    const mixed = applySoc2PackV1Input(
      baseAllow(),
      soc2Facts({
        governance_context: {
          assurance: ASSURANCE_ALL,
          impact: { impact_assessment_completed: false },
          ai_risk: { risk_management_established: false },
          management_system: { ai_policy_established: false },
        },
      }),
    );
    expect(mixed.decision).toBe('ALLOW');
    expect(mixed.reason_codes).toContain('SOC2_CONTROLS_SATISFIED');
  });

  it('36. Nine-authority PDP through generic engine', async () => {
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
        assurance: ASSURANCE_ALL,
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_nine_auth',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('SOC2_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.soc2)).toBe(true);
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42005)).toBe(true);
  });

  it('Gate derivation does not invent assurance evidence', () => {
    const gates = deriveSoc2AssuranceGates(soc2Facts());
    expect(gates.control_environment_documented).toBe(false);
    expect(gates.privacy_category_applicable).toBe(false);
  });

  it('No SOC 2-specific evaluator/resolver/engine/certification artifacts', () => {
    const forbidden = [
      'Soc2Evaluator',
      'Soc2Engine',
      'Soc2Resolver',
      'Soc2Decision',
      'Soc2Gateway',
      'Soc2AssessmentEngine',
      'Soc2ComplianceEngine',
      'Soc2CertificationEngine',
      'Soc2AuditEngine',
      'Soc2Score',
      'Soc2Dashboard',
    ];
    const root = resolve(process.cwd(), 'src');
    for (const name of forbidden) {
      expect(existsSync(resolve(root, `policy/enterprise/packs/soc2/${name}.ts`))).toBe(
        false,
      );
    }
    const packSrc = readFileSync(
      resolve(root, 'policy/enterprise/packs/soc2/pack.ts'),
      'utf8',
    );
    expect(packSrc).not.toMatch(/Soc2Evaluator|Soc2Engine|Soc2Resolver/);
    expect(packSrc).not.toMatch(/\bDate\.now\s*\(/);
  });

  it('Does not infer SOC_2 from company/app name', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user,
      application: { ...app, name: 'Acme SOC 2 Enterprise Cloud' },
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
      request_id: 'req_soc2_no_infer',
    });
    expect(decision.reason_codes.some((c) => c.startsWith('SOC2_'))).toBe(false);
  });
});
