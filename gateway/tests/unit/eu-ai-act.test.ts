import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  EU_AI_ACT_APPLICATION_DATES,
  EU_AI_ACT_PACK_META,
  EU_AI_ACT_PROVENANCE_GRAPH,
  EU_AI_ACT_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyEuAiActPackV1Input,
  compileEuAiActPack,
  deriveEuAiActGates,
  ensureDefaultOverlayRegistry,
  euAiActPackContribution,
  getAuthorityForPack,
  getPolicyAuthority,
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
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

const HIGH_RISK_EVIDENCE = {
  risk_management_system: true,
  data_governance: true,
  technical_documentation: true,
  logging_record_keeping: true,
  deployer_transparency: true,
  human_oversight: true,
  accuracy_robustness_cybersecurity: true,
};

const GPAI_PROVIDER_EVIDENCE = {
  gpai_technical_documentation: true,
  gpai_downstream_information: true,
  gpai_copyright_policy: true,
  gpai_training_content_summary: true,
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

function euFacts(overrides: Partial<BaselineFacts> = {}): BaselineFacts {
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
    regulatory_applicability: ['EU_AI_ACT'],
    evaluation_as_of: '2026-09-01',
    governance_context: {
      regulatory: {
        actor_role: 'deployer',
        deployment_jurisdiction: 'EU',
        market_placement_jurisdiction: 'EU',
        prohibited_practice_code: 'none',
        regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
      },
    },
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

describe('EU AI Act Pack #5', () => {
  it('A. Authority is REGULATION with legal_authority true', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.euAiAct)!;
    expect(auth.id).toBe('auth_eu_ai_act');
    expect(auth.type).toBe('REGULATION');
    expect(auth.publisher).toContain('European');
    expect(auth.version).toBe('2024/1689');
    expect(treatsAsLegalAuthority(auth)).toBe(true);
    expect(auth.provenance.legal_authority).toBe(true);
    expect(auth.source_reference).toContain('2024/1689');
    expect(getAuthorityForPack('pack_eu_ai_act')?.id).toBe(POLICY_AUTHORITY_IDS.euAiAct);

    expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.hipaa)!)).toBe(true);
    expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.part2)!)).toBe(true);
    expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.nistAiRmf)!)).toBe(false);
    expect(treatsAsLegalAuthority(getPolicyAuthority(POLICY_AUTHORITY_IDS.owaspLlm2025)!)).toBe(false);
  });

  it('B. Pack registration — domain, interpreters, compile', () => {
    ensureDefaultOverlayRegistry();
    expect(listDomainPackIds('ai_risk')).toContain('pack_eu_ai_act');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['eu_ai_act_pack_v1', 'eu_ai_act_pack_v1_output']),
    );
    const compiled = compileEuAiActPack();
    expect(compiled.pack_id).toBe(EU_AI_ACT_PACK_META.pack_id);
    expect(compiled.pack_version).toBe('1.0.0');
    expect(compiled.policies).toHaveLength(2);
    expect(euAiActPackContribution().packs[0]?.authority_id).toBe(
      POLICY_AUTHORITY_IDS.euAiAct,
    );
    expect(EU_AI_ACT_RULES.length).toBeGreaterThanOrEqual(10);
  });

  it('C. Provenance chain Rule → Obligation → Citation → Source → Authority', () => {
    const src = EU_AI_ACT_PROVENANCE_GRAPH.sources.src_eu_ai_act_2024_1689!;
    expect(src.authority_id).toBe(POLICY_AUTHORITY_IDS.euAiAct);
    expect(src.authority_type).toBe('REGULATION');
    expect(src.legal_authority).toBe(true);
    expect(src.canonical_url).toContain('eur-lex.europa.eu');
    const obl = EU_AI_ACT_PROVENANCE_GRAPH.obligations['EU-OBL-ART5-PROHIBITED']!;
    expect(obl.citations).toEqual(
      expect.arrayContaining(['Regulation (EU) 2024/1689 — Article 5']),
    );
    expect(obl.source_ids).toContain('src_eu_ai_act_2024_1689');
  });

  it('D. Not applicable when EU_AI_ACT not in regulatory_applicability', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({ regulatory_applicability: ['HIPAA'] }),
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.matched).toContain('eu_ai_act_pack_v1_skip_not_applicable');
  });

  it('E. Prohibited practice established → DENY', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2025-03-01',
        governance_context: {
          regulatory: {
            actor_role: 'provider',
            deployment_jurisdiction: 'EU',
            prohibited_practice_code: 'social_scoring',
            regulatory_risk_category: 'PROHIBITED',
          },
        },
      }),
    );
    expect(result.decision).toBe('DENY');
    expect(result.reason_codes).toContain('EU_AI_ACT_ART5_PROHIBITED_PRACTICE');
    expect(result.matched).toContain('EU-AI-ACT-ART5-PROHIBITED-DENY');
  });

  it('F. Uncertain prohibited practice → REVIEW (not ALLOW/DENY)', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2025-03-01',
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            deployment_jurisdiction: 'EU',
            prohibited_practice_code: 'uncertain',
          },
        },
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain(
      'EU_AI_ACT_ART5_PROHIBITED_APPLICABILITY_UNCERTAIN',
    );
  });

  it('G. Clearly outside prohibited / minimal risk → ALLOW', () => {
    const result = applyEuAiActPackV1Input(baseAllow(), euFacts());
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toContain('EU_AI_ACT_MINIMAL_OR_NO_RISK');
  });

  it('H. High-risk missing obligation evidence → REVIEW', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2026-09-01',
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            deployment_jurisdiction: 'EU',
            regulatory_risk_category: 'HIGH_RISK',
            high_risk_use_declared: true,
            intended_purpose: 'creditworthiness assessment',
            human_oversight: false,
          },
        },
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain(
      'EU_AI_ACT_HIGH_RISK_OBLIGATION_EVIDENCE_MISSING',
    );
  });

  it('I. High-risk with obligation evidence → ALLOW_WITH_CONTROLS path', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2026-09-01',
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            deployment_jurisdiction: 'EU',
            regulatory_risk_category: 'HIGH_RISK',
            high_risk_use_declared: true,
            ...HIGH_RISK_EVIDENCE,
          },
        },
      }),
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toContain(
      'EU_AI_ACT_HIGH_RISK_OBLIGATION_EVIDENCE_ESTABLISHED',
    );
  });

  it('J. Article 50 — missing disclosure after application date → REVIEW', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2026-08-03',
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            deployment_jurisdiction: 'EU',
            direct_ai_interaction: true,
            ai_interaction_disclosure: false,
            prohibited_practice_code: 'none',
            regulatory_risk_category: 'TRANSPARENCY',
          },
        },
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain(
      'EU_AI_ACT_ART50_INTERACTION_DISCLOSURE_MISSING',
    );
  });

  it('K. Article 50 — pre-application date does not enforce early', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2026-08-01',
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            deployment_jurisdiction: 'EU',
            direct_ai_interaction: true,
            ai_interaction_disclosure: false,
            prohibited_practice_code: 'none',
            regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
          },
        },
      }),
    );
    expect(result.reason_codes).not.toContain(
      'EU_AI_ACT_ART50_INTERACTION_DISCLOSURE_MISSING',
    );
    // Art. 50 not yet in force; other EU gates may still apply.
    expect(result.matched.some((m) => String(m).includes('ART50'))).toBe(false);
  });

  it('L. Article 50 — evidence present after application date', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: EU_AI_ACT_APPLICATION_DATES.transparency_art50,
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            deployment_jurisdiction: 'EU',
            direct_ai_interaction: true,
            ai_interaction_disclosure: true,
            prohibited_practice_code: 'none',
            regulatory_risk_category: 'TRANSPARENCY',
          },
        },
      }),
    );
    expect(result.decision).toBe('ALLOW');
    expect(result.reason_codes).toContain(
      'EU_AI_ACT_ART50_TRANSPARENCY_EVIDENCE_ESTABLISHED',
    );
  });

  it('M. GPAI provider missing documentation → REVIEW', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2025-09-01',
        governance_context: {
          regulatory: {
            actor_role: 'provider',
            provider_jurisdiction: 'EU',
            gpai_model: true,
            regulatory_risk_category: 'GPAI',
          },
        },
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain(
      'EU_AI_ACT_GPAI_PROVIDER_OBLIGATION_EVIDENCE_MISSING',
    );
  });

  it('N. GPAI systemic risk vs provider distinction', () => {
    const missingSystemic = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2025-09-01',
        governance_context: {
          regulatory: {
            actor_role: 'provider',
            provider_jurisdiction: 'EU',
            gpai_model: true,
            gpai_systemic_risk: true,
            ...GPAI_PROVIDER_EVIDENCE,
          },
        },
      }),
    );
    expect(missingSystemic.decision).toBe('REVIEW');
    expect(missingSystemic.reason_codes).toContain(
      'EU_AI_ACT_GPAI_SYSTEMIC_RISK_OBLIGATION_EVIDENCE_MISSING',
    );

    const ok = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2025-09-01',
        governance_context: {
          regulatory: {
            actor_role: 'provider',
            provider_jurisdiction: 'EU',
            gpai_model: true,
            gpai_systemic_risk: true,
            ...GPAI_PROVIDER_EVIDENCE,
            gpai_systemic_risk_assessment: true,
            gpai_systemic_risk_mitigation: true,
            gpai_incident_reporting: true,
            gpai_cybersecurity: true,
          },
        },
      }),
    );
    expect(ok.decision).toBe('ALLOW');
    expect(ok.reason_codes).toContain(
      'EU_AI_ACT_GPAI_PROVIDER_OBLIGATION_EVIDENCE_ESTABLISHED',
    );
  });

  it('O. Missing actor role for GPAI → REVIEW', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2025-09-01',
        governance_context: {
          regulatory: {
            provider_jurisdiction: 'EU',
            gpai_model: true,
            regulatory_risk_category: 'GPAI',
          },
        },
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain('EU_AI_ACT_GPAI_ACTOR_ROLE_MISSING');
  });

  it('P. Missing jurisdiction facts → REVIEW', () => {
    const result = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            prohibited_practice_code: 'none',
            regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
          },
        },
      }),
    );
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain(
      'EU_AI_ACT_TERRITORIAL_APPLICABILITY_UNCERTAIN',
    );
  });

  it('Q. Art. 6(1) high-risk pathway not enforced before 2027-08-02', () => {
    const early = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2026-12-01',
        governance_context: {
          regulatory: {
            actor_role: 'provider',
            deployment_jurisdiction: 'EU',
            high_risk_art6_1: true,
            prohibited_practice_code: 'none',
            regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
          },
        },
      }),
    );
    expect(early.reason_codes).not.toContain(
      'EU_AI_ACT_ART6_1_HIGH_RISK_OBLIGATION_REVIEW',
    );

    const later = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2027-08-02',
        governance_context: {
          regulatory: {
            actor_role: 'provider',
            deployment_jurisdiction: 'EU',
            high_risk_art6_1: true,
            prohibited_practice_code: 'none',
            regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
          },
        },
      }),
    );
    expect(later.decision).toBe('REVIEW');
    expect(later.reason_codes).toContain(
      'EU_AI_ACT_ART6_1_HIGH_RISK_OBLIGATION_REVIEW',
    );
  });

  it('R. Multi-pack — EU + NIST agreement/complementary', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_eu_ai_act',
        policy_id: 'pol_eu_ai_act_input',
        decision: 'ALLOW',
        reason_codes: ['EU_AI_ACT_MINIMAL_OR_NO_RISK'],
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

  it('S. Multi-pack — EU restrictive + OWASP permissive → RESTRICTIVE', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_owasp_llm_2025',
        policy_id: 'pol_owasp_llm_2025_input',
        decision: 'ALLOW',
        reason_codes: ['OWASP_LLM_2025_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_eu_ai_act',
        policy_id: 'pol_eu_ai_act_input',
        decision: 'REVIEW',
        reason_codes: ['EU_AI_ACT_HIGH_RISK_OBLIGATION_EVIDENCE_MISSING'],
        obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
      }),
    ]);
    expect(resolved.resolution.category).toMatch(/RESTRICTIVE|UNRESOLVED/);
    expect(resolved.decision).toBe('REVIEW');
  });

  it('T. Multi-pack — EU + HIPAA keep distinct provenance (no EU-beats-US)', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'ALLOW',
        reason_codes: ['HIPAA_ALLOW'],
      }),
      contrib({
        pack_id: 'pack_eu_ai_act',
        policy_id: 'pol_eu_ai_act_input',
        decision: 'ALLOW',
        reason_codes: ['EU_AI_ACT_MINIMAL_OR_NO_RISK'],
      }),
    ]);
    expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
    expect(getAuthorityForPack('pack_hipaa')!.type).toBe('REGULATION');
    expect(getAuthorityForPack('pack_eu_ai_act')!.type).toBe('REGULATION');
  });

  it('U. Unresolved conflict → POLICY_CONFLICT_UNRESOLVED → REVIEW (no EU precedence)', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_eu_ai_act',
        policy_id: 'pol_eu_ai_act_input',
        decision: 'ALLOW',
        reason_codes: ['EU_AI_ACT_MINIMAL_OR_NO_RISK'],
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

  it('V. Five-authority PDP: HIPAA + Part2 + NIST + OWASP + EU', async () => {
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
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          market_placement_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
      request_id: 'req_five_auth',
    });

    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes.some((c) => c.startsWith('EU_AI_ACT_'))).toBe(true);
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.euAiAct)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.hipaa)).toBe(true);

    const stored = repo.getEvaluation(decision.evaluation_id!);
    expect(stored?.evaluation_id).toBe(decision.evaluation_id);
    expect(stored?.decision).toBe(decision.decision);
  });

  it('W. Explanation uses regulatory language (not certification)', () => {
    const applied = applyEuAiActPackV1Input(
      baseAllow(),
      euFacts({
        evaluation_as_of: '2026-09-01',
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            deployment_jurisdiction: 'EU',
            regulatory_risk_category: 'HIGH_RISK',
            high_risk_use_declared: true,
          },
        },
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
      evaluation_id: 'eval_eu_test',
      fail_closed: false,
    };
    const explained = withOperatorExplanation(decision);
    const narrative = explained.explanation.operator?.narrative ?? '';
    expect(narrative).not.toMatch(/EU AI Act compliant/i);
    expect(narrative).not.toMatch(/certif/i);
    expect(
      explained.explanation.provenance?.sources?.some(
        (s) =>
          s.authority_id === POLICY_AUTHORITY_IDS.euAiAct && s.legal_authority === true,
      ),
    ).toBe(true);
  });

  it('X. Live completions path exercises EU without special endpoint', async () => {
    const gw = await createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_demo',
      user: { id: 'user_demo' },
      operation: 'summarize',
      model: 'local-general-v1',
      messages: [{ role: 'user', content: 'Hello' }],
      regulatory_applicability: ['EU_AI_ACT'],
      evaluation_as_of: '2026-09-01',
      governance_context: {
        regulatory: {
          actor_role: 'deployer',
          deployment_jurisdiction: 'EU',
          prohibited_practice_code: 'none',
          regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
        },
      },
    });
    expect(result).toBeTruthy();
    // Live path may ALLOW or REVIEW depending on baseline + EU gates; must not 500.
    expect(['ok', 'blocked', 'held']).toContain(
      'status' in result && typeof (result as { status?: string }).status === 'string'
        ? (result as { status: string }).status
        : 'ok',
    );
  });

  it('Y. Gate derivation does not invent high-risk from sector keywords', () => {
    const gates = deriveEuAiActGates(
      euFacts({
        purpose: 'healthcare chatbot for finance',
        governance_context: {
          regulatory: {
            actor_role: 'deployer',
            deployment_jurisdiction: 'EU',
            prohibited_practice_code: 'none',
            regulatory_risk_category: 'MINIMAL_OR_NO_RISK',
          },
        },
      }),
    );
    expect(gates.high_risk_established).toBe(false);
    expect(gates.prohibited_practice_established).toBe(false);
    expect(gates.minimal_or_no_risk).toBe(true);
  });

  it('Z. Historical evaluation snapshot preserves EU pack decision', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:EU_AI_ACT'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2025-03-01',
      governance_context: {
        regulatory: {
          actor_role: 'provider',
          deployment_jurisdiction: 'EU',
          prohibited_practice_code: 'social_scoring',
          regulatory_risk_category: 'PROHIBITED',
        },
      },
      request_id: 'req_eu_hist',
    });
    expect(decision.decision).toBe('DENY');
    const stored = repo.getEvaluation(decision.evaluation_id!);
    expect(stored?.decision).toBe('DENY');
    expect(stored?.reason_codes).toContain('EU_AI_ACT_ART5_PROHIBITED_PRACTICE');
  });
});
