/**
 * Healthcare cross-domain architecture validation.
 *
 * Proves HIPAA + Part 2 + ONC/HTI-1 + CMS contribute through one EPA → one
 * decision → one enforcement/evidence trail. Does not broaden regulatory scope.
 */
import { describe, expect, it } from 'vitest';
import type { Application, User } from '../../src/identity/types.js';
import type {
  GovernanceContext,
  HealthcareInteropEvidence,
  PredictiveDsiEvidence,
} from '../../src/policy/types.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  ensureDefaultOverlayRegistry,
  listDomainPackIds,
  type PolicyDecision,
} from '../../src/policy/enterprise/index.js';

ensureDefaultOverlayRegistry();

const clinician: User = {
  user_id: 'u_cross_1',
  organization_id: 'org_hc',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'app_hc',
  organization_id: 'org_hc',
  name: 'Clinical Gateway App',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'analyze', 'retrieve', 'submit'],
};

const AI_PACK_POLICIES = [
  'pol_nist_ai_rmf_input',
  'pol_nist_ai_rmf_output',
  'pol_owasp_llm_2025_input',
  'pol_owasp_llm_2025_output',
  'pol_eu_ai_act_input',
  'pol_eu_ai_act_output',
  'pol_iso_42001_input',
  'pol_iso_42001_output',
  'pol_iso_23894_input',
  'pol_iso_23894_output',
  'pol_iso_42005_input',
  'pol_iso_42005_output',
  'pol_soc2_input',
  'pol_soc2_output',
  'pol_nist_csf_2_input',
  'pol_nist_csf_2_output',
  'pol_iso_38507_input',
  'pol_iso_38507_output',
  'pol_iso_27001_input',
  'pol_iso_27001_output',
  'pol_iso_27701_input',
  'pol_iso_27701_output',
  'pol_nist_privacy_framework_input',
  'pol_nist_privacy_framework_output',
] as const;

function suspendAiRiskPacks(repo: InMemoryPolicyRepository) {
  for (const id of AI_PACK_POLICIES) {
    try {
      repo.setPolicyStatus(id, 'suspended');
    } catch {
      /* optional */
    }
  }
}

function tags(...regs: string[]): string[] {
  return regs.map((r) =>
    r.startsWith('REGULATORY_APPLICABILITY:') ? r : `REGULATORY_APPLICABILITY:${r}`,
  );
}

function packIds(decision: PolicyDecision): string[] {
  return [...new Set(decision.applicable_policies.map((p) => p.pack_id))];
}

function contributingPackIds(decision: PolicyDecision): string[] {
  return decision.explanation.resolution?.contributing_pack_ids ?? [];
}

function matchedRuleIds(decision: PolicyDecision): string[] {
  return (decision.explanation.provenance?.matched_rules ?? []).map((r) => r.rule_id);
}

