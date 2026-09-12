import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NIST_PRIVACY_FRAMEWORK_PACK_META,
  NIST_PRIVACY_FRAMEWORK_PROVENANCE_GRAPH,
  NIST_PRIVACY_FRAMEWORK_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyNistPrivacyFrameworkPackV1Input,
  assertResumeEligible,
  buildHumanResolution,
  compileNistPrivacyFrameworkPack,
  customerVerificationLabel,
  deriveNistPrivacyFrameworkGates,
  ensureDefaultOverlayRegistry,
  executionAfterAuthorize,
  getAuthorityForPack,
  getPolicyAuthority,
  isEligibleForHumanReview,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  nistPrivacyFrameworkPackContribution,
  projectEnforcementResult,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withHumanResolution,
  withOperatorExplanation,
  type BaselineFacts,
  type HeldRequestSnapshot,
  type InterpretedResult,
  type PackEvaluationContribution,
  type PolicyEvaluationRecord,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import type { NistPrivacyFrameworkEvidence } from '../../src/policy/types.js';
import { PRIVACY_ALL } from './iso-27701.test.js';

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

export const NIST_PF_ALL: NistPrivacyFrameworkEvidence = {
  identify: {
    processing_context_documented: true,
    privacy_risk_identified: true,
    data_actions_documented: true,
  },
  govern: {
    policies_documented: true,
    roles_documented: true,
    risk_governance_documented: true,
  },
  control: {
    data_actions_controlled: true,
    individual_choice_addressed: true,
  },
  communicate: {
    transparency_documented: true,
    expectations_documented: true,
  },
  protect: {
    privacy_risk_mitigation_documented: true,
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

function pfFacts(
  nist_pf?: NistPrivacyFrameworkEvidence,
  extras: Partial<BaselineFacts & { regulatory_applicability?: string[] }> = {},
): BaselineFacts & { regulatory_applicability?: string[] } {
  return {
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
      reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
    },
    deploymentMode: 'connected',
    regulatory_applicability: ['NIST_PRIVACY_FRAMEWORK'],
    governance_context: nist_pf ? { privacy: { nist_pf } } : undefined,
    ...extras,
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

function sampleReview(
  overrides: Partial<PolicyEvaluationRecord> = {},
): PolicyEvaluationRecord {
  return {
    evaluation_id: 'eval_nist_pf_review',
    request_id: 'req_nist_pf_review',
    phase: 'input',
    subject: {},
    resource: {},
    action: 'SUMMARIZE',
    context: {},
    ai_context: {},
    evidence_in: {},
    decision: 'REVIEW',
    reason_codes: ['NIST_PF_IDENTIFY_DATA_PROCESSING_REVIEW'],
    applicable_policies: [
      {
        policy_id: 'pol_nist_privacy_framework_input',
        version: 1,
        pack_id: 'pack_nist_privacy_framework',
      },
    ],
    obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: 'missing NIST PF identify evidence',
    },
    created_at: '2026-09-07T18:00:00.000Z',
    ...overrides,
  } as PolicyEvaluationRecord;
}

describe('NIST Privacy Framework Pack #14', () => {
  it('registers authority + pack (FRAMEWORK 1.0, non-legal, 2020-01-16)', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistPrivacyFramework)!;
    expect(auth.id).toBe('auth_nist_privacy_framework');
    expect(auth.type).toBe('FRAMEWORK');
    expect(auth.version).toBe('1.0');
    expect(auth.effective_date).toBe('2020-01-16');
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.provenance.legal_authority).toBe(false);
    expect(getAuthorityForPack('pack_nist_privacy_framework')?.id).toBe(
      POLICY_AUTHORITY_IDS.nistPrivacyFramework,
    );
    expect(listDomainPackIds('ai_risk')).toContain('pack_nist_privacy_framework');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining([
        'nist_privacy_framework_pack_v1',
        'nist_privacy_framework_pack_v1_output',
      ]),
    );
    expect(compileNistPrivacyFrameworkPack().pack_id).toBe(
      NIST_PRIVACY_FRAMEWORK_PACK_META.pack_id,
    );
    expect(nistPrivacyFrameworkPackContribution().packs[0]?.pack_id).toBe(
      'pack_nist_privacy_framework',
    );
  });

  it('applicability skip; missing → REVIEW; satisfied → ALLOW + NIST_PF_CONTROLS_SATISFIED', () => {
    const skip = applyNistPrivacyFrameworkPackV1Input(baseAllow(), {
      ...pfFacts(),
      regulatory_applicability: [],
    });
    expect(skip.matched).toContain('nist_privacy_framework_pack_v1_skip_not_applicable');

    const missing = applyNistPrivacyFrameworkPackV1Input(baseAllow(), pfFacts());
    expect(missing.decision).toBe('REVIEW');
    expect(missing.reason_codes).toContain('NIST_PF_IDENTIFY_DATA_PROCESSING_REVIEW');

    const ok = applyNistPrivacyFrameworkPackV1Input(baseAllow(), pfFacts(NIST_PF_ALL));
    expect(ok.decision).toBe('ALLOW');
    expect(ok.reason_codes).toContain('NIST_PF_CONTROLS_SATISFIED');
    expect(ok.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('ISO 27701 PRIVACY_ALL alone does NOT satisfy NIST PF (and vice versa)', async () => {
    const isoOnly = applyNistPrivacyFrameworkPackV1Input(
      baseAllow(),
      pfFacts(undefined, {
        governance_context: { privacy: PRIVACY_ALL },
      }),
    );
    expect(isoOnly.decision).toBe('REVIEW');
    expect(isoOnly.reason_codes).toContain('NIST_PF_IDENTIFY_DATA_PROCESSING_REVIEW');
    expect(isoOnly.reason_codes).not.toContain('NIST_PF_CONTROLS_SATISFIED');

    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const nistOnlyOnIso = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27701'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: { nist_pf: NIST_PF_ALL } },
      request_id: 'req_pf_vs_27701',
    });
    expect(nistOnlyOnIso.reason_codes).not.toContain('ISO27701_CONTROLS_SATISFIED');
    expect(nistOnlyOnIso.decision).toBe('REVIEW');
  });

  it('complementary with ISO 27701 when both apply with both evidence namespaces', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK',
          'REGULATORY_APPLICABILITY:ISO_27701',
        ],
      },
      deploymentMode: 'connected',
      governance_context: {
        privacy: { ...PRIVACY_ALL, nist_pf: NIST_PF_ALL },
      },
      request_id: 'req_pf_27701_comp',
    });
    expect(decision.reason_codes).toContain('NIST_PF_CONTROLS_SATISFIED');
    expect(decision.reason_codes).toContain('ISO27701_CONTROLS_SATISFIED');
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.nistPrivacyFramework)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27701)).toBe(true);
  });

  it('HIPAA / EU AI Act / OWASP / NIST AI RMF / ISO 42001 multi-pack distinctness', () => {
    for (const [pack_id, policy_id, code] of [
      ['pack_hipaa', 'pol_hipaa_phi_local', 'HIPAA_ALLOW'],
      ['pack_eu_ai_act', 'pol_eu_ai_act_input', 'EU_AI_ACT_MINIMAL_OR_NO_RISK'],
      ['pack_owasp_llm_2025', 'pol_owasp_llm_2025_input', 'OWASP_LLM_2025_CONTROLS_SATISFIED'],
      ['pack_nist_ai_rmf', 'pol_nist_ai_rmf_input', 'NIST_RMF_GOVERNANCE_DOCUMENTED'],
      ['pack_iso_42001', 'pol_iso_42001_input', 'ISO42001_CONTROLS_SATISFIED'],
    ] as const) {
      const resolved = resolvePackContributions([
        contrib({
          pack_id: 'pack_nist_privacy_framework',
          policy_id: 'pol_nist_privacy_framework_input',
          decision: 'ALLOW',
          reason_codes: ['NIST_PF_CONTROLS_SATISFIED'],
        }),
        contrib({ pack_id, policy_id, decision: 'ALLOW', reason_codes: [code] }),
      ]);
      expect(resolved.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
      expect(getAuthorityForPack('pack_nist_privacy_framework')!.id).not.toBe(
        getAuthorityForPack(pack_id)!.id,
      );
      expect(resolved.reason_codes).toEqual(
        expect.arrayContaining(['NIST_PF_CONTROLS_SATISFIED', code]),
      );
    }
  });

  it('unresolved conflict; terminal DENY not human-review eligible; human AUTHORIZE/DENY + resume', () => {
    const unresolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_nist_privacy_framework',
        policy_id: 'pol_nist_privacy_framework_input',
        decision: 'ALLOW',
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'DENY',
      }),
    ]);
    expect(unresolved.resolution.category).toBe('RESTRICTIVE');
    expect(unresolved.decision).toBe('DENY');
    expect(unresolved.reason_codes).toContain('RESOLUTION_CONSEQUENCE_DENY');

    const review = sampleReview();
    const authorized = withHumanResolution(
      review,
      buildHumanResolution(review, {
        disposition: 'AUTHORIZE',
        reason: 'accepted NIST PF compensating evidence',
        resolved_by: 'privacy_officer',
      }),
    );
    expect(authorized.decision).toBe('REVIEW');
    expect(authorized.human_resolution?.final_decision).toBe('ALLOW');

    const denied = withHumanResolution(
      review,
      buildHumanResolution(review, {
        disposition: 'DENY',
        reason: 'privacy-risk evidence insufficient',
        resolved_by: 'privacy_officer',
      }),
    );
    expect(denied.human_resolution?.final_decision).toBe('DENY');
    expect(() => assertResumeEligible(denied)).toThrow(/DENY_CANNOT_RESUME|cannot resume/i);

    const machineDeny = sampleReview({
      decision: 'DENY',
      reason_codes: ['HIPAA_DENY'],
    });
    expect(isEligibleForHumanReview(machineDeny)).toBe(false);

    const held: HeldRequestSnapshot = {
      version: 1,
      application_id: app.application_id,
      organization_id: 'o1',
      user_id: user.user_id,
      operation: 'summarize',
      model: 'local-general-v1',
      messages: [{ role: 'user', content: 'note' }],
      correlation_id: 'cor_nist_pf',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
      },
      allowed_models: ['local-general-v1'],
      available_models: ['local-general-v1'],
    };
    const heldReview = sampleReview({ held_request: held });
    const resolution = buildHumanResolution(heldReview, {
      disposition: 'AUTHORIZE',
      reason: 'documented NIST PF compensating controls',
      resolved_by: 'privacy_officer',
    });
    const resumed = {
      ...withHumanResolution(heldReview, resolution),
      execution: executionAfterAuthorize({
        ...withHumanResolution(heldReview, resolution),
      }),
    };
    expect(resumed.execution?.status).toBe('AUTHORIZED_NOT_RESUMED');
    expect(() => assertResumeEligible(resumed)).not.toThrow();
  });

  it('simulation NOT_EXECUTED via evaluation_phase; historical evaluation_as_of', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);

    const sim = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: { nist_pf: NIST_PF_ALL } },
      evaluation_phase: 'simulate',
      request_id: 'req_nist_pf_sim',
    });
    const simStored = repo.getEvaluation(sim.evaluation_id!)!;
    expect(simStored.phase).toBe('simulate');
    expect(customerVerificationLabel(projectEnforcementResult(simStored, null))).toBe(
      'NOT_EXECUTED',
    );

    const hist = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2020-01-16',
      governance_context: { privacy: { nist_pf: NIST_PF_ALL } },
      request_id: 'req_nist_pf_hist',
    });
    expect(hist.reason_codes).toContain('NIST_PF_CONTROLS_SATISFIED');
    expect(repo.getEvaluation(hist.evaluation_id!)?.evaluation_id).toBe(hist.evaluation_id);
  });

  it('no certification claims language; provenance CSWP 10', async () => {
    const src = NIST_PRIVACY_FRAMEWORK_PROVENANCE_GRAPH.sources.src_nist_privacy_framework_1_0;
    expect(src.legal_authority).toBe(false);
    expect(src.citation).toMatch(/CSWP 10/i);
    expect(deriveNistPrivacyFrameworkGates(pfFacts(NIST_PF_ALL)).identify_processing).toBe(
      true,
    );

    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const ok = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_PRIVACY_FRAMEWORK'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: { nist_pf: NIST_PF_ALL } },
      request_id: 'req_nist_pf_nocert',
    });
    const blob = JSON.stringify(withOperatorExplanation(ok));
    expect(blob).not.toMatch(
      /NIST certified|NIST Privacy Framework certified|NIST Privacy Framework compliant|privacy score|PrivacyScore|certification achieved/i,
    );
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.nistPrivacyFramework)!;
    expect(auth.provenance.notes ?? '').toMatch(/not.*certification|not.*GDPR|not.*DSAR/i);
  });

  it('architecture anti-regression: no NistPrivacyEvaluator/PrivacyScore; pack.ts no Date.now(); 13 rules', () => {
    expect(NIST_PRIVACY_FRAMEWORK_RULES).toHaveLength(13);
    expect(
      Object.values(deriveNistPrivacyFrameworkGates(pfFacts(NIST_PF_ALL))).every(Boolean),
    ).toBe(true);
    for (const name of [
      'NistPrivacyEvaluator',
      'NistPrivacyEngine',
      'NistPrivacyResolver',
      'NistPrivacyGateway',
      'NistPrivacyDashboard',
      'PrivacyScore',
      'PrivacyAssessmentEngine',
      'PrivacyScoreEngine',
    ]) {
      expect(existsSync(resolve(process.cwd(), `src/policy/enterprise/${name}.ts`))).toBe(
        false,
      );
    }
    const packSrc = readFileSync(
      resolve(process.cwd(), 'src/policy/enterprise/packs/nist-privacy-framework/pack.ts'),
      'utf8',
    );
    expect(packSrc).not.toMatch(
      /NistPrivacyEvaluator|PrivacyScore|PrivacyAssessmentEngine|Date\.now\s*\(/,
    );
    expect(
      existsSync(resolve(process.cwd(), 'policy-packs/nist-privacy-framework/manifest.json')),
    ).toBe(true);
  });
});
