import { describe, expect, it } from 'vitest';
import {
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  projectRequestContext,
  toEvaluationListItem,
} from '../../src/policy/enterprise/index.js';
import type { Application, User } from '../../src/identity/types.js';
import { createPhase1Gateway } from '../../src/api/app-factory.js';

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

describe('Live request context persistence', () => {
  it('persists supplied request context on live evaluation; omits missing fields', async () => {
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
        reason_codes: [
          'REGULATORY_APPLICABILITY:HIPAA',
          'REGULATORY_APPLICABILITY:PART2',
        ],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'part2_consent',
      request_id: 'req_live_ctx_1',
    });

    const record = repo.getEvaluation(decision.evaluation_id);
    expect(record).toBeTruthy();
    expect(record!.request_id).toBe('req_live_ctx_1');
    expect(record!.phase).toBe('input');
    expect(record!.action).toBe('WRITE');
    expect(record!.context.purpose).toBe('treatment');
    expect(record!.context.authorization).toBe('part2_consent');
    expect(record!.context).not.toHaveProperty('recipient');
    expect(record!.evidence_in.classification).toBe('PHI');

    const projected = projectRequestContext(record!);
    expect(projected.execution_mode).toBe('live');
    expect(projected.request_id).toBe('req_live_ctx_1');
    expect(projected.purpose).toBe('treatment');
    expect(projected.authorization).toBe('part2_consent');
    expect(projected.classification).toBe('PHI');
    expect(projected.regulatory_applicability).toEqual(
      expect.arrayContaining(['HIPAA', 'PART2']),
    );
    expect(projected).not.toHaveProperty('recipient');
    expect(projected).not.toHaveProperty('source');
  });

  it('marks simulation phase and surfaces NOT_EXECUTED without inventing gateway success', async () => {
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
        confidence: 0.9,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      evaluation_phase: 'simulate',
      request_id: 'req_sim_ctx',
    });

    const record = repo.getEvaluation(decision.evaluation_id)!;
    expect(record.phase).toBe('simulate');
    const projected = projectRequestContext(record);
    expect(projected.execution_mode).toBe('simulation');
    expect(projected.purpose).toBe('treatment');

    const item = toEvaluationListItem(record, null);
    expect(item.enforcement.status).toBe('NOT_EXECUTED');
    expect(item.enforcement.verified).toBe(false);
  });

  it('admin detail returns request_context and execution summary for simulate', async () => {
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
        action: 'write',
        requested_model: 'local-general-v1',
        regulatory_applicability: ['HIPAA', 'PART2'],
        purpose: 'treatment',
        authorization_context: 'part2_consent',
      },
    });
    expect(sim.statusCode).toBe(200);
    const evaluationId = sim.json().decision?.evaluation_id as string;

    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: auth,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.request_context?.execution_mode).toBe('simulation');
    expect(body.request_context?.purpose).toBe('treatment');
    expect(body.request_context?.authorization).toBe('part2_consent');
    expect(body.request_context?.classification).toBe('PHI');
    expect(body.execution?.mode).toBe('simulation');
    expect(String(body.execution?.summary ?? '')).toMatch(/not executed/i);
    expect(body.enforcement?.status).toBe('NOT_EXECUTED');
    expect(body.enforcement?.verified).toBe(false);
    // Missing fields must stay absent (not fabricated as unknown/false).
    expect(body.request_context).not.toHaveProperty('recipient');

    await server.close();
  });
});