async function evaluateHealthcare(opts: {
  requestId: string;
  regs: string[];
  sensitivity?: string;
  purpose?: string;
  authorization?: string;
  requestedModel?: string;
  agentId?: string;
  toolId?: string;
  governance?: GovernanceContext;
  /** Healthcare packs to keep active (others suspended). Empty = all healthcare active. */
  activeHealthcarePacks?: Array<'hipaa' | 'part2' | 'onc' | 'cms'>;
}): Promise<{ decision: PolicyDecision; repo: InMemoryPolicyRepository }> {
  const repo = new InMemoryPolicyRepository();
  suspendAiRiskPacks(repo);

  const keep = new Set(opts.activeHealthcarePacks ?? ['hipaa', 'part2', 'onc', 'cms']);
  if (!keep.has('hipaa')) {
    repo.setPolicyStatus('pol_hipaa_phi_local', 'suspended');
    repo.setPolicyStatus('pol_hipaa_release', 'suspended');
  }
  if (!keep.has('part2')) {
    repo.setPolicyStatus('pol_part2_sud_records', 'suspended');
    repo.setPolicyStatus('pol_part2_redisclosure', 'suspended');
  }
  if (!keep.has('onc')) {
    repo.setPolicyStatus('pol_onc_hti1_dsi_input', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_output', 'suspended');
  }
  if (!keep.has('cms')) {
    repo.setPolicyStatus('pol_cms_interop_input', 'suspended');
    repo.setPolicyStatus('pol_cms_interop_output', 'suspended');
  }

  const pdp = new PackBackedEnterprisePdp(repo);
  const decision = await pdp.evaluateLegacyRequest({
    user: clinician,
    application: clinicalApp,
    operation: 'summarize',
    requestedModel: opts.requestedModel ?? 'local-general-v1',
    availableModels: ['local-general-v1', 'cloud-public-gpt'],
    environment: 'prod',
    classification: {
      sensitivity: opts.sensitivity ?? 'PHI',
      confidence: 0.99,
      risk: 'high',
      reason_codes: tags(...opts.regs),
    },
    deploymentMode: 'connected',
    purpose: opts.purpose ?? 'treatment',
    authorization_context: opts.authorization ?? 'authorized',
    agent_id: opts.agentId,
    tool_id: opts.toolId,
    governance_context: opts.governance,
    request_id: opts.requestId,
  });
  return { decision, repo };
}

const approvedOncAdmin: PredictiveDsiEvidence = {
  applicability: 'applicable',
  use_class: 'administrative',
  risk_tier: 'low',
  version_governance_current: true,
};

const approvedCmsPatient: HealthcareInteropEvidence = {
  applicability: 'applicable',
  organization_role: 'provider',
  program: 'medicare_advantage',
  workflow: 'patient_access',
  patient_authorized: true,
  application_authorized: true,
  purpose_permitted: true,
};

describe('Healthcare cross-domain — architecture invariants', () => {
  it('registers all four healthcare packs under one domain', () => {
    expect(listDomainPackIds('healthcare')).toEqual(
      expect.arrayContaining([
        'pack_hipaa',
        'pack_42_cfr_part_2',
        'pack_onc_hti1',
        'pack_cms',
      ]),
    );
  });
});

describe('Healthcare cross-domain — single-pack through shared EPA', () => {
  it('1. HIPAA only → one decision + one evaluation record', async () => {
    const { decision, repo } = await evaluateHealthcare({
      requestId: 'req_xd_hipaa_only',
      regs: ['HIPAA'],
      activeHealthcarePacks: ['hipaa'],
      authorization: 'authorized',
      purpose: 'treatment',
    });
    expect(decision.evaluation_id).toBeTruthy();
    expect(packIds(decision)).toContain('pack_hipaa');
    expect(packIds(decision)).not.toContain('pack_cms');
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.request_id).toBe('req_xd_hipaa_only');
    expect(
      repo
        .listEvaluations({ limit: 20 })
        .filter((r) => r.request_id === 'req_xd_hipaa_only' && r.phase === 'input'),
    ).toHaveLength(1);
  });

  it('2. Part 2 only → one decision through shared EPA', async () => {
    const { decision, repo } = await evaluateHealthcare({
      requestId: 'req_xd_part2_only',
      regs: ['PART2'],
      sensitivity: 'PART2',
      activeHealthcarePacks: ['part2'],
      authorization: 'part2_consent',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(packIds(decision)).toContain('pack_42_cfr_part_2');
    expect(repo.getEvaluation(decision.evaluation_id!)!.request_id).toBe(
      'req_xd_part2_only',
    );
  });

  it('3. ONC only → one decision through shared EPA', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_onc_only',
      regs: ['ONC_HTI1'],
      activeHealthcarePacks: ['onc'],
      governance: { predictive_dsi: approvedOncAdmin },
    });
    expect(decision.decision).toBe('ALLOW');
    expect(packIds(decision)).toContain('pack_onc_hti1');
    expect(decision.reason_codes).toContain('ONC_DSI_GOVERNANCE_CONTROLS_SATISFIED');
  });

  it('4. CMS only → one decision through shared EPA', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_cms_only',
      regs: ['CMS'],
      activeHealthcarePacks: ['cms'],
      governance: { healthcare_interop: approvedCmsPatient },
    });
    expect(decision.decision).toBe('ALLOW');
    expect(packIds(decision)).toContain('pack_cms');
    expect(decision.reason_codes).toContain('CMS_INTEROP_CONTROLS_SATISFIED');
  });
});

