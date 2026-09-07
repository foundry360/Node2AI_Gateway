import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { computeDecisionHash } from '../../src/audit/decision-binding.js';
import {
  ISO_27701_PACK_META,
  ISO_27701_PROVENANCE_GRAPH,
  ISO_27701_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyIso27701PackV1Input,
  assertResumeEligible,
  buildHumanResolution,
  compileIso27701Pack,
  deriveIso27701Gates,
  ensureDefaultOverlayRegistry,
  executionAfterAuthorize,
  getAuthorityForPack,
  getPolicyAuthority,
  isEligibleForHumanReview,
  iso27701PackContribution,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
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
import type { PrivacyGovernanceEvidence } from '../../src/policy/types.js';
import { INFOSEC_ALL } from './iso-27001.test.js';

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

export const PRIVACY_ALL: PrivacyGovernanceEvidence = {
  processing_role: 'controller',
  purpose_status: 'documented',
  pims: {
    scope_defined: true,
    privacy_context_established: true,
    roles_responsibilities_defined: true,
    privacy_objectives_defined: true,
  },
  pii_governance: {
    pii_processing_inventory_established: true,
    processing_purposes_defined: true,
    processing_roles_defined: true,
    controller_processor_role_defined: true,
    processing_responsibilities_defined: true,
  },
  privacy_risk: {
    privacy_risk_process_established: true,
    privacy_risks_identified: true,
    privacy_risks_assessed: true,
    privacy_risk_treatment_defined: true,
    residual_privacy_risk_reviewed: true,
  },
  privacy_impact: {
    privacy_impact_assessment_established: true,
    potential_impacts_identified: true,
    affected_individuals_considered: true,
    mitigations_defined: true,
    residual_impact_reviewed: true,
  },
  data_lifecycle: {
    collection_governance_established: true,
    use_governance_established: true,
    sharing_governance_established: true,
    retention_governance_established: true,
    deletion_disposal_governance_established: true,
  },
  transparency: {
    privacy_information_provided: true,
    processing_transparency_established: true,
    notice_governance_established: true,
  },
  rights: {
    privacy_rights_process_established: true,
    rights_request_handling_established: true,
    identity_verification_for_rights_established: true,
    response_process_established: true,
  },
  third_party: {
    processor_requirements_defined: true,
    third_party_privacy_requirements_defined: true,
    processor_monitoring_established: true,
  },
  privacy_incident: {
    privacy_incident_process_established: true,
    privacy_breach_response_established: true,
    notification_process_established: true,
  },
  monitoring: {
    privacy_performance_monitored: true,
    privacy_review_established: true,
    management_review_established: true,
  },
  improvement: {
    privacy_nonconformities_managed: true,
    corrective_actions_managed: true,
    continual_improvement_established: true,
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

function privacyFacts(
  p?: PrivacyGovernanceEvidence,
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
      reason_codes: ['REGULATORY_APPLICABILITY:ISO_27701'],
    },
    deploymentMode: 'connected',
    regulatory_applicability: ['ISO_27701'],
    governance_context: p ? { privacy: p } : undefined,
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
    evaluation_id: 'eval_27701_review',
    request_id: 'req_27701_review',
    phase: 'input',
    subject: {},
    resource: {},
    action: 'SUMMARIZE',
    context: {},
    ai_context: {},
    evidence_in: {},
    decision: 'REVIEW',
    reason_codes: ['ISO27701_PIMS_REVIEW'],
    applicable_policies: [
      { policy_id: 'pol_iso_27701_input', version: 1, pack_id: 'pack_iso_27701' },
    ],
    obligations: [{ code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' }],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: 'missing PIMS evidence',
    },
    created_at: '2026-09-07T18:00:00.000Z',
    ...overrides,
  } as PolicyEvaluationRecord;
}

describe('ISO/IEC 27701 Pack #13', () => {
  it('registers authority + pack (STANDARD 2025, non-legal)', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27701)!;
    expect(auth.id).toBe('auth_iso_27701');
    expect(auth.type).toBe('STANDARD');
    expect(auth.version).toBe('2025');
    expect(auth.effective_date).toBe('2025-10-14');
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.provenance.legal_authority).toBe(false);
    expect(getAuthorityForPack('pack_iso_27701')?.id).toBe(POLICY_AUTHORITY_IDS.iso27701);
    expect(listDomainPackIds('ai_risk')).toContain('pack_iso_27701');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['iso_27701_pack_v1', 'iso_27701_pack_v1_output']),
    );
    expect(compileIso27701Pack().pack_id).toBe(ISO_27701_PACK_META.pack_id);
    expect(iso27701PackContribution().packs[0]?.pack_id).toBe('pack_iso_27701');
  });

  it('applicability skip; missing → REVIEW; satisfied → ALLOW path', () => {
    const skip = applyIso27701PackV1Input(baseAllow(), {
      ...privacyFacts(),
      regulatory_applicability: [],
    });
    expect(skip.matched).toContain('iso_27701_pack_v1_skip_not_applicable');

    expect(applyIso27701PackV1Input(baseAllow(), privacyFacts()).decision).toBe('REVIEW');
    expect(applyIso27701PackV1Input(baseAllow(), privacyFacts()).reason_codes).toContain(
      'ISO27701_PIMS_REVIEW',
    );

    const ok = applyIso27701PackV1Input(baseAllow(), privacyFacts(PRIVACY_ALL));
    expect(ok.decision).toBe('ALLOW');
    expect(ok.reason_codes).toContain('ISO27701_CONTROLS_SATISFIED');
    expect(ok.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('each privacy family missing → REVIEW with distinct reason', () => {
    const families: Array<{
      patch: (g: PrivacyGovernanceEvidence) => void;
      code: string;
    }> = [
      {
        patch: (g) => {
          g.pims!.scope_defined = false;
        },
        code: 'ISO27701_PIMS_REVIEW',
      },
      {
        patch: (g) => {
          g.pii_governance!.pii_processing_inventory_established = false;
        },
        code: 'ISO27701_PII_PROCESSING_REVIEW',
      },
      {
        patch: (g) => {
          g.privacy_risk!.residual_privacy_risk_reviewed = false;
        },
        code: 'ISO27701_PRIVACY_RISK_REVIEW',
      },
      {
        patch: (g) => {
          g.privacy_impact!.privacy_impact_assessment_established = false;
        },
        code: 'ISO27701_PRIVACY_IMPACT_REVIEW',
      },
      {
        patch: (g) => {
          g.data_lifecycle!.retention_governance_established = false;
        },
        code: 'ISO27701_DATA_LIFECYCLE_REVIEW',
      },
      {
        patch: (g) => {
          g.transparency!.notice_governance_established = false;
        },
        code: 'ISO27701_TRANSPARENCY_REVIEW',
      },
      {
        patch: (g) => {
          g.rights!.privacy_rights_process_established = false;
        },
        code: 'ISO27701_PRIVACY_RIGHTS_REVIEW',
      },
      {
        patch: (g) => {
          g.pii_governance!.processing_responsibilities_defined = false;
        },
        code: 'ISO27701_CONTROLLER_PROCESSOR_REVIEW',
      },
      {
        patch: (g) => {
          g.third_party!.processor_monitoring_established = false;
        },
        code: 'ISO27701_THIRD_PARTY_REVIEW',
      },
      {
        patch: (g) => {
          g.privacy_incident!.privacy_incident_process_established = false;
        },
        code: 'ISO27701_PRIVACY_INCIDENT_REVIEW',
      },
      {
        patch: (g) => {
          g.monitoring!.management_review_established = false;
        },
        code: 'ISO27701_MONITORING_REVIEW',
      },
      {
        patch: (g) => {
          g.improvement!.continual_improvement_established = false;
        },
        code: 'ISO27701_IMPROVEMENT_REVIEW',
      },
    ];

    for (const { patch, code } of families) {
      const g = structuredClone(PRIVACY_ALL);
      patch(g);
      const result = applyIso27701PackV1Input(baseAllow(), privacyFacts(g));
      expect(result.decision).toBe('REVIEW');
      expect(result.reason_codes).toContain(code);
    }
  });

  it('unknown processing_role → CONTROLLER_PROCESSOR REVIEW', () => {
    const g = structuredClone(PRIVACY_ALL);
    g.processing_role = 'unknown';
    const result = applyIso27701PackV1Input(baseAllow(), privacyFacts(g));
    expect(result.decision).toBe('REVIEW');
    expect(result.reason_codes).toContain('ISO27701_CONTROLLER_PROCESSOR_REVIEW');
  });

  it('provenance + residual privacy risk ≠ AUTHORIZE; no certification language', async () => {
    const applied = applyIso27701PackV1Input(baseAllow(), privacyFacts(PRIVACY_ALL));
    expect(applied.provenance?.matched_rules?.length).toBeGreaterThan(0);
    const src = ISO_27701_PROVENANCE_GRAPH.sources.src_iso_27701_2025;
    expect(src.legal_authority).toBe(false);
    expect(src.citation).toMatch(/27701/i);
    expect(deriveIso27701Gates(privacyFacts(PRIVACY_ALL)).privacy_risk).toBe(true);

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
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27701'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2025-10-14',
      governance_context: { privacy: PRIVACY_ALL },
      request_id: 'req_27701_ok',
    });
    expect(ok.reason_codes).toContain('ISO27701_CONTROLS_SATISFIED');
    expect(ok.human_resolution).toBeUndefined();
    const blob = JSON.stringify(withOperatorExplanation(ok));
    expect(blob).not.toMatch(
      /ISO 27701 certified|ISO 27701 compliant|PIMS certified|PrivacyScoreEngine|DSAR workflow/i,
    );
  });

  it('multi-pack complementary with ISO 27001 (distinct namespaces)', () => {
    const r = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_27701',
        policy_id: 'pol_iso_27701_input',
        decision: 'ALLOW',
      }),
      contrib({
        pack_id: 'pack_iso_27001',
        policy_id: 'pol_iso_27001_input',
        decision: 'ALLOW',
      }),
    ]);
    expect(r.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
    expect(getAuthorityForPack('pack_iso_27701')!.id).not.toBe(
      getAuthorityForPack('pack_iso_27001')!.id,
    );
    expect(POLICY_AUTHORITY_IDS.iso27701).not.toBe(POLICY_AUTHORITY_IDS.iso27001);
  });

  it('unresolved conflict with DENY contrib; human AUTHORIZE/DENY; terminal DENY not eligible', () => {
    const unresolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_27701',
        policy_id: 'pol_iso_27701_input',
        decision: 'ALLOW',
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'DENY',
      }),
    ]);
    expect(unresolved.resolution.category).toBe('UNRESOLVED');
    expect(unresolved.decision).toBe('REVIEW');
    expect(unresolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');

    const review = sampleReview();
    const authorized = withHumanResolution(
      review,
      buildHumanResolution(review, {
        disposition: 'AUTHORIZE',
        reason: 'accepted PIMS compensating evidence',
        resolved_by: 'privacy_officer',
      }),
    );
    expect(authorized.decision).toBe('REVIEW');
    expect(authorized.human_resolution?.final_decision).toBe('ALLOW');

    const denied = withHumanResolution(
      review,
      buildHumanResolution(review, {
        disposition: 'DENY',
        reason: 'privacy evidence insufficient',
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
  });

  it('resume path AUTHORIZED_NOT_RESUMED via withHumanResolution + executionAfterAuthorize', () => {
    const held: HeldRequestSnapshot = {
      version: 1,
      application_id: app.application_id,
      organization_id: 'o1',
      user_id: user.user_id,
      operation: 'summarize',
      model: 'local-general-v1',
      messages: [{ role: 'user', content: 'note' }],
      correlation_id: 'cor_27701',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27701'],
      },
      allowed_models: ['local-general-v1'],
      available_models: ['local-general-v1'],
    };
    const review = sampleReview({ held_request: held });
    const resolution = buildHumanResolution(review, {
      disposition: 'AUTHORIZE',
      reason: 'documented privacy compensating controls',
      resolved_by: 'privacy_officer',
    });
    const authorized = {
      ...withHumanResolution(review, resolution),
      execution: executionAfterAuthorize({
        ...withHumanResolution(review, resolution),
      }),
    };
    expect(authorized.execution?.status).toBe('AUTHORIZED_NOT_RESUMED');
    expect(() => assertResumeEligible(authorized)).not.toThrow();
  });

  it('crypto binding + privacy data minimization (no PII keys in PRIVACY_ALL)', async () => {
    const blob = JSON.stringify(PRIVACY_ALL).toLowerCase();
    expect(blob).not.toMatch(/"ssn"|"email"|"customer_name"|"phone"|"dob"/);

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
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27701'],
      },
      deploymentMode: 'connected',
      governance_context: { privacy: PRIVACY_ALL },
      request_id: 'req_27701_crypto',
    });
    const stored = repo.getEvaluation(ok.evaluation_id!)!;
    const h1 = computeDecisionHash(stored);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    const denyClone = structuredClone(stored);
    denyClone.decision = 'DENY';
    expect(computeDecisionHash(denyClone)).not.toBe(h1);
    expect(createHash('sha256').update(h1).digest('hex')).toHaveLength(64);
  });

  it('PDP REVIEW ≠ DENY; no industry inference; Gateway agnostic; complementary with INFOSEC', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const missing = await pdp.evaluateLegacyRequest({
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
      request_id: 'req_27701_missing',
    });
    expect(missing.decision).toBe('REVIEW');
    expect(missing.decision).not.toBe('DENY');

    const complementary = await pdp.evaluateLegacyRequest({
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
          'REGULATORY_APPLICABILITY:ISO_27701',
          'REGULATORY_APPLICABILITY:ISO_27001',
        ],
      },
      deploymentMode: 'connected',
      governance_context: {
        privacy: PRIVACY_ALL,
        information_security: INFOSEC_ALL,
      },
      request_id: 'req_27701_27001',
    });
    expect(complementary.reason_codes).toContain('ISO27701_CONTROLS_SATISFIED');
    expect(complementary.reason_codes).toContain('ISO27001_CONTROLS_SATISFIED');
    expect(complementary.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    const sources = complementary.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27701)).toBe(true);
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso27001)).toBe(true);

    const gw = createPhase1Gateway({
      config: { auditSigningKey: 'iso27701-test-key' },
    });
    const live = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize.' }],
    });
    expect(live.httpStatus).toBe(200);
  });

  it('architecture anti-regression: no Iso27701Evaluator/PrivacyScoreEngine; no Date.now(); 14 rules', () => {
    expect(ISO_27701_RULES).toHaveLength(14);
    expect(Object.values(deriveIso27701Gates(privacyFacts(PRIVACY_ALL))).every(Boolean)).toBe(
      true,
    );
    for (const name of [
      'Iso27701Evaluator',
      'Iso27701Engine',
      'Iso27701Resolver',
      'Iso27701Gateway',
      'Iso27701Score',
      'Iso27701Dashboard',
      'PrivacyScoreEngine',
      'DsarWorkflowEngine',
      'DpiaApp',
    ]) {
      expect(existsSync(resolve(process.cwd(), `src/policy/enterprise/${name}.ts`))).toBe(
        false,
      );
    }
    const packSrc = readFileSync(
      resolve(process.cwd(), 'src/policy/enterprise/packs/iso-27701/pack.ts'),
      'utf8',
    );
    expect(packSrc).not.toMatch(/Iso27701Evaluator|PrivacyScoreEngine|Date\.now\s*\(/);
    expect(existsSync(resolve(process.cwd(), 'policy-packs/iso-27701/manifest.json'))).toBe(
      true,
    );
  });
});
