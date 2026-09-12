import { describe, expect, it } from 'vitest';
import type { Application, User } from '../../src/identity/types.js';
import type { HealthcareInteropEvidence } from '../../src/policy/types.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  CMS_PACK_META,
  CMS_PROVENANCE_GRAPH,
  applyCmsPackV1Input,
  compileCmsPack,
  deriveCmsGates,
  ensureDefaultOverlayRegistry,
  listDomainPackIds,
  listRegisteredOverlayInterpreters,
  type BaselineFacts,
  type InterpretedResult,
} from '../../src/policy/enterprise/index.js';

ensureDefaultOverlayRegistry();

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
  allowed_operations: ['summarize', 'analyze', 'retrieve', 'submit'],
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

function suspendNonCms(repo: InMemoryPolicyRepository) {
  for (const id of [
    'pol_hipaa_phi_local',
    'pol_hipaa_release',
    'pol_part2_sud_records',
    'pol_part2_redisclosure',
    'pol_onc_hti1_dsi_input',
    'pol_onc_hti1_dsi_output',
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
  ]) {
    try {
      repo.setPolicyStatus(id, 'suspended');
    } catch {
      /* optional */
    }
  }
}

async function evaluateCms(opts: {
  interop?: HealthcareInteropEvidence;
  applicability?: string[];
  purpose?: string;
  requestedModel?: string;
  agentId?: string;
  toolId?: string;
  governanceExtras?: Record<string, unknown>;
  requestId?: string;
  suspendOthers?: boolean;
}) {
  const repo = new InMemoryPolicyRepository();
  if (opts.suspendOthers !== false) suspendNonCms(repo);
  const pdp = new PackBackedEnterprisePdp(repo);
  const tags = (opts.applicability ?? ['CMS']).map((c) =>
    c.startsWith('REGULATORY_APPLICABILITY:') ? c : `REGULATORY_APPLICABILITY:${c}`,
  );
  return {
    decision: await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: opts.requestedModel ?? 'local-general-v1',
      availableModels: ['local-general-v1', 'cloud-public-gpt'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: tags,
      },
      deploymentMode: 'connected',
      purpose: opts.purpose ?? 'treatment',
      authorization_context: 'authorized',
      agent_id: opts.agentId,
      tool_id: opts.toolId,
      governance_context: {
        ...(opts.interop ? { healthcare_interop: opts.interop } : {}),
        ...opts.governanceExtras,
      },
      request_id: opts.requestId ?? 'req_cms',
    }),
    repo,
  };
}

describe('CMS Thin Pack — integrity', () => {
  it('loads, validates, and compiles CMS pack with provenance', () => {
    const compiled = compileCmsPack();
    expect(compiled.pack_id).toBe('pack_cms');
    expect(compiled.pack_version).toBe('1.0.0');
    expect(compiled.policies.map((p) => p.interpreter)).toEqual(
      expect.arrayContaining(['cms_pack_v1', 'cms_pack_v1_output']),
    );
    expect(compiled.rules.length).toBeGreaterThanOrEqual(15);
    expect(compiled.rules.length).toBeLessThanOrEqual(20);
    expect(compiled.provenance.sources.src_cms_interop?.authority_id).toBe('auth_cms');
    expect(CMS_PACK_META.pack_id).toBe('pack_cms');
    expect(CMS_PROVENANCE_GRAPH.sources.src_cms_interop).toBeDefined();
  });

  it('activates CMS in healthcare domain membership', () => {
    const repo = new InMemoryPolicyRepository();
    expect(repo.getPolicy('pol_cms_interop_input')?.interpreter).toBe('cms_pack_v1');
    expect(repo.getPolicy('pol_cms_interop_input')?.status).toBe('active');
    expect(listDomainPackIds('healthcare')).toEqual(
      expect.arrayContaining([
        'pack_hipaa',
        'pack_42_cfr_part_2',
        'pack_onc_hti1',
        'pack_cms',
      ]),
    );
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['cms_pack_v1', 'cms_pack_v1_output']),
    );
  });

  it('skips when CMS tag is absent', () => {
    const meta = compileCmsPack().policies.find((p) => p.phase === 'input')!;
    const facts: BaselineFacts = {
      trust_level: 'trusted',
      application_status: 'active',
      application_type: 'clinical',
      allowed_operations: ['summarize'],
      allowed_models: ['local-general-v1'],
      operation: 'summarize',
      classification: 'PHI',
      deployment_mode: 'connected',
      roles: ['clinician'],
      available_models: ['local-general-v1'],
      regulatory_applicability: ['HIPAA'],
      governance_context: {
        healthcare_interop: { applicability: 'applicable', workflow: 'patient_access' },
      },
    };
    const out = applyCmsPackV1Input(baseAllow(), facts, meta);
    expect(out.matched).toContain('cms_pack_v1_skip_not_applicable');
    expect(out.decision).toBe('ALLOW');
  });
});