describe('Healthcare cross-domain — multi-pack composition', () => {
  it('5. HIPAA + CMS → unified decision, one evaluation, both packs', async () => {
    const { decision, repo } = await evaluateHealthcare({
      requestId: 'req_xd_hipaa_cms',
      regs: ['HIPAA', 'CMS'],
      activeHealthcarePacks: ['hipaa', 'cms'],
      agentId: 'agent_fhir',
      toolId: 'tool_patient_api',
      governance: {
        agent_authorized: true,
        tool_authorized: true,
        healthcare_interop: approvedCmsPatient,
      },
    });

    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_cms']),
    );
    expect(contributingPackIds(decision).length).toBeGreaterThanOrEqual(2);
    expect(decision.evaluation_id).toBeTruthy();
    expect(decision.explanation.resolution).toBeDefined();
    expect(['AGREEMENT', 'COMPLEMENTARY', 'RESTRICTIVE', 'NONE']).toContain(
      decision.explanation.resolution?.category,
    );

    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.request_id).toBe('req_xd_hipaa_cms');
    expect(stored.decision).toBe(decision.decision);
    expect(
      repo
        .listEvaluations({ limit: 50 })
        .filter((r) => r.request_id === 'req_xd_hipaa_cms' && r.phase === 'input'),
    ).toHaveLength(1);
  });

  it('6. Part 2 + CMS → both contribute; Part 2 restriction preserved', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_part2_cms',
      regs: ['PART2', 'CMS'],
      sensitivity: 'PART2',
      activeHealthcarePacks: ['part2', 'cms'],
      // No Part 2 consent → Part 2 restrictive
      authorization: undefined,
      governance: { healthcare_interop: approvedCmsPatient },
    });

    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_42_cfr_part_2', 'pack_cms']),
    );
    expect(['DENY', 'REVIEW']).toContain(decision.decision);
    expect(decision.reason_codes.some((c) => c.startsWith('PART2_'))).toBe(true);
    // CMS patient path alone would ALLOW — composition must not discard Part 2 restriction
    expect(decision.decision).not.toBe('ALLOW');
  });

  it('7. ONC + CMS → both contribute; unified ALLOW when both satisfied', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_onc_cms',
      regs: ['ONC_HTI1', 'CMS'],
      activeHealthcarePacks: ['onc', 'cms'],
      agentId: 'agent_dsi',
      governance: {
        agent_authorized: true,
        predictive_dsi: approvedOncAdmin,
        healthcare_interop: {
          ...approvedCmsPatient,
          workflow: 'api_fhir',
          api_client_authorized: true,
          fhir_access_permitted: true,
        },
      },
    });

    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_onc_hti1', 'pack_cms']),
    );
    expect(decision.decision).toBe('ALLOW');
    expect(matchedRuleIds(decision).some((id) => id.startsWith('ONC-R-'))).toBe(true);
    expect(matchedRuleIds(decision).some((id) => id.startsWith('CMS-R-'))).toBe(true);
  });

  it('8. HIPAA + Part 2 + CMS → three domains, one decision trail', async () => {
    const { decision, repo } = await evaluateHealthcare({
      requestId: 'req_xd_hipaa_part2_cms',
      regs: ['HIPAA', 'PART2', 'CMS'],
      sensitivity: 'PHI',
      activeHealthcarePacks: ['hipaa', 'part2', 'cms'],
      authorization: 'part2_consent',
      agentId: 'agent_exchange',
      toolId: 'tool_fhir',
      governance: {
        agent_authorized: true,
        tool_authorized: true,
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'payer_to_payer',
          payer_exchange_authorized: true,
          destination_authorized: true,
        },
      },
    });

    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_42_cfr_part_2', 'pack_cms']),
    );
    expect(decision.evaluation_id).toBeTruthy();
    expect(repo.getEvaluation(decision.evaluation_id!)!.request_id).toBe(
      'req_xd_hipaa_part2_cms',
    );
    expect(decision.explanation.resolution?.contributing_pack_ids.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('9. HIPAA + ONC + CMS → three domains compose', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_hipaa_onc_cms',
      regs: ['HIPAA', 'ONC_HTI1', 'CMS'],
      activeHealthcarePacks: ['hipaa', 'onc', 'cms'],
      authorization: 'authorized',
      governance: {
        predictive_dsi: approvedOncAdmin,
        healthcare_interop: approvedCmsPatient,
      },
    });

    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_onc_hti1', 'pack_cms']),
    );
    expect(decision.explanation.resolution).toBeDefined();
  });

  it('10. All four domains → one decision + one evidence trail', async () => {
    const { decision, repo } = await evaluateHealthcare({
      requestId: 'req_xd_all_four',
      regs: ['HIPAA', 'PART2', 'ONC_HTI1', 'CMS'],
      sensitivity: 'PHI',
      authorization: 'part2_consent',
      agentId: 'agent_all',
      toolId: 'tool_all',
      governance: {
        agent_authorized: true,
        tool_authorized: true,
        predictive_dsi: approvedOncAdmin,
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'provider_access',
          provider_identity_verified: true,
          provider_authorized: true,
        },
      },
    });

    expect(packIds(decision)).toEqual(
      expect.arrayContaining([
        'pack_hipaa',
        'pack_42_cfr_part_2',
        'pack_onc_hti1',
        'pack_cms',
      ]),
    );
    expect(decision.evaluation_id).toBeTruthy();
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.request_id).toBe('req_xd_all_four');
    expect(stored.decision).toBe(decision.decision);
    // Exactly one input evaluation for this request
    expect(
      repo
        .listEvaluations({ limit: 50 })
        .filter((r) => r.request_id === 'req_xd_all_four' && r.phase === 'input'),
    ).toHaveLength(1);
    // Provenance spans multiple domains
    const rules = matchedRuleIds(decision);
    expect(rules.some((r) => r.startsWith('ONC-R-') || r.startsWith('CMS-R-') || r.startsWith('PART2-R-') || r.startsWith('HIPAA-R-') || r.includes('HIPAA') || r.includes('PART2'))).toBe(
      true,
    );
  });
});

