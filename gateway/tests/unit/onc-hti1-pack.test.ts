import { describe, expect, it } from 'vitest';
import type { Application, User } from '../../src/identity/types.js';
import type { PredictiveDsiEvidence } from '../../src/policy/types.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  ONC_HTI1_PACK_META,
  ONC_HTI1_PROVENANCE_GRAPH,
  applyOncHti1PackV1Input,
  compileOncHti1Pack,
  deriveOncHti1Gates,
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
  allowed_operations: ['summarize', 'analyze'],
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

function approvedClinicalDsi(overrides: Partial<PredictiveDsiEvidence> = {}): PredictiveDsiEvidence {
  return {
    applicability: 'applicable',
    organization_role: 'provider',
    certified_health_it_context: true,
    algorithm_id: 'alg_sepsis_v2',
    model_id: 'mdl_sepsis_risk',
    model_version: '2.1.0',
    provider: 'Acme Clinical AI',
    intended_use: 'clinical_decision_support',
    intended_users: 'licensed_clinicians',
    population: 'adult_inpatients',
    use_class: 'clinical',
    risk_tier: 'high',
    transparency_sufficient: true,
    development_info_available: true,
    evaluation_info_available: true,
    performance_info_available: true,
    known_limitations_documented: true,
    fairness_considerations_documented: true,
    monitoring_info_available: true,
    faves_status: 'sufficient',
    faves: { fair: true, appropriate: true, valid: true, effective: true, safe: true },
    risk_management_status: 'sufficient',
    human_oversight: true,
    version_governance_current: true,
    governance_status: 'sufficient',
    ...overrides,
  };
}

async function evaluateOnc(opts: {
  dsi?: PredictiveDsiEvidence;
  applicability?: string[];
  purpose?: string;
  requestId?: string;
}) {
  const repo = new InMemoryPolicyRepository();
  repo.setPolicyStatus('pol_hipaa_phi_local', 'suspended');
  repo.setPolicyStatus('pol_hipaa_release', 'suspended');
  repo.setPolicyStatus('pol_part2_sud_records', 'suspended');
  repo.setPolicyStatus('pol_part2_redisclosure', 'suspended');
  // Suspend non-healthcare overlays that may REVIEW without their evidence
  for (const id of [
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
  const pdp = new PackBackedEnterprisePdp(repo);
  return pdp.evaluateLegacyRequest({
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
      reason_codes: (opts.applicability ?? ['REGULATORY_APPLICABILITY:ONC_HTI1']).map((c) =>
        c.startsWith('REGULATORY_APPLICABILITY:') ? c : `REGULATORY_APPLICABILITY:${c}`,
      ),
    },
    deploymentMode: 'connected',
    purpose: opts.purpose ?? 'treatment',
    authorization_context: 'authorized',
    governance_context: opts.dsi ? { predictive_dsi: opts.dsi } : undefined,
    request_id: opts.requestId ?? 'req_onc_hti1',
  });
}

describe('ONC HTI-1 Thin Pack — integrity', () => {
  it('loads, validates, and compiles ONC pack with provenance', () => {
    const compiled = compileOncHti1Pack();
    expect(compiled.pack_id).toBe('pack_onc_hti1');
    expect(compiled.pack_version).toBe('1.0.0');
    expect(compiled.policies.map((p) => p.interpreter)).toEqual(
      expect.arrayContaining(['onc_hti1_pack_v1', 'onc_hti1_pack_v1_output']),
    );
    expect(compiled.rules.length).toBeGreaterThanOrEqual(10);
    expect(compiled.provenance.sources.src_onc_hti1?.authority_id).toBe('auth_onc_hti1');
    expect(compiled.provenance.sources.src_onc_hti1?.legal_authority).toBe(true);
    expect(compiled.provenance.obligations['ONC-OBL-FAVES']?.citations.length).toBeGreaterThan(0);
  });

  it('snapshot activates ONC policies and healthcare domain membership', () => {
    const repo = new InMemoryPolicyRepository();
    expect(repo.getPolicy('pol_onc_hti1_dsi_input')?.interpreter).toBe('onc_hti1_pack_v1');
    expect(repo.getPolicy('pol_onc_hti1_dsi_input')?.status).toBe('active');
    expect(listDomainPackIds('healthcare')).toEqual(
      expect.arrayContaining(['pack_hipaa', 'pack_42_cfr_part_2', 'pack_onc_hti1']),
    );
    expect(listRegisteredOverlayInterpreters()).toEqual(
      expect.arrayContaining(['onc_hti1_pack_v1', 'onc_hti1_pack_v1_output']),
    );
    expect(ONC_HTI1_PACK_META.pack_id).toBe('pack_onc_hti1');
    expect(ONC_HTI1_PROVENANCE_GRAPH.sources.src_onc_hti1).toBeDefined();
  });

  it('skips when ONC_HTI1 tag is absent (no false violation)', () => {
    const meta = compileOncHti1Pack().policies.find((p) => p.phase === 'input')!;
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
        predictive_dsi: { applicability: 'applicable', risk_tier: 'high', use_class: 'clinical' },
      },
    };
    const out = applyOncHti1PackV1Input(baseAllow(), facts, meta);
    expect(out.matched).toContain('onc_hti1_pack_v1_skip_not_applicable');
    expect(out.decision).toBe('ALLOW');
  });
});