describe('CMS Thin Pack — applicability', () => {
  it('1. CMS applicable authorized patient access → ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        organization_role: 'payer',
        program: 'medicare_advantage',
        workflow: 'patient_access',
        patient_authorized: true,
        application_authorized: true,
        purpose_permitted: true,
      },
      requestId: 'req_cms_app1',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('CMS_INTEROP_CONTROLS_SATISFIED');
  });

  it('2. CMS not applicable → skip contribution / baseline ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'not_applicable',
        organization_role: 'non_cms',
        workflow: 'patient_access',
        patient_authorized: false,
      },
      requestId: 'req_cms_app2',
    });
    expect(decision.decision).toBe('ALLOW');
    // Explicit not_applicable must not contribute CMS outcomes into EPA composition
    expect(decision.applicable_policies.map((p) => p.pack_id)).not.toContain('pack_cms');
    expect(decision.reason_codes).not.toContain('CMS_PATIENT_ACCESS_UNAUTHORIZED');
    expect(decision.explanation.resolution?.contributing_pack_ids ?? []).not.toContain(
      'pack_cms',
    );
  });

  it('3. CMS unknown applicability does not auto-REVIEW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'unknown',
        workflow: 'patient_access',
        patient_authorized: false,
      },
      requestId: 'req_cms_app3',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('CMS_APPLICABILITY_UNKNOWN');
    expect(decision.decision).not.toBe('REVIEW');
  });
});

describe('CMS Thin Pack — Patient Access', () => {
  it('4. authorized patient access → ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'patient_access',
        patient_authorized: true,
        application_authorized: true,
        purpose_permitted: true,
      },
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('5. unauthorized application → DENY', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'patient_access',
        patient_authorized: true,
        application_authorized: false,
        purpose_permitted: true,
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_PATIENT_APPLICATION_UNAUTHORIZED');
  });

  it('6. excessive data scope → TOKENIZE', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'patient_access',
        patient_authorized: true,
        application_authorized: true,
        purpose_permitted: true,
        data_scope_excessive: true,
      },
    });
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.reason_codes).toContain('CMS_PATIENT_DATA_SCOPE_EXCESSIVE');
  });
});

describe('CMS Thin Pack — Provider Access', () => {
  it('7. authorized provider → ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'provider_access',
        provider_identity_verified: true,
        provider_authorized: true,
      },
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('CMS_INTEROP_CONTROLS_SATISFIED');
  });

  it('8. unauthorized provider → DENY', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'provider_access',
        provider_identity_verified: true,
        provider_authorized: false,
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_PROVIDER_UNAUTHORIZED');
  });

  it('9. unauthorized agent → DENY', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'provider_access',
        provider_identity_verified: true,
        provider_authorized: true,
      },
      agentId: 'agent_x',
      governanceExtras: { agent_authorized: false },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_PROVIDER_AGENT_UNAUTHORIZED');
  });
});

describe('CMS Thin Pack — Payer-to-Payer', () => {
  it('10. authorized payer exchange → ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'payer_to_payer',
        payer_exchange_authorized: true,
        destination_authorized: true,
      },
      requestedModel: 'local-general-v1',
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('11. unauthorized destination → DENY', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'payer_to_payer',
        payer_exchange_authorized: true,
        destination_authorized: false,
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_PAYER_DESTINATION_UNAUTHORIZED');
  });

  it('12. excessive data scope → TOKENIZE', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'payer_to_payer',
        payer_exchange_authorized: true,
        destination_authorized: true,
        data_scope_excessive: true,
      },
    });
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.reason_codes).toContain('CMS_PAYER_DATA_SCOPE_EXCESSIVE');
  });
});

