import { describe, expect, it } from 'vitest';
import { createPhase1Gateway } from '../../src/api/app-factory.js';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  evaluationRecordToDecisionPayload,
  toEvaluationListItem,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';

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
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

describe('Policy evaluation authority (policy_evaluations)', () => {
  it('list reads from policy evaluations, not audit events', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });

    const policyId =
      decision.applicable_policies.find((p) => p.pack_id === 'pack_hipaa')?.policy_id ??
      decision.applicable_policies[0]!.policy_id;

    const listed = repo.listEvaluations({ policyId, limit: 10 });
    expect(listed.some((r) => r.evaluation_id === decision.evaluation_id)).toBe(true);

    const summary = toEvaluationListItem(listed[0]!);
    expect(summary.evaluation_id).toBeTruthy();
    expect(summary.decision).toBeTruthy();
    expect(summary.status).toBe('recorded');
    expect(summary).not.toHaveProperty('audit_id');
  });

  it('detail reads stored evaluation with resolution + multi-pack provenance', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
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
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA', 'REGULATORY_APPLICABILITY:PART2'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });

    const stored = repo.getEvaluation(decision.evaluation_id);
    expect(stored).toBeDefined();
    // HIPAA REVIEW + Part 2 DENY → restrictive DENY (not agreement).
    expect(stored!.decision).toBe('DENY');
    expect(stored!.explanation.resolution?.category).toBe('RESTRICTIVE');
    const rules = stored!.explanation.provenance?.matched_rules ?? [];
    expect(rules.some((r) => r.rule_id.startsWith('HIPAA-R-'))).toBe(true);
    expect(rules.some((r) => r.rule_id.startsWith('PART2-R-'))).toBe(true);

    const payload = evaluationRecordToDecisionPayload(stored!);
    expect(payload.decision).toBe(decision.decision);
    expect(payload.explanation.resolution?.category).toBe('RESTRICTIVE');
    expect(payload.explanation.operator).toBeDefined();
    expect(payload.explanation.operator?.contributions.length).toBeGreaterThanOrEqual(2);
    expect(payload.explanation.provenance?.matched_rules?.length).toBeGreaterThan(0);
  });

  it('admin list/detail use policy_evaluations; audit remains separate', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    const sim = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_hipaa_phi_local/simulate',
      headers: auth,
      payload: {
        classification: 'PHI',
        action: 'summarize',
        requested_model: 'local-general-v1',
        regulatory_applicability: ['HIPAA', 'PART2'],
        purpose: 'treatment',
        authorization_context: 'part2_consent',
      },
    });
    expect(sim.statusCode).toBe(200);
    const evaluationId = sim.json().decision?.evaluation_id as string;
    expect(evaluationId).toBeTruthy();
    const simExplanation = sim.json().decision?.explanation;
    expect(simExplanation?.resolution).toBeDefined();
    expect(simExplanation?.operator).toBeDefined();
    expect(simExplanation?.provenance?.matched_rules?.length).toBeGreaterThan(0);

    const list = await server.inject({
      method: 'GET',
      url: '/v1/admin/policies/pol_hipaa_phi_local/evaluations',
      headers: auth,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().source).toBe('policy_evaluations');
    expect(
      (list.json().evaluations as Array<{ evaluation_id: string }>).some(
        (e) => e.evaluation_id === evaluationId,
      ),
    ).toBe(true);

    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: auth,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().source).toBe('policy_evaluations');
    expect(detail.json().decision?.explanation?.resolution).toBeDefined();
    expect(detail.json().decision?.explanation?.operator).toBeDefined();
    expect(detail.json().decision?.explanation?.provenance).toBeDefined();
    expect(
      detail.json().decision?.explanation?.provenance?.matched_rules?.length,
    ).toBeGreaterThan(0);
    expect(detail.json().evaluation?.explanation?.resolution?.category).toBe(
      simExplanation?.resolution?.category,
    );
    expect(detail.json().consequence?.action_summary).toBeTruthy();
    expect(detail.json().consequence?.expected_action).toBeTruthy();
    expect(detail.json().enforcement?.status).toBeTruthy();
    // Simulate has no Gateway audit — must not claim BLOCKED.
    expect(detail.json().enforcement?.status).toBe('NOT_EXECUTED');
    expect(detail.json().enforcement?.verified).toBe(false);

    const decisions = await server.inject({
      method: 'GET',
      url: '/v1/admin/evaluations?limit=50&filter=all',
      headers: auth,
    });
    expect(decisions.statusCode).toBe(200);
    expect(decisions.json().source).toBe('policy_evaluations');
    expect(
      (decisions.json().evaluations as Array<{ evaluation_id: string }>).some(
        (e) => e.evaluation_id === evaluationId,
      ),
    ).toBe(true);
    const first = (decisions.json().evaluations as Array<{
      action_summary?: string;
      expected_action?: string;
      enforcement?: { status: string };
    }>)[0];
    expect(first?.action_summary).toBeTruthy();
    expect(first?.expected_action || first?.enforcement?.status).toBeTruthy();

    const audit = await server.inject({
      method: 'GET',
      url: '/v1/admin/audit',
      headers: auth,
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toBeDefined();

    await server.close();
  });
});
