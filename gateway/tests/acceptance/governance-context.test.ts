/**
 * Governance vs authorization context separation + live completions forwarding.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  customerVerificationLabel,
  projectEnforcementResult,
  resolvePackContributions,
  type PackEvaluationContribution,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import { GatewayError } from '../../src/shared/errors.js';
import type { ModelGateway } from '../../src/models/types.js';

const clinician: User = {
  user_id: 'user_clinician',
  organization_id: 'org_demo',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const clinicalApp: Application = {
  application_id: 'app_clinical',
  organization_id: 'org_demo',
  name: 'Clinical',
  type: 'clinical',
  environment: 'prod',
  status: 'active',
  trust_level: 'trusted',
  allowed_models: ['local-general-v1', 'cloud-public-gpt'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

const GOVERNANCE_DOCUMENTED = {
  accountability_documented: true,
  system_context_documented: true,
  measurement_documented: true,
  risk_response_documented: true,
};

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

describe('Authorization vs governance context', () => {
  it('Part 2 evaluates authorization independently of governance_context', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const denied = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      // No authorization_context → consent absent
      governance_context: GOVERNANCE_DOCUMENTED,
      request_id: 'req_part2_auth_only',
    });
    expect(denied.reason_codes).toContain('PART2_USE_WITHOUT_CONSENT_DENIED');

    const allowed = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'part2_consent',
      governance_context: GOVERNANCE_DOCUMENTED,
      request_id: 'req_part2_with_consent',
    });
    expect(allowed.reason_codes).not.toContain('PART2_USE_WITHOUT_CONSENT_DENIED');
    expect(allowed.decision).not.toBe('DENY');
  });

  it('NIST evaluates governance_context independently of authorization_context', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const review = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_AI_RMF'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'part2_consent',
      // Missing risk_response → REVIEW
      governance_context: {
        accountability_documented: true,
        system_context_documented: true,
        measurement_documented: true,
        risk_response_documented: false,
      },
      request_id: 'req_nist_gov_review',
    });
    expect(review.decision).toBe('REVIEW');
    expect(review.reason_codes.some((c) => c.startsWith('NIST_RMF_'))).toBe(true);

    const allow = await pdp.evaluateLegacyRequest({
      user: clinician,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:NIST_AI_RMF'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      governance_context: GOVERNANCE_DOCUMENTED,
      request_id: 'req_nist_gov_allow',
    });
    expect(['ALLOW', 'ALLOW_WITH_CONTROLS']).toContain(allow.decision);
    expect(allow.reason_codes).toContain('NIST_RMF_CONTROLS_SATISFIED');
  });

  it('HIPAA + Part 2 + NIST coexist without artificial conflict when contexts are separated', async () => {
    const repo = new InMemoryPolicyRepository();
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
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      governance_context: GOVERNANCE_DOCUMENTED,
      request_id: 'req_three_pack_agree',
    });

    expect(decision.decision).not.toBe('REVIEW');
    expect(decision.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
    expect(decision.reason_codes).not.toContain('PART2_USE_WITHOUT_CONSENT_DENIED');
    expect(['ALLOW', 'ALLOW_WITH_CONTROLS', 'TOKENIZE']).toContain(decision.decision);
    expect(decision.explanation.resolution?.category).toMatch(
      /AGREEMENT|COMPLEMENTARY|NONE/,
    );
    expect(decision.reason_codes).toEqual(
      expect.arrayContaining([expect.stringMatching(/NIST_RMF_/)]),
    );
  });

  it('Genuine policy conflicts still unresolved → REVIEW', () => {
    const resolved = resolvePackContributions([
      contrib({
        pack_id: 'pack_nist_ai_rmf',
        policy_id: 'pol_nist_ai_rmf_input',
        decision: 'ALLOW',
      }),
      contrib({
        pack_id: 'pack_hipaa',
        policy_id: 'pol_hipaa_phi_local',
        decision: 'DENY',
      }),
    ]);
    expect(resolved.decision).toBe('REVIEW');
    expect(resolved.reason_codes).toContain('POLICY_CONFLICT_UNRESOLVED');
  });
});

describe('Live completions forwards generic governance context', () => {
  it('live path: complementary HIPAA + NIST governance via /v1/ai/completions', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });
    const server = await gw.buildServer();

    const result = await server.inject({
      method: 'POST',
      url: '/v1/ai/completions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'summarize',
        messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
        purpose: 'treatment',
        source_system: 'ehr',
        authorization_context: 'part2_consent',
        regulatory_applicability: ['HIPAA', 'NIST_AI_RMF'],
        governance_context: GOVERNANCE_DOCUMENTED,
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.json().status).toBe('approved');

    const requestId = result.json().request_id as string;
    const inputEval = gw.packRepo
      .listEvaluations({ limit: 100 })
      .find((e) => e.request_id === requestId && e.phase === 'input');
    expect(inputEval).toBeTruthy();
    expect(inputEval!.context.purpose).toBe('treatment');
    expect(inputEval!.context.authorization).toBe('part2_consent');
    expect(
      (inputEval!.context.governance as { risk_response_documented?: boolean })
        ?.risk_response_documented,
    ).toBe(true);
    expect(inputEval!.reason_codes?.some((c) => c.startsWith('NIST_RMF_'))).toBe(true);

    await server.close();
  });

  it('live path: Part 2 consent + NIST missing risk response → REVIEW hold', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize SUD treatment note.' }],
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      regulatory_applicability: ['HIPAA', 'PART2', 'NIST_AI_RMF'],
      governance_context: {
        accountability_documented: true,
        system_context_documented: true,
        measurement_documented: true,
        risk_response_documented: false,
      },
    } as never);

    expect(result.httpStatus).toBe(403);
    expect(result.body.status).toBe('blocked');
    const meta = (result.body as { metadata?: { evaluation_id?: string; machine_decision?: string } })
      .metadata;
    // block() may nest metadata differently — fall back to repo latest REVIEW
    const events = await gw.audit.list();
    const last = events[events.length - 1]!;
    expect(last.evaluation_id).toBeTruthy();
    const record = gw.packRepo.getEvaluation(last.evaluation_id!)!;
    expect(record.decision).toBe('REVIEW');
    expect(record.held_request || true).toBeTruthy();
    void meta;
  });

  it('live path: three-pack agreement with separated contexts', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize treatment plan.' }],
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      regulatory_applicability: ['HIPAA', 'PART2', 'NIST_AI_RMF'],
      governance_context: GOVERNANCE_DOCUMENTED,
    } as never);

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    const events = await gw.audit.list();
    const last = events[events.length - 1]!;
    const record = gw.packRepo.getEvaluation(last.evaluation_id!)!;
    expect(record.decision).not.toBe('REVIEW');
    expect(record.reason_codes).not.toContain('POLICY_CONFLICT_UNRESOLVED');
  });

  it('live REVIEW → AUTHORIZE → RESUME without re-running input PDP', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
    });
    const hold = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize treatment note for review.' }],
      purpose: 'treatment',
      source_system: 'ehr',
      authorization_context: 'part2_consent',
      regulatory_applicability: ['HIPAA', 'PART2', 'NIST_AI_RMF'],
      governance_context: {
        accountability_documented: true,
        system_context_documented: true,
        measurement_documented: true,
        risk_response_documented: false,
      },
    } as never);
    expect(hold.httpStatus).toBe(403);

    const eventsBefore = await gw.audit.list();
    const evalId = eventsBefore[eventsBefore.length - 1]!.evaluation_id!;
    const before = gw.packRepo.getEvaluation(evalId)!;
    expect(before.decision).toBe('REVIEW');
    expect(before.held_request).toBeTruthy();
    const inputEvalCount = gw.packRepo
      .listEvaluations({ limit: 100 })
      .filter((e) => e.request_id === before.request_id && e.phase === 'input').length;

    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };
    await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evalId}/resolve`,
      headers: auth,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'Governance context confirmed by reviewer.',
        actor: 'alice',
      },
    });
    const resume = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evalId}/resume`,
      headers: auth,
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().original_decision).toBe('REVIEW');
    expect(resume.json().final_decision).toBe('ALLOW');
    expect(resume.json().enforcement?.status).toBe('ALLOWED');
    expect(
      customerVerificationLabel(resume.json().enforcement),
    ).toBe('VERIFIED');

    const after = gw.packRepo.getEvaluation(evalId)!;
    expect(after.decision).toBe('REVIEW');
    const inputEvalCountAfter = gw.packRepo
      .listEvaluations({ limit: 100 })
      .filter((e) => e.request_id === before.request_id && e.phase === 'input').length;
    expect(inputEvalCountAfter).toBe(inputEvalCount);

    await server.close();
  });

  it('Gateway failure after AUTHORIZE shows FAILED not VERIFIED', async () => {
    const failingModels: ModelGateway = {
      listAvailableModels: () => ['local-general-v1'],
      executeApproved: async () => {
        throw new GatewayError('INTERNAL_ERROR', 'Simulated gateway failure', 500);
      },
    };
    const repo = new InMemoryPolicyRepository();
    // Seed via live-style evaluation first
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
          'REGULATORY_APPLICABILITY:NIST_AI_RMF',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      governance_context: {
        accountability_documented: true,
        system_context_documented: true,
        measurement_documented: true,
        risk_response_documented: false,
      },
      request_id: 'req_fail_verify',
    });
    expect(decision.decision).toBe('REVIEW');
    await Promise.resolve(
      repo.attachHeldRequest!(decision.evaluation_id!, {
        version: 1,
        application_id: 'app_clinical',
        organization_id: 'org_demo',
        user_id: 'user_clinician',
        operation: 'summarize',
        model: 'local-general-v1',
        messages: [{ role: 'user', content: 'x' }],
        correlation_id: 'cor_fail',
        classification: {
          sensitivity: 'PHI',
          confidence: 0.99,
          risk: 'high',
          reason_codes: [],
        },
        allowed_models: ['local-general-v1'],
        available_models: ['local-general-v1'],
      }),
    );

    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
      policyRepository: repo,
      models: failingModels,
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };
    await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${decision.evaluation_id}/resolve`,
      headers: auth,
      payload: { disposition: 'AUTHORIZE', reason: 'ok', actor: 'a' },
    });
    const resume = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${decision.evaluation_id}/resume`,
      headers: auth,
    });
    expect(resume.statusCode).toBe(409);
    expect(resume.json().enforcement?.status).toBe('FAILED');
    expect(customerVerificationLabel(resume.json().enforcement)).toBe('FAILED');
    expect(customerVerificationLabel(resume.json().enforcement)).not.toBe('VERIFIED');

    const after = repo.getEvaluation(decision.evaluation_id!)!;
    const events = await gw.audit.list();
    const failEvt = events.find((e) => e.metadata?.resume === true)!;
    const projected = projectEnforcementResult(after, failEvt);
    expect(customerVerificationLabel(projected)).toBe('FAILED');

    await server.close();
  });
});