describe('CMS Thin Pack — Prior Authorization', () => {
  it('13. prepare request authorized → ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'prior_auth',
        prior_auth_stage: 'prepare',
        prior_auth_authorized: true,
      },
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('CMS_INTEROP_CONTROLS_SATISFIED');
  });

  it('14. retrieve supporting data unauthorized → DENY', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'prior_auth',
        prior_auth_stage: 'retrieve',
        prior_auth_authorized: false,
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_PRIOR_AUTH_RETRIEVE_UNAUTHORIZED');
  });

  it('15. submit authorized → ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'prior_auth',
        prior_auth_stage: 'submit',
        prior_auth_authorized: true,
      },
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('16. submit unauthorized → DENY (not auto-REVIEW)', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'prior_auth',
        prior_auth_stage: 'submit',
        prior_auth_authorized: false,
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_PRIOR_AUTH_SUBMIT_UNAUTHORIZED');
    expect(decision.decision).not.toBe('REVIEW');
  });
});

describe('CMS Thin Pack — API/FHIR', () => {
  it('17. authorized API client → ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'api_fhir',
        api_client_authorized: true,
        fhir_access_permitted: true,
        fhir_resource: 'Patient',
      },
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('18. unauthorized API client → DENY', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'api_fhir',
        api_client_authorized: false,
        fhir_access_permitted: true,
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_API_CLIENT_UNAUTHORIZED');
  });

  it('19. restricted FHIR resource access → DENY', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'api_fhir',
        api_client_authorized: true,
        fhir_access_permitted: false,
        fhir_resource: 'Claim',
      },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_FHIR_ACCESS_NOT_PERMITTED');
  });
});

describe('CMS Thin Pack — AI / Agent', () => {
  it('20. authorized AI agent → ALLOW', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'ai_agent',
      },
      agentId: 'agent_cms_1',
      toolId: 'tool_member_api',
      governanceExtras: { agent_authorized: true, tool_authorized: true },
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('CMS_INTEROP_CONTROLS_SATISFIED');
  });

  it('21. unauthorized tool → DENY', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'ai_agent',
      },
      agentId: 'agent_cms_1',
      toolId: 'tool_member_api',
      governanceExtras: { agent_authorized: true, tool_authorized: false },
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_AI_AGENT_TOOL_UNAUTHORIZED');
  });

  it('22. restricted cloud model on payer-to-payer → DENY', async () => {
    const repo = new InMemoryPolicyRepository();
    suspendNonCms(repo);
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'cloud-public-gpt',
      availableModels: ['cloud-public-gpt', 'local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.99,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:CMS'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      governance_context: {
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'payer_to_payer',
          payer_exchange_authorized: true,
          destination_authorized: true,
          cloud_model_restricted: true,
        },
      },
      request_id: 'req_cms_cloud',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CMS_PAYER_CLOUD_AI_RESTRICTED');
  });
});

