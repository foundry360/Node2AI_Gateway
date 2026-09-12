import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  ISO_38507_PACK_META,
  ISO_38507_PROVENANCE_GRAPH,
  ISO_38507_RULES,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  POLICY_AUTHORITY_IDS,
  applyIso38507PackV1Input,
  compileIso38507Pack,
  deriveIso38507Gates,
  ensureDefaultOverlayRegistry,
  getAuthorityForPack,
  getPolicyAuthority,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  iso38507PackContribution,
  resolvePackContributions,
  treatsAsLegalAuthority,
  withOperatorExplanation,
  type BaselineFacts,
  type InterpretedResult,
  type PackEvaluationContribution,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import type { OrganizationalGovernanceEvidence } from '../../src/policy/types.js';
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

export const ORG_GOVERNANCE_ALL: OrganizationalGovernanceEvidence = {
  accountability: {
    governing_body_accountable: true,
    executive_accountability_defined: true,
    ai_responsibilities_defined: true,
  },
  direction: {
    ai_governance_policy_defined: true,
    strategic_alignment_documented: true,
    acceptable_use_direction_defined: true,
  },
  oversight: {
    ai_oversight_established: true,
    reporting_path_defined: true,
    decision_rights_defined: true,
  },
  stakeholder: {
    relevant_stakeholders_identified: true,
    stakeholder_impacts_considered: true,
    stakeholder_communication_defined: true,
  },
  decision_governance: {
    human_accountability_defined: true,
    escalation_path_defined: true,
    significant_ai_decisions_reviewed: true,
  },
  organizational_effectiveness: {
    ai_use_objectives_defined: true,
    performance_monitoring_established: true,
    governance_review_established: true,
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

function orgFacts(
  org?: OrganizationalGovernanceEvidence,
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
      reason_codes: ['REGULATORY_APPLICABILITY:ISO_38507'],
    },
    deploymentMode: 'connected',
    regulatory_applicability: ['ISO_38507'],
    governance_context: org ? { organizational_governance: org } : undefined,
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

describe('ISO/IEC 38507 Pack #11', () => {
  it('registers authority + pack (STANDARD, non-legal)', () => {
    const auth = getPolicyAuthority(POLICY_AUTHORITY_IDS.iso38507)!;
    expect(auth.id).toBe('auth_iso_38507');
    expect(auth.type).toBe('STANDARD');
    expect(auth.version).toBe('2022');
    expect(auth.effective_date).toBe('2022-04-08');
    expect(treatsAsLegalAuthority(auth)).toBe(false);
    expect(auth.provenance.legal_authority).toBe(false);
    expect(getAuthorityForPack('pack_iso_38507')?.id).toBe(POLICY_AUTHORITY_IDS.iso38507);
    expect(listDomainPackIds('ai_risk')).toContain('pack_iso_38507');
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['iso_38507_pack_v1', 'iso_38507_pack_v1_output']),
    );
    expect(compileIso38507Pack().pack_id).toBe(ISO_38507_PACK_META.pack_id);
    expect(iso38507PackContribution().packs[0]?.pack_id).toBe('pack_iso_38507');
  });

  it('applicability: skip when not ISO_38507; missing evidence → REVIEW; satisfied → ALLOW path', () => {
    const skip = applyIso38507PackV1Input(baseAllow(), {
      ...orgFacts(),
      regulatory_applicability: [],
    });
    expect(skip.matched).toContain('iso_38507_pack_v1_skip_not_applicable');
    expect(skip.decision).toBe('ALLOW');

    expect(applyIso38507PackV1Input(baseAllow(), orgFacts()).decision).toBe('REVIEW');
    expect(applyIso38507PackV1Input(baseAllow(), orgFacts()).reason_codes).toContain(
      'ISO38507_ACCOUNTABILITY_REVIEW',
    );

    const ok = applyIso38507PackV1Input(baseAllow(), orgFacts(ORG_GOVERNANCE_ALL));
    expect(ok.decision).toBe('ALLOW');
    expect(ok.reason_codes).toContain('ISO38507_CONTROLS_SATISFIED');
    expect(ok.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
  });

  it('each governance family missing → REVIEW with distinct reason', () => {
    const families: Array<{
      patch: (g: OrganizationalGovernanceEvidence) => void;
      code: string;
    }> = [
      {
        patch: (g) => {
          g.accountability!.governing_body_accountable = false;
        },
        code: 'ISO38507_ACCOUNTABILITY_REVIEW',
      },
      {
        patch: (g) => {
          g.accountability!.executive_accountability_defined = false;
        },
        code: 'ISO38507_EXECUTIVE_ACCOUNTABILITY_REVIEW',
      },
      {
        patch: (g) => {
          g.direction!.ai_governance_policy_defined = false;
        },
        code: 'ISO38507_GOVERNANCE_DIRECTION_REVIEW',
      },
      {
        patch: (g) => {
          g.direction!.strategic_alignment_documented = false;
        },
        code: 'ISO38507_STRATEGIC_ALIGNMENT_REVIEW',
      },
      {
        patch: (g) => {
          g.oversight!.decision_rights_defined = false;
        },
        code: 'ISO38507_DECISION_RIGHTS_REVIEW',
      },
      {
        patch: (g) => {
          g.oversight!.ai_oversight_established = false;
        },
        code: 'ISO38507_OVERSIGHT_REVIEW',
      },
      {
        patch: (g) => {
          g.stakeholder!.relevant_stakeholders_identified = false;
        },
        code: 'ISO38507_STAKEHOLDER_REVIEW',
      },
      {
        patch: (g) => {
          g.stakeholder!.stakeholder_impacts_considered = false;
        },
        code: 'ISO38507_STAKEHOLDER_IMPACT_REVIEW',
      },
      {
        patch: (g) => {
          g.decision_governance!.human_accountability_defined = false;
        },
        code: 'ISO38507_HUMAN_ACCOUNTABILITY_REVIEW',
      },
      {
        patch: (g) => {
          g.decision_governance!.escalation_path_defined = false;
        },
        code: 'ISO38507_ESCALATION_REVIEW',
      },
      {
        patch: (g) => {
          g.organizational_effectiveness!.governance_review_established = false;
        },
        code: 'ISO38507_GOVERNANCE_MONITORING_REVIEW',
      },
    ];

    for (const { patch, code } of families) {
      const org = structuredClone(ORG_GOVERNANCE_ALL);
      patch(org);
      const result = applyIso38507PackV1Input(baseAllow(), orgFacts(org));
      expect(result.decision).toBe('REVIEW');
      expect(result.reason_codes).toContain(code);
    }
  });

  it('provenance distinguishes source guidance from Enigma-derived control', () => {
    const applied = applyIso38507PackV1Input(
      baseAllow(),
      orgFacts(ORG_GOVERNANCE_ALL),
    );
    expect(applied.provenance?.matched_rules?.length).toBeGreaterThan(0);
    const src = ISO_38507_PROVENANCE_GRAPH.sources.src_iso_38507_2022;
    expect(src.legal_authority).toBe(false);
    expect(src.citation).toMatch(/38507/i);
    expect(src.note ?? '').toMatch(/not.*certification|not.*Enigma certification/i);
    expect(ISO_38507_RULES.some((r) => r.requirement_type === 'DERIVED_CONTROL')).toBe(
      true,
    );
  });

  it('ISO 38507 + ISO 42001 remain complementary with distinct provenance', async () => {
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
          'REGULATORY_APPLICABILITY:ISO_38507',
          'REGULATORY_APPLICABILITY:ISO_42001',
        ],
      },
      deploymentMode: 'connected',
      governance_context: {
        organizational_governance: ORG_GOVERNANCE_ALL,
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
      },
      request_id: 'req_38507_42001',
    });
    expect(decision.reason_codes).toContain('ISO38507_CONTROLS_SATISFIED');
    expect(decision.reason_codes.some((c) => c.startsWith('ISO42001_'))).toBe(true);
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    const sources = decision.explanation.provenance?.sources ?? [];
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso38507)).toBe(
      true,
    );
    expect(sources.some((s) => s.authority_id === POLICY_AUTHORITY_IDS.iso42001)).toBe(
      true,
    );
    expect(POLICY_AUTHORITY_IDS.iso38507).not.toBe(POLICY_AUTHORITY_IDS.iso42001);
  });

  it('multi-pack resolution + conflict / unresolved / REVIEW wins', () => {
    const complementary = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_38507',
        policy_id: 'pol_iso_38507_input',
        decision: 'ALLOW',
        reason_codes: ['ISO38507_CONTROLS_SATISFIED'],
      }),
      contrib({
        pack_id: 'pack_iso_42001',
        policy_id: 'pol_iso_42001_input',
        decision: 'ALLOW',
        reason_codes: ['ISO42001_CONTROLS_SATISFIED'],
      }),
    ]);
    expect(complementary.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);

    for (const [pack_id, policy_id] of [
      ['pack_nist_ai_rmf', 'pol_nist_ai_rmf_input'],
      ['pack_soc2', 'pol_soc2_input'],
      ['pack_nist_csf_2', 'pol_nist_csf_2_input'],
      ['pack_owasp_llm_2025', 'pol_owasp_llm_2025_input'],
    ] as const) {
      const r = resolvePackContributions([
        contrib({
          pack_id: 'pack_iso_38507',
          policy_id: 'pol_iso_38507_input',
          decision: 'ALLOW',
        }),
        contrib({ pack_id, policy_id, decision: 'ALLOW' }),
      ]);
      expect(r.resolution.category).toMatch(/AGREEMENT|COMPLEMENTARY/);
    }

    const deny = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_38507',
        policy_id: 'pol_iso_38507_input',
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

    const reviewWins = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_38507',
        policy_id: 'pol_iso_38507_input',
        decision: 'ALLOW',
      }),
      contrib({
        pack_id: 'pack_iso_42005',
        policy_id: 'pol_iso_42005_input',
        decision: 'REVIEW',
      }),
    ]);
    expect(reviewWins.decision).toBe('REVIEW');

    const unresolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_iso_38507',
        policy_id: 'pol_iso_38507_input',
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
  });

  it('PDP path: missing → REVIEW; satisfied → evidence; explanation; no certification', async () => {
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
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_38507'],
      },
      deploymentMode: 'connected',
      request_id: 'req_38507_missing',
    });
    expect(missing.decision).toBe('REVIEW');
    expect(missing.decision).not.toBe('DENY');
    expect(repo.getEvaluation(missing.evaluation_id!)?.decision).toBe('REVIEW');

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
        reason_codes: ['REGULATORY_APPLICABILITY:ISO_38507'],
      },
      deploymentMode: 'connected',
      evaluation_as_of: '2022-04-08',
      governance_context: { organizational_governance: ORG_GOVERNANCE_ALL },
      request_id: 'req_38507_ok',
    });
    expect(ok.reason_codes).toContain('ISO38507_CONTROLS_SATISFIED');
    const explained = withOperatorExplanation(ok);
    expect(explained.explanation.operator?.narrative).toBeTruthy();
    const blob = JSON.stringify(explained);
    expect(blob).not.toMatch(
      /ISO 38507 certified|ISO 38507 compliant|Iso38507Dashboard|governance score/i,
    );

    // Organizational human_accountability ≠ Enigma AUTHORIZE
    expect(ok.human_resolution).toBeUndefined();
    expect(deriveIso38507Gates(orgFacts(ORG_GOVERNANCE_ALL)).human_accountability).toBe(
      true,
    );
  });

  it('no industry inference; Gateway remains framework-agnostic', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const inferred = await pdp.evaluateLegacyRequest({
      user,
      application: {
        ...app,
        name: 'Board ISO 38507 Governance Clinic',
      },
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
      request_id: 'req_38507_no_infer',
    });
    expect(inferred.reason_codes.some((c) => c.startsWith('ISO38507_'))).toBe(false);

    const gw = createPhase1Gateway({
      config: { auditSigningKey: 'iso38507-test-key' },
    });
    const live = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize.' }],
    });
    expect(live.httpStatus).toBe(200);
  });

  it('architecture anti-regression: no Iso38507Evaluator/Engine/Score/Dashboard; no Date.now()', () => {
    expect(ISO_38507_RULES).toHaveLength(13);
    const gates = deriveIso38507Gates(orgFacts(ORG_GOVERNANCE_ALL));
    expect(Object.values(gates).every(Boolean)).toBe(true);

    for (const name of [
      'Iso38507Evaluator',
      'Iso38507Engine',
      'Iso38507Resolver',
      'Iso38507Gateway',
      'Iso38507Score',
      'Iso38507Dashboard',
      'Iso38507AssessmentEngine',
      'Iso38507ComplianceEngine',
    ]) {
      expect(existsSync(resolve(process.cwd(), `src/policy/enterprise/${name}.ts`))).toBe(
        false,
      );
    }
    const packSrc = readFileSync(
      resolve(process.cwd(), 'src/policy/enterprise/packs/iso-38507/pack.ts'),
      'utf8',
    );
    expect(packSrc).not.toMatch(/Iso38507Evaluator|Date\.now\s*\(/);
    expect(existsSync(resolve(process.cwd(), 'policy-packs/iso-38507/manifest.json'))).toBe(
      true,
    );
  });
});
