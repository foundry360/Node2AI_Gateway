import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  ISO_27001_PACK_META,
  ISO_27001_PROVENANCE_GRAPH,
  ISO_27001_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyIso27001PackV1Input,
  compileIso27001Pack,
  deriveIso27001Gates,
  ensureDefaultOverlayRegistry,
  getAuthorityForPack,
  getPolicyAuthority,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  iso27001PackContribution,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withOperatorExplanation,
  type BaselineFacts,
  type InterpretedResult,
  type PackEvaluationContribution,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import type { InformationSecurityGovernanceEvidence } from '../../src/policy/types.js';
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

export const INFOSEC_ALL: InformationSecurityGovernanceEvidence = {
  isms: {
    scope_defined: true,
    context_established: true,
    interested_parties_identified: true,
    information_security_objectives_defined: true,
  },
  risk: {
    risk_process_established: true,
    risks_identified: true,
    risks_assessed: true,
    risk_treatment_defined: true,
    risk_treatment_implemented: true,
    residual_risk_reviewed: true,
  },
  information_assets: {
    assets_identified: true,
    information_classification_defined: true,
    asset_ownership_defined: true,
  },
  access: {
    access_control_defined: true,
    identity_management_established: true,
    privileged_access_controlled: true,
    access_review_established: true,
  },
  operations: {
    operational_controls_established: true,
    change_management_established: true,
    logging_monitoring_established: true,
    backup_recovery_established: true,
  },
  supplier_security: {
    supplier_risk_controls_established: true,
    third_party_security_requirements_defined: true,
    supplier_monitoring_established: true,
  },
  incident: {
    incident_management_established: true,
    incident_response_defined: true,
    incident_learning_established: true,
  },
  continuity: {
    business_continuity_security_defined: true,
    resilience_controls_established: true,
    recovery_capability_established: true,
  },
  people: {
    security_roles_defined: true,
    security_awareness_established: true,
    personnel_security_controls_established: true,
  },
  monitoring: {
    security_performance_monitored: true,
    internal_review_established: true,
    management_review_established: true,
  },
  improvement: {
    nonconformities_managed: true,
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

function infosecFacts(
  is?: InformationSecurityGovernanceEvidence,
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
      reason_codes: ['REGULATORY_APPLICABILITY:ISO_27001'],
    },
    deploymentMode: 'connected',
    regulatory_applicability: ['ISO_27001'],
    governance_context: is ? { information_security: is } : undefined,
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

describe('ISO/IEC 27001 Pack #12', () => {
  it('registers authority + pack (STANDARD, non-legal)', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso27001)!;
    expect(auth.id).toBe('auth_iso_27001');
    expect(auth.type).toBe('STANDARD');
    expect(auth.version).toBe('2022');
    expect(auth.effective_date).toBe('2022-10-25');
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.provenance.legal_authority).toBe(false);
    expect(getAuthorityForPack('pack_iso_27001')?.id).toBe(POLICY_AUTHORITY_IDS.iso27001);
    expect(listDomainPackIds('ai_risk')).toContain('pack_iso_27001');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['iso_27001_pack_v1', 'iso_27001_pack_v1_output']),
    );
    expect(compileIso27001Pack().pack_id).toBe(ISO_27001_PACK_META.pack_id);
    expect(iso27001PackContribution().packs[0]?.pack_id).toBe('pack_iso_27001');
  });

  it('applicability skip; missing → REVIEW; satisfied → ALLOW path', () => {
    const skip = applyIso27001PackV1Input(baseAllow(), {
      ...infosecFacts(),
      regulatory_applicability: [],
    });
    expect(skip.matched).toContain('iso_27001_pack_v1_skip_not_applicable');

    expect(applyIso27001PackV1Input(baseAllow(), infosecFacts()).decision).toBe('REVIEW');
    expect(applyIso27001PackV1Input(baseAllow(), infosecFacts()).reason_codes).toContain(
      'ISO27001_ISMS_CONTEXT_REVIEW',
    );

    const ok = applyIso27001PackV1Input(baseAllow(), infosecFacts(INFOSEC_ALL));
    expect(ok.decision).toBe('ALLOW');
    expect(ok.reason_codes).toContain('ISO27001_CONTROLS_SATISFIED');
    expect(ok.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('each ISMS family missing → REVIEW with distinct reason', () => {
    const families: Array<{
      patch: (g: InformationSecurityGovernanceEvidence) => void;
      code: string;
    }> = [
      {
        patch: (g) => {
          g.isms!.scope_defined = false;
        },
        code: 'ISO27001_ISMS_CONTEXT_REVIEW',
      },
      {
        patch: (g) => {
          g.risk!.risks_assessed = false;
        },
        code: 'ISO27001_RISK_PROCESS_REVIEW',
      },
      {
        patch: (g) => {
          g.risk!.residual_risk_reviewed = false;
        },
        code: 'ISO27001_RISK_TREATMENT_REVIEW',
      },
      {
        patch: (g) => {
          g.information_assets!.assets_identified = false;
        },
        code: 'ISO27001_ASSETS_REVIEW',
      },
      {
        patch: (g) => {
          g.access!.access_control_defined = false;
        },
        code: 'ISO27001_ACCESS_REVIEW',
      },
      {
        patch: (g) => {
          g.operations!.logging_monitoring_established = false;
        },
        code: 'ISO27001_OPERATIONS_REVIEW',
      },
      {
        patch: (g) => {
          g.supplier_security!.supplier_monitoring_established = false;
        },
        code: 'ISO27001_SUPPLIER_REVIEW',
      },
      {
        patch: (g) => {
          g.incident!.incident_management_established = false;
        },
        code: 'ISO27001_INCIDENT_REVIEW',
      },
      {
        patch: (g) => {
          g.continuity!.recovery_capability_established = false;
        },
        code: 'ISO27001_CONTINUITY_REVIEW',
      },
      {
        patch: (g) => {
          g.people!.security_roles_defined = false;
        },
        code: 'ISO27001_PEOPLE_REVIEW',
      },
      {
        patch: (g) => {
          g.monitoring!.management_review_established = false;
        },
        code: 'ISO27001_MONITORING_REVIEW',
      },
      {
        patch: (g) => {
          g.improvement!.continual_improvement_established = false;
        },
        code: 'ISO27001_IMPROVEMENT_REVIEW',
      },
    ];

    for (const { patch, code } of families) {
      const g = structuredClone(INFOSEC_ALL);
      patch(g);
      const result = applyIso27001PackV1Input(baseAllow(), infosecFacts(g));
      expect(result.decision).toBe('REVIEW');
      expect(result.reason_codes).toContain(code);
    }
  });

  it('provenance + residual risk ≠ AUTHORIZE; no certification language', async () => {
    const applied = applyIso27001PackV1Input(baseAllow(), infosecFacts(INFOSEC_ALL));
    expect(applied.provenance?.matched_rules?.length).toBeGreaterThan(0);
    const src = ISO_27001_PROVENANCE_GRAPH.sources.src_iso_27001_2022;
    expect(src.legal_authority).toBe(false);
    expect(src.citation).toMatch(/27001/i);
    expect(deriveIso27001Gates(infosecFacts(INFOSEC_ALL)).risk_treatment).toBe(true);

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
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27001'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2022-10-25',
      governance_context: { information_security: INFOSEC_ALL },
      request_id: 'req_27001_ok',
    });
    expect(ok.reason_codes).toContain('ISO27001_CONTROLS_SATISFIED');
    expect(ok.human_resolution).toBeUndefined();
    const blob = JSON.stringify(withOperatorExplanation(ok));
    expect(blob).not.toMatch(
      /ISO 27001 certified|ISO 27001 compliant|Iso27001Dashboard|Annex A score/i,
    );
  });

  it('multi-pack + conflict / unresolved; distinct from SOC2/CSF/42001', () => {
    for (const [pack_id, policy_id] of [
      ['pack_iso_42001', 'pol_iso_42001_input'],
      ['pack_iso_38507', 'pol_iso_38507_input'],
      ['pack_soc2', 'pol_soc2_input'],
      ['pack_nist_csf_2', 'pol_nist_csf_2_input'],
      ['pack_owasp_llm_2025', 'pol_owasp_llm_2025_input'],
    ] as const) {
      const r = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_27001',
          policy_id: 'pol_iso_27001_input',
          decision: 'ALLOW',
        }),
        contrib({ pack_id, policy_id, decision: 'ALLOW' }),
      ]);
      expect(r.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
      expect(getAuthorityForPack('pack_iso_27001')!.id).not.toBe(
        getAuthorityForPack(pack_id)!.id,
      );
    }

    const deny = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_27001',
        policy_id: 'pol_iso_27001_input',
        decision: 'ALLOW',
        precedence: { priority: 10, basis: 'DECLARED_POLICY_PRECEDENCE' },
      }),
      contrib({
        pack_id: 'pack_eu_ai_act',
        policy_id: 'pol_eu_ai_act_input',
        decision: 'DENY',
        precedence: { priority: 100, basis: 'DECLARED_POLICY_PRECEDENCE' },
      }),
    ]);
    expect(deny.decision).toBe('DENY');

    const unresolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_27001',
        policy_id: 'pol_iso_27001_input',
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
  });

  it('PDP REVIEW ≠ DENY; no industry inference; Gateway agnostic', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_27001'],
      },
      deploymentMode: 'connected',
      request_id: 'req_27001_missing',
    });
    expect(missing.decision).toBe('REVIEW');
    expect(missing.decision).not.toBe('DENY');

    const inferred = await pdp.evaluateLegacyRequest({
      user,
      application: { ...app, name: 'ISO 27001 Certified Enterprise Security Corp' },
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
      request_id: 'req_27001_no_infer',
    });
    expect(inferred.reason_codes.some((c) => c.startsWith('ISO27001_'))).toBe(false);

    const gw = createPhase1Gateway({
      config: { auditSigningKey: 'iso27001-test-key' },
    });
    const live = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize.' }],
    });
    expect(live.httpStatus).toBe(200);
  });

  it('architecture anti-regression: no Iso27001Evaluator/Score/Dashboard; no Date.now()', () => {
    expect(ISO_27001_RULES).toHaveLength(14);
    expect(Object.values(deriveIso27001Gates(infosecFacts(INFOSEC_ALL))).every(Boolean)).toBe(
      true,
    );
    for (const name of [
      'Iso27001Evaluator',
      'Iso27001Engine',
      'Iso27001Resolver',
      'Iso27001Gateway',
      'Iso27001Score',
      'Iso27001Dashboard',
      'Iso27001AssessmentEngine',
    ]) {
      expect(existsSync(resolve(process.cwd(), `src/policy/enterprise/${name}.ts`))).toBe(
        false,
      );
    }
    const packSrc = readFileSync(
      resolve(process.cwd(), 'src/policy/enterprise/packs/iso-27001/pack.ts'),
      'utf8',
    );
    expect(packSrc).not.toMatch(/Iso27001Evaluator|Date\.now\s*\(/);
    expect(existsSync(resolve(process.cwd(), 'policy-packs/iso-27001/manifest.json'))).toBe(
      true,
    );
  });
});