describe('CMS Thin Pack — multi-pack composition', () => {
  it('23. HIPAA + CMS compose into one decision', async () => {
    const repo = new InMemoryPolicyRepository();
    // Keep HIPAA + CMS; suspend others
    for (const id of [
      'pol_part2_sud_records',
      'pol_part2_redisclosure',
      'pol_onc_hti1_dsi_input',
      'pol_onc_hti1_dsi_output',
    ]) {
      repo.setPolicyStatus(id, 'suspended');
    }
    suspendNonCms(repo);
    // re-activate HIPAA after suspendNonCms
    repo.setPolicyStatus('pol_hipaa_phi_local', 'active');
    repo.setPolicyStatus('pol_hipaa_release', 'active');
    repo.setPolicyStatus('pol_cms_interop_input', 'active');

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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:CMS',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      governance_context: {
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'patient_access',
          patient_authorized: true,
          application_authorized: true,
          purpose_permitted: true,
        },
      },
      request_id: 'req_cms_mp_hipaa',
    });
    expect(['ALLOW', 'TOKENIZE']).toContain(decision.decision);
    expect(decision.applicable_policies.some((p) => p.pack_id === 'pack_cms')).toBe(true);
    expect(decision.applicable_policies.some((p) => p.pack_id === 'pack_hipaa')).toBe(true);
    expect(decision.evaluation_id).toBeTruthy();
  });

  it('24. Part 2 + CMS — Part 2 restrictive outcome without consent', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_hipaa_phi_local', 'suspended');
    repo.setPolicyStatus('pol_hipaa_release', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_input', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_output', 'suspended');
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PART2',
        confidence: 0.99,
        risk: 'high',
        reason_codes: [
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:CMS',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      governance_context: {
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'patient_access',
          patient_authorized: true,
          application_authorized: true,
          purpose_permitted: true,
        },
      },
      request_id: 'req_cms_mp_part2',
    });
    expect(['DENY', 'REVIEW']).toContain(decision.decision);
    expect(decision.reason_codes.some((c) => c.startsWith('PART2_'))).toBe(true);
    expect(decision.applicable_policies.some((p) => p.pack_id === 'pack_cms')).toBe(true);
  });

  it('25. ONC + CMS — both contribute when tagged', async () => {
    const repo = new InMemoryPolicyRepository();
    suspendNonCms(repo);
    repo.setPolicyStatus('pol_onc_hti1_dsi_input', 'active');
    repo.setPolicyStatus('pol_cms_interop_input', 'active');
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:ONC_HTI1',
          'REGULATORY_APPLICABILITY:CMS',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      governance_context: {
        predictive_dsi: {
          applicability: 'applicable',
          use_class: 'administrative',
          risk_tier: 'low',
          version_governance_current: true,
        },
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'api_fhir',
          api_client_authorized: true,
          fhir_access_permitted: true,
        },
      },
      request_id: 'req_cms_mp_onc',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.applicable_policies.some((p) => p.pack_id === 'pack_cms')).toBe(true);
    expect(decision.applicable_policies.some((p) => p.pack_id === 'pack_onc_hti1')).toBe(true);
  });

  it('26. HIPAA + Part 2 + CMS multi-pack evidence', async () => {
    const repo = new InMemoryPolicyRepository();
    repo.setPolicyStatus('pol_onc_hti1_dsi_input', 'suspended');
    repo.setPolicyStatus('pol_onc_hti1_dsi_output', 'suspended');
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
          'REGULATORY_APPLICABILITY:CMS',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'part2_consent',
      governance_context: {
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'provider_access',
          provider_identity_verified: true,
          provider_authorized: true,
        },
      },
      request_id: 'req_cms_mp_all',
    });
    expect(decision.evaluation_id).toBeTruthy();
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.request_id).toBe('req_cms_mp_all');
    expect(decision.applicable_policies.some((p) => p.pack_id === 'pack_cms')).toBe(true);
    expect(
      decision.applicable_policies.some(
        (p) => p.pack_id === 'pack_hipaa' || p.pack_id === 'pack_42_cfr_part_2',
      ),
    ).toBe(true);
  });
});

describe('CMS Thin Pack — end-to-end enforcement evidence', () => {
  it('DENY leaves evaluation provenance and blocks models', async () => {
    const { decision, repo } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'patient_access',
        patient_authorized: false,
        application_authorized: true,
        purpose_permitted: true,
      },
      requestId: 'req_cms_e2e_deny',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.restrictions.eligible_models ?? []).toEqual([]);
    const rule = decision.explanation.provenance?.matched_rules.find(
      (r) => r.rule_id === 'CMS-R-PATIENT-AUTHORIZED-ACCESS',
    );
    expect(rule).toBeDefined();
    expect(rule!.source_ids).toContain('src_cms_interop');
    const stored = repo.getEvaluation(decision.evaluation_id!)!;
    expect(stored.request_id).toBe('req_cms_e2e_deny');
    expect(stored.decision).toBe('DENY');
  });

  it('TOKENIZE produces transform obligation evidence', async () => {
    const { decision } = await evaluateCms({
      interop: {
        applicability: 'applicable',
        workflow: 'patient_access',
        patient_authorized: true,
        application_authorized: true,
        purpose_permitted: true,
        data_scope_excessive: true,
      },
      requestId: 'req_cms_e2e_tok',
    });
    expect(decision.decision).toBe('TOKENIZE');
    expect(decision.transformations.some((t) => t.type === 'TOKENIZE')).toBe(true);
  });
});

describe('CMS Thin Pack — gate derivation', () => {
  it('derives controls for authorized prior_auth prepare', () => {
    const gates = deriveCmsGates({
      trust_level: 'trusted',
      application_status: 'active',
      application_type: 'clinical',
      allowed_operations: ['submit'],
      allowed_models: ['local-general-v1'],
      operation: 'submit',
      classification: 'PHI',
      deployment_mode: 'connected',
      roles: ['clinician'],
      available_models: ['local-general-v1'],
      regulatory_applicability: ['CMS'],
      purpose: 'treatment',
      governance_context: {
        healthcare_interop: {
          applicability: 'applicable',
          workflow: 'prior_auth',
          prior_auth_stage: 'prepare',
          prior_auth_authorized: true,
        },
      },
    });
    expect(gates.cms_controls_satisfied).toBe(true);
    expect(gates.prior_auth_stage).toBe('prepare');
  });
});
