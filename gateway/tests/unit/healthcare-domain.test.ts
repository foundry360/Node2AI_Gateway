import { afterEach, describe, expect, it } from 'vitest';
import {
  HEALTHCARE_DOMAIN,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  addPackToDomain,
  appendRuleProvenance,
  applyRegulatoryOverlays,
  emptyProvenanceGraph,
  getPolicyDomain,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  mergeDefaultSnapshot,
  mergePackContributions,
  registerOverlayInterpreter,
  unregisterOverlayInterpreter,
  type BaselineFacts,
  type InterpretedResult,
  type PackContribution,
  type PackPolicyMeta,
  type PolicyConflictRecord,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

const MOCK_INTERPRETER = 'mock_healthcare_authority_v1';
const MOCK_PACK_ID = 'pack_mock_healthcare_authority';

const clinician: User = {
  user_id: 'u1',
  organization_id: 'o1',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'a1',
  organization_id: 'o1',
  name: 'App',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

function mockPackContribution(): PackContribution {
  return {
    packs: [
      {
        pack_id: MOCK_PACK_ID,
        status: 'active',
        name: 'Mock Healthcare Authority (test only)',
        domain: 'healthcare',
      },
    ],
    policies: [
      {
        policy_id: 'pol_mock_healthcare',
        version: 1,
        pack_id: MOCK_PACK_ID,
        name: 'Mock healthcare overlay (architectural test)',
        phase: 'input',
        status: 'active',
        interpreter: MOCK_INTERPRETER,
        domain: 'healthcare',
      },
    ],
  };
}

/** Hypothetical pack: applies when regulatory_applicability includes MOCK_HC. No fake CFR. */
function applyMockHealthcare(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (!facts.regulatory_applicability?.includes('MOCK_HC')) {
    return { ...current, matched: [...current.matched, 'mock_hc_skip'] };
  }

  const graph = emptyProvenanceGraph();
  graph.sources.src_mock_hc = {
    source_id: 'src_mock_hc',
    authority: 'Mock Healthcare Authority (test)',
    authority_tier: 2,
    authority_type: 'OFFICIAL_REGULATORY_GUIDANCE',
    legal_authority: false,
    citation: 'MOCK-HC-GUIDANCE-1',
    title: 'Architectural test source — not a real regulation',
  };
  graph.obligations['MOCK-OBL-LOGGING'] = {
    obligation_id: 'MOCK-OBL-LOGGING',
    requirement_type: 'REGULATORY_REQUIREMENT',
    authority: 'Mock Healthcare Authority (test)',
    authority_tier: 2,
    citations: ['MOCK-HC-GUIDANCE-1 §logging'],
    source_ids: ['src_mock_hc'],
  };

  const provenance = appendRuleProvenance(
    current.provenance,
    {
      rule_id: 'MOCK-R-LOG',
      obligation_ids: ['MOCK-OBL-LOGGING'],
      sources: ['src_mock_hc'],
      control_ids: ['ctrl_audit_logging'],
      requirement_type: 'REGULATORY_REQUIREMENT',
    },
    graph,
    ['LOG_GOVERNANCE_EVENT'],
  );

  const obligations = [...current.obligations];
  if (!obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')) {
    obligations.push({ code: 'LOG_GOVERNANCE_EVENT' });
  }

  return {
    ...current,
    obligations,
    matched: [...current.matched, 'mock_hc_applied', 'MOCK-R-LOG'],
    provenance,
    policy_id: meta.policy_id,
    policy_version: meta.version,
    pack_id: meta.pack_id,
  };
}

describe('Healthcare Policy Domain — architecture', () => {
  afterEach(() => {
    unregisterOverlayInterpreter(MOCK_INTERPRETER);
    const domain = getPolicyDomain('healthcare');
    if (domain) {
      domain.pack_ids = ['pack_hipaa', 'pack_42_cfr_part_2', 'pack_onc_hti1', 'pack_cms'];
    }
  });

  it('A. Healthcare Domain contains HIPAA v3.1 and Part 2 pack membership', () => {
    expect(HEALTHCARE_DOMAIN.domain_id).toBe('healthcare');
    expect(HEALTHCARE_DOMAIN.status).toBe('active');
    expect(listDomainPackIds('healthcare')).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_42_cfr_part_2']),
    );
    const snap = mergeDefaultSnapshot();
    expect(snap.packs.some((p) => p.pack_id === 'pack_hipaa')).toBe(true);
    expect(snap.packs.some((p) => p.pack_id === 'pack_42_cfr_part_2')).toBe(true);
    expect(snap.policies.some((p) => p.pack_id === 'pack_hipaa' && p.status === 'active')).toBe(
      true,
    );
    expect(
      snap.policies.some((p) => p.pack_id === 'pack_42_cfr_part_2' && p.status === 'active'),
    ).toBe(true);
  });

  it('B. Second pack registers via contribution + interpreter registry (no HIPAA fork)', () => {
    registerOverlayInterpreter(MOCK_INTERPRETER, applyMockHealthcare);
    expect(listRegisteredOverlayInterpreters()).toContain(MOCK_INTERPRETER);

    const snap = mergeDefaultSnapshot();
    const merged = mergePackContributions(
      { packs: snap.packs, policies: snap.policies },
      mockPackContribution(),
    );
    expect(merged.packs.some((p) => p.pack_id === MOCK_PACK_ID)).toBe(true);
    expect(merged.policies.some((p) => p.interpreter === MOCK_INTERPRETER)).toBe(true);

    addPackToDomain('healthcare', MOCK_PACK_ID);
    expect(listDomainPackIds('healthcare')).toEqual(
      expect.arrayContaining(['pack_hipaa', MOCK_PACK_ID]),
    );

    const base: InterpretedResult = {
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
    const facts: BaselineFacts = {
      trust_level: 'trusted',
      application_status: 'active',
      application_type: 'clinical',
      allowed_operations: ['summarize'],
      allowed_models: ['local-general-v1'],
      operation: 'summarize',
      classification: 'Internal',
      deployment_mode: 'connected',
      roles: ['clinician'],
      available_models: ['local-general-v1'],
      regulatory_applicability: ['MOCK_HC'],
    };
    const meta = mockPackContribution().policies[0]!;
    const out = applyRegulatoryOverlays(base, facts, [meta]);
    expect(out.matched).toContain('mock_hc_applied');
    expect(out.pack_id).toBe(MOCK_PACK_ID);
  });

  it('C. Two packs can contribute obligations to one evaluation', async () => {
    registerOverlayInterpreter(MOCK_INTERPRETER, applyMockHealthcare);
    addPackToDomain('healthcare', MOCK_PACK_ID);

    const snap = mergeDefaultSnapshot();
    const mock = mockPackContribution();
    const repo = new InMemoryPolicyRepository({
      packs: [...snap.packs, ...mock.packs],
      policies: [...snap.policies, ...mock.policies],
    });
    const pdp = new PackBackedEnterprisePdp(repo);

    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:MOCK_HC'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });

    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('HIPAA_PHI_PROCESSING_CONTROLS_SATISFIED');
    expect(decision.obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')).toBe(true);
    expect(decision.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
    expect(
      decision.explanation.matched_conditions.some((m) => m.condition_key.includes('mock_hc')),
    ).toBe(true);
    expect(
      decision.explanation.matched_conditions.some((m) =>
        m.condition_key.includes('HIPAA-R-INPUT-CONTROLS-SATISFIED'),
      ),
    ).toBe(true);
  });

  it('D. Provenance distinguishes sources from different packs', async () => {
    registerOverlayInterpreter(MOCK_INTERPRETER, applyMockHealthcare);
    const snap = mergeDefaultSnapshot();
    const mock = mockPackContribution();
    const repo = new InMemoryPolicyRepository({
      packs: [...snap.packs, ...mock.packs],
      policies: [...snap.policies, ...mock.policies],
    });
    const pdp = new PackBackedEnterprisePdp(repo);

    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:MOCK_HC'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });

    const rules = decision.explanation.provenance?.matched_rules ?? [];
    const hipaaRule = rules.find((r) => r.rule_id.startsWith('HIPAA-'));
    const mockRule = rules.find((r) => r.rule_id === 'MOCK-R-LOG');
    expect(hipaaRule).toBeDefined();
    expect(mockRule).toBeDefined();
    expect(hipaaRule!.source_ids).toContain('src_45cfr164');
    expect(hipaaRule!.citations.some((c) => c.startsWith('45 CFR'))).toBe(true);
    expect(mockRule!.source_ids).toContain('src_mock_hc');
    expect(mockRule!.citations).toContain('MOCK-HC-GUIDANCE-1 §logging');
    expect(mockRule!.source_ids).not.toContain('src_45cfr164');
  });

  it('E. Conflict representation remains generic', () => {
    const conflict: PolicyConflictRecord = {
      conflict_type: 'obligation',
      policy_a: 'pol_hipaa_phi_local',
      policy_b: 'pol_mock_healthcare',
      detail: 'Architectural example — packs independently restrict; resolution metadata-driven',
      resolution: 'deny_unresolved',
    };
    expect(conflict.conflict_type).toBe('obligation');
    expect(conflict.resolution).toBe('deny_unresolved');
    expect(Object.keys(conflict).sort()).toEqual(
      ['conflict_type', 'detail', 'policy_a', 'policy_b', 'resolution'].sort(),
    );
  });

  it('F. PHI write requires approval (not automatic DENY)', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const held = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });
    expect(held.decision).toBe('REVIEW');
    expect(held.reason_codes).toContain('HIPAA_PHI_WRITE_REQUIRES_APPROVAL');
    expect(held.explanation.provenance?.matched_rules[0]?.citations).toEqual(
      expect.arrayContaining(['45 CFR 164.312(c)']),
    );
  });
});