describe('ONC HTI-1 Thin Pack — end-to-end scenarios', () => {
  it('Scenario 1: Approved clinical predictive model → ALLOW', async () => {
    const decision = await evaluateOnc({
      dsi: approvedClinicalDsi(),
      requestId: 'req_onc_s1',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('ONC_DSI_GOVERNANCE_CONTROLS_SATISFIED');
    expect(decision.applicable_policies.some((p) => p.pack_id === 'pack_onc_hti1')).toBe(true);
    const rule = decision.explanation.provenance?.matched_rules.find(
      (r) => r.rule_id === 'ONC-R-DSI-CONTROLS-SATISFIED',
    );
    expect(rule).toBeDefined();
    expect(rule!.source_ids).toContain('src_onc_hti1');
  });

  it('Scenario 2: Missing model identity (clinical, not high) → REVIEW', async () => {
    const decision = await evaluateOnc({
      dsi: approvedClinicalDsi({
        risk_tier: 'medium',
        algorithm_id: undefined,
        model_id: undefined,
        faves_status: undefined,
        faves: undefined,
        transparency_sufficient: undefined,
      }),
      requestId: 'req_onc_s2',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('ONC_DSI_IDENTITY_CONTEXT_INSUFFICIENT');
    expect(
      decision.obligations.some((o) => o.code === 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION'),
    ).toBe(true);
  });

  it('Scenario 2b: High-risk clinical missing identity → DENY', async () => {
    const decision = await evaluateOnc({
      dsi: approvedClinicalDsi({
        algorithm_id: undefined,
        model_id: undefined,
      }),
      requestId: 'req_onc_s2b',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('ONC_DSI_IDENTITY_REQUIRED');
  });

  it('Scenario 3: High-risk missing safety (FAVES) evidence → REVIEW', async () => {
    const decision = await evaluateOnc({
      dsi: approvedClinicalDsi({
        faves_status: 'incomplete',
        faves: { fair: true, appropriate: true, valid: true, effective: true, safe: false },
      }),
      requestId: 'req_onc_s3',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('ONC_DSI_FAVES_EVIDENCE_INSUFFICIENT');
  });

  it('Scenario 4: High-risk missing evaluation / transparency evidence → REVIEW', async () => {
    const decision = await evaluateOnc({
      dsi: approvedClinicalDsi({
        transparency_sufficient: false,
        source_attributes_documented: false,
        development_info_available: false,
        evaluation_info_available: false,
        performance_info_available: false,
        intended_users: undefined,
        population: undefined,
      }),
      requestId: 'req_onc_s4',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('ONC_DSI_TRANSPARENCY_EVIDENCE_INSUFFICIENT');
  });

  it('Scenario 5: Model version changed / stale governance → REVIEW', async () => {
    const decision = await evaluateOnc({
      dsi: approvedClinicalDsi({
        version_changed: true,
        version_governance_current: false,
        governance_status: 'stale',
      }),
      requestId: 'req_onc_s5',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('ONC_DSI_VERSION_GOVERNANCE_STALE');
  });

  it('Scenario 6: Administrative low-risk AI → ALLOW', async () => {
    const decision = await evaluateOnc({
      dsi: {
        applicability: 'applicable',
        organization_role: 'provider',
        certified_health_it_context: true,
        algorithm_id: 'alg_admin_routing',
        intended_use: 'administrative_decision_support',
        use_class: 'administrative',
        risk_tier: 'low',
        version_governance_current: true,
      },
      requestId: 'req_onc_s6',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('ONC_DSI_GOVERNANCE_CONTROLS_SATISFIED');
  });

  it('Scenario 7: Non-applicable organization (payer) → NOT_APPLICABLE / ALLOW', async () => {
    const decision = await evaluateOnc({
      dsi: {
        applicability: 'not_applicable',
        organization_role: 'payer',
        certified_health_it_context: false,
        use_class: 'clinical',
        risk_tier: 'high',
      },
      requestId: 'req_onc_s7',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('ONC_DSI_NOT_APPLICABLE');
    expect(decision.reason_codes).not.toContain('ONC_DSI_IDENTITY_REQUIRED');
    expect(decision.reason_codes).not.toContain('ONC_DSI_FAVES_EVIDENCE_INSUFFICIENT');
  });

  it('Scenario 8: Unknown applicability + high-risk clinical → REVIEW', async () => {
    const decision = await evaluateOnc({
      dsi: {
        applicability: 'unknown',
        organization_role: 'provider',
        certified_health_it_context: false,
        use_class: 'clinical',
        intended_use: 'clinical_decision_support',
        risk_tier: 'high',
        algorithm_id: 'alg_x',
      },
      requestId: 'req_onc_s8',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('ONC_DSI_APPLICABILITY_UNKNOWN');
  });

  it('Scenario 9: Human oversight required / missing → REVIEW', async () => {
    const decision = await evaluateOnc({
      dsi: approvedClinicalDsi({
        human_oversight: false,
        human_oversight_status: 'missing',
      }),
      requestId: 'req_onc_s9',
    });
    expect(decision.decision).toBe('REVIEW');
    expect(decision.reason_codes).toContain('ONC_DSI_HUMAN_OVERSIGHT_REQUIRED');
  });

  it('Scenario 10: Governance evidence complete → ALLOW + audit provenance', async () => {
    const decision = await evaluateOnc({
      dsi: approvedClinicalDsi(),
      requestId: 'req_onc_s10',
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toContain('ONC_DSI_GOVERNANCE_CONTROLS_SATISFIED');
    expect(decision.evaluation_id).toBeTruthy();
    const repo = new InMemoryPolicyRepository();
    // Re-evaluate with same repo to verify stored record join fields
    repo.setPolicyStatus('pol_hipaa_phi_local', 'suspended');
    repo.setPolicyStatus('pol_hipaa_release', 'suspended');
    repo.setPolicyStatus('pol_part2_sud_records', 'suspended');
    repo.setPolicyStatus('pol_part2_redisclosure', 'suspended');
    const pdp = new PackBackedEnterprisePdp(repo);
    const d2 = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:ONC_HTI1'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      governance_context: { predictive_dsi: approvedClinicalDsi() },
      request_id: 'req_onc_s10_audit',
    });
    const stored = repo.getEvaluation(d2.evaluation_id!)!;
    expect(stored.request_id).toBe('req_onc_s10_audit');
    expect(stored.decision).toBe('ALLOW');
    expect(d2.explanation.provenance?.matched_rules.some((r) => r.rule_id.startsWith('ONC-R-'))).toBe(
      true,
    );
  });
});

describe('ONC HTI-1 Thin Pack — gate derivation', () => {
  it('derives reduced controls for low-risk administrative use', () => {
    const gates = deriveOncHti1Gates({
      trust_level: 'trusted',
      application_status: 'active',
      application_type: 'clinical',
      allowed_operations: ['summarize'],
      allowed_models: ['local-general-v1'],
      operation: 'summarize',
      classification: 'INTERNAL',
      deployment_mode: 'connected',
      roles: ['admin'],
      available_models: ['local-general-v1'],
      regulatory_applicability: ['ONC_HTI1'],
      governance_context: {
        predictive_dsi: {
          applicability: 'applicable',
          use_class: 'administrative',
          risk_tier: 'low',
        },
      },
    });
    expect(gates.clinical_predictive).toBe(false);
    expect(gates.high_risk).toBe(false);
    expect(gates.onc_controls_satisfied).toBe(true);
  });
});
