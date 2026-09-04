import { describe, expect, it } from 'vitest';
import { createPhase1Gateway } from '../../src/api/app-factory.js';
import {
  EnterprisePolicyAdapter,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
} from '../../src/policy/enterprise/index.js';
import { DeterministicPolicyEngine } from '../../src/policy/engine.js';
import type { Application, User } from '../../src/identity/types.js';

describe('Enigma EPA M3 admin lifecycle', () => {
  it('validates, simulates, activates, and suspends policies', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    const packs = await server.inject({
      method: 'GET',
      url: '/v1/admin/policy-packs',
      headers: auth,
    });
    expect(packs.statusCode).toBe(200);
    expect(packs.json().engine_mode).toBe('enterprise');
    expect(packs.json().packs.length).toBeGreaterThan(0);

    const validate = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_phase2_core/validate',
      headers: auth,
    });
    expect(validate.statusCode).toBe(200);
    expect(validate.json().ok).toBe(true);

    const simulate = await server.inject({
      method: 'POST',
      url: '/v1/admin/policy/simulate',
      headers: auth,
      payload: {
        classification: 'PHI',
        requested_model: 'cloud-public-gpt',
        application_type: 'clinical',
        roles: ['clinician'],
      },
    });
    expect(simulate.statusCode).toBe(200);
    expect(simulate.json().model_executed).toBe(false);
    expect(simulate.json().decision.decision).toBe('DENY');

    const activate = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_phase2_core/activate',
      headers: auth,
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().status).toBe('activated');

    const suspend = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_phase2_core/suspend',
      headers: auth,
    });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().status).toBe('suspended');

    const activateBlocked = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_phase2_core/activate',
      headers: auth,
    });
    expect(activateBlocked.statusCode).toBe(400);

    const approve = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_phase2_core/approve',
      headers: auth,
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().status).toBe('approved');

    // Reactivate after approve.
    const reactivate = await server.inject({
      method: 'POST',
      url: '/v1/admin/policies/pol_phase2_core/activate',
      headers: auth,
    });
    expect(reactivate.statusCode).toBe(200);
  });

  it('fail-closes when pack PDP throws', async () => {
    const legacy = new DeterministicPolicyEngine({ defaultLocalModel: 'local-general-v1' });
    const throwingPdp = {
      async evaluate() {
        throw new Error('boom');
      },
      async evaluateLegacyRequest() {
        throw new Error('boom');
      },
      async evaluateLegacyResponse() {
        throw new Error('boom');
      },
    };
    const adapter = new EnterprisePolicyAdapter(throwingPdp as never, legacy, {
      mode: 'enterprise',
    });

    const user: User = {
      user_id: 'u1',
      organization_id: 'o1',
      roles: ['clinician'],
      permissions: [],
      status: 'active',
    };
    const app: Application = {
      application_id: 'a1',
      organization_id: 'o1',
      name: 'App',
      type: 'clinical',
      environment: 'prod',
      status: 'active',
      trust_level: 'trusted',
      allowed_models: ['local-general-v1'],
      allowed_datasets: [],
      allowed_operations: ['summarize'],
    };

    const result = await adapter.evaluateRequest({
      user,
      application: app,
      operation: 'summarize',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'Internal',
        confidence: 1,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(result.decision).toBe('BLOCK');
    expect(result.reason_codes).toContain('POLICY_ENGINE_FAILURE');
  });

  it('shadow mode enforces EPA and reports mismatches', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const legacy = new DeterministicPolicyEngine({ defaultLocalModel: 'local-general-v1' });
    const mismatches: unknown[] = [];
    const adapter = new EnterprisePolicyAdapter(pdp, legacy, {
      mode: 'shadow',
      onMismatch: (m) => mismatches.push(m),
    });

    const user: User = {
      user_id: 'u1',
      organization_id: 'o1',
      roles: ['clinician'],
      permissions: [],
      status: 'active',
    };
    const app: Application = {
      application_id: 'a1',
      organization_id: 'o1',
      name: 'App',
      type: 'clinical',
      environment: 'prod',
      status: 'active',
      trust_level: 'trusted',
      allowed_models: ['local-general-v1'],
      allowed_datasets: [],
      allowed_operations: ['summarize'],
    };

    const result = await adapter.evaluateRequest({
      user,
      application: app,
      operation: 'summarize',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'Internal',
        confidence: 1,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(result.decision).toBe('ALLOW');
    expect(mismatches).toHaveLength(0);
  });
});
