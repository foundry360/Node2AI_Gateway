import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  FailingPolicyEngine,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';

describe('Phase 1 acceptance', () => {
  it('Test 1 — Normal request ALLOW through policy to approved model', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      expect(result.body.model).toBe('local-general-v1');
      expect(result.body.response.message.content).toContain('local-runtime');
    }

    const events = await gw.audit.list();
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1]!;
    expect(last.policy_decision).toBe('ALLOW');
    expect(last.response_decision).toBe('RELEASE');
    expect(last.provider).toBe('local-runtime');
  });

  it('Test 2 — Unauthorized model blocked', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [{ role: 'user', content: 'Try restricted model' }],
    });

    expect(result.httpStatus).toBe(403);
    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('MODEL_NOT_ELIGIBLE');
    }
  });

  it('Test 8 — Client security overrides rejected', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      sanitize_input: false,
      sanitize_output: false,
      messages: [{ role: 'user', content: 'Attempt override' }],
    });

    expect(result.httpStatus).toBe(400);
    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('VALIDATION_FAILED');
    }
  });

  it('Test 9 — PolicyEngine failure fails closed (BLOCK)', async () => {
    const gw = createPhase1Gateway({ policy: new FailingPolicyEngine() });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Should not execute' }],
    });

    expect(result.httpStatus).toBe(403);
    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('POLICY_ENGINE_FAILURE');
    }
  });

  it('Test 7 (application layer) — no ungoverned AI routes on server', async () => {
    const gw = createPhase1Gateway();
    const server = await gw.buildServer();
    await server.ready();

    const routes = server.printRoutes();
    // Single AI executor + admin read APIs (no provider passthrough)
    expect(routes).toContain('completions');
    expect(routes).toContain('overview');
    expect(routes.toLowerCase()).not.toContain('openai');
    expect(routes.toLowerCase()).not.toContain('bypass');
    expect(routes.toLowerCase()).not.toContain('provider/proxy');

    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const unauth = await server.inject({
      method: 'POST',
      url: '/v1/ai/completions',
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'summarize',
        messages: [{ role: 'user', content: 'no auth' }],
      },
    });
    expect(unauth.statusCode).toBe(401);

    await server.close();
  });

  it('Application identity mismatch is blocked', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_limited',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'spoof app id' }],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('APPLICATION_MISMATCH');
    }
  });

  it('Air-gap mode still succeeds on local stub without cloud provider', async () => {
    const gw = createPhase1Gateway({
      config: { deploymentMode: 'airgap' },
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Air-gap path' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    const events = await gw.audit.list();
    expect(events[events.length - 1]!.provider).toBe('local-runtime');
  });
});