describe('Healthcare cross-domain — decision composition', () => {
  it('11. CMS ALLOW + HIPAA DENY → DENY (consequence); both contributions retained', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_allow_deny',
      regs: ['HIPAA', 'CMS'],
      activeHealthcarePacks: ['hipaa', 'cms'],
      // Unauthorized authz → HIPAA DENY; CMS would otherwise ALLOW
      authorization: 'unauthorized',
      purpose: 'treatment',
      governance: { healthcare_interop: approvedCmsPatient },
    });

    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('RESOLUTION_CONSEQUENCE_DENY');
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.explanation.resolution?.category).toBe('RESTRICTIVE');
    expect(decision.explanation.resolution?.basis).toBe('CONSEQUENCE_DENY');
    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_cms']),
    );
    expect(decision.explanation.resolution?.contributions?.map((c) => c.decision).sort()).toEqual([
      'ALLOW',
      'DENY',
    ]);
    expect(decision.restrictions.eligible_models ?? []).toEqual([]);
  });

  it('12. CMS ALLOW + patient data-scope TOKENIZE → TOKENIZE (RESTRICTIVE compose)', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_allow_tokenize',
      regs: ['CMS'],
      activeHealthcarePacks: ['cms'],
      governance: {
        healthcare_interop: {
          ...approvedCmsPatient,
          data_scope_excessive: true,
        },
      },
    });

    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.transformations.some((t) => t.type === 'TOKENIZE')).toBe(true);
  });

  it('13. ALLOW + REQUIRE_APPROVAL (ONC REVIEW) → REVIEW preserved as machine decision', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_allow_review',
      regs: ['CMS', 'ONC_HTI1'],
      activeHealthcarePacks: ['cms', 'onc'],
      governance: {
        healthcare_interop: approvedCmsPatient,
        // High-risk clinical missing FAVES → ONC REVIEW
        predictive_dsi: {
          applicability: 'applicable',
          use_class: 'clinical',
          intended_use: 'clinical_decision_support',
          risk_tier: 'high',
          algorithm_id: 'alg_x',
          model_id: 'mdl_x',
          transparency_sufficient: true,
          faves_status: 'incomplete',
          faves: { fair: true, appropriate: true, valid: true, effective: true, safe: false },
          risk_management_status: 'sufficient',
          human_oversight: true,
          version_governance_current: true,
        },
      },
    });

    expect(decision.decision).toBe('REVIEW');
    expect(
      decision.obligations.some((o) => o.code === 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION'),
    ).toBe(true);
    expect(packIds(decision)).toEqual(
      expect.arrayContaining(['pack_cms', 'pack_onc_hti1']),
    );
  });

  it('14. multiple obligations merge across packs', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_multi_obl',
      regs: ['PART2', 'CMS'],
      sensitivity: 'PART2',
      activeHealthcarePacks: ['part2', 'cms'],
      authorization: 'part2_consent',
      governance: { healthcare_interop: approvedCmsPatient },
    });

    expect(decision.obligations.length).toBeGreaterThan(0);
    expect(decision.obligations.some((o) => o.code === 'LOG_GOVERNANCE_EVENT')).toBe(true);
    // Part 2 satisfied path typically carries LOCAL_MODEL_ONLY
    expect(
      decision.obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY') ||
        decision.reason_codes.some((c) => c.includes('PART2') || c.includes('CMS')),
    ).toBe(true);
  });

  it('15. CMS not applicable does not disable HIPAA', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_cms_na',
      regs: ['HIPAA', 'CMS'],
      activeHealthcarePacks: ['hipaa', 'cms'],
      authorization: 'authorized',
      purpose: 'treatment',
      governance: {
        healthcare_interop: {
          applicability: 'not_applicable',
          organization_role: 'non_cms',
          workflow: 'patient_access',
          patient_authorized: false,
        },
      },
    });

    expect(packIds(decision)).toContain('pack_hipaa');
    // CMS not_applicable must not contribute as a false ALLOW that conflicts
    expect(contributingPackIds(decision)).not.toContain('pack_cms');
    expect(decision.reason_codes).not.toContain('CMS_PATIENT_ACCESS_UNAUTHORIZED');
    expect(decision.decision).not.toBe('DENY');
  });

  it('16. DENY blocks eligible models (enforcement projection input)', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_deny_enforce',
      regs: ['CMS'],
      activeHealthcarePacks: ['cms'],
      governance: {
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'patient_access',
          patient_authorized: false,
          application_authorized: true,
          purpose_permitted: true,
        },
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.restrictions.eligible_models ?? []).toEqual([]);
  });

  it('17. evidence/provenance identifies contributing domains', async () => {
    const { decision } = await evaluateHealthcare({
      requestId: 'req_xd_provenance',
      regs: ['ONC_HTI1', 'CMS'],
      activeHealthcarePacks: ['onc', 'cms'],
      governance: {
        predictive_dsi: approvedOncAdmin,
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'api_fhir',
          api_client_authorized: true,
          fhir_access_permitted: true,
        },
      },
    });

    const sources = decision.explanation.provenance?.sources ?? [];
    const sourceIds = sources.map((s) => s.source_id);
    expect(sourceIds).toEqual(
      expect.arrayContaining(['src_onc_hti1', 'src_cms_interop']),
    );
    expect(decision.explanation.resolution?.contributing_pack_ids).toEqual(
      expect.arrayContaining(['pack_onc_hti1', 'pack_cms']),
    );
  });

  it('18. request_id correlates evaluation record', async () => {
    const { decision, repo } = await evaluateHealthcare({
      requestId: 'req_xd_corr_18',
      regs: ['HIPAA', 'CMS'],
      activeHealthcarePacks: ['hipaa', 'cms'],
      governance: { healthcare_interop: approvedCmsPatient },
    });
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.request_id).toBe('req_xd_corr_18');
    expect(stored.evaluation_id).toBe(decision.evaluation_id);
  });
});
