import { describe, expect, it } from 'vitest';
import { createPhase1Gateway } from '../../src/api/app-factory.js';

describe('Admin governance CRUD', () => {
  it('creates app, issues and revokes key, toggles policy and model', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
    });
    const server = await gw.buildServer();

    const createApp = await server.inject({
      method: 'POST',
      url: '/v1/admin/applications',
      headers: { authorization: 'Bearer test_admin' },
      payload: {
        name: 'Pilot App',
        allowed_models: 'local-general-v1',
        allowed_operations: 'summarize,generate',
      },
    });
    expect(createApp.statusCode).toBe(201);
    const appId = createApp.json().application.application_id as string;

    const issue = await server.inject({
      method: 'POST',
      url: '/v1/admin/api-keys',
      headers: { authorization: 'Bearer test_admin' },
      payload: { application_id: appId },
    });
    expect(issue.statusCode).toBe(201);
    expect(issue.json().secret).toMatch(/^n2ai_/);
    const keyId = issue.json().api_key.api_key_id as string;

    const revoke = await server.inject({
      method: 'POST',
      url: `/v1/admin/api-keys/${keyId}/revoke`,
      headers: { authorization: 'Bearer test_admin' },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().api_key.status).toBe('revoked');

    const policies = await server.inject({
      method: 'GET',
      url: '/v1/admin/policies',
      headers: { authorization: 'Bearer test_admin' },
    });
    expect(policies.statusCode).toBe(200);
    const policyId = policies.json().policies[0].policy_id as string;

    const disablePolicy = await server.inject({
      method: 'PATCH',
      url: `/v1/admin/policies/${policyId}`,
      headers: { authorization: 'Bearer test_admin' },
      payload: { status: 'disabled' },
    });
    expect(disablePolicy.statusCode).toBe(200);
    expect(disablePolicy.json().policy.status).toBe('disabled');

    const registerModel = await server.inject({
      method: 'POST',
      url: '/v1/admin/models',
      headers: { authorization: 'Bearer test_admin' },
      payload: {
        model_id: 'local-pilot-v1',
        name: 'Pilot Local',
        provider_id: 'local-runtime',
        kind: 'local',
      },
    });
    expect(registerModel.statusCode).toBe(201);

    const disableModel = await server.inject({
      method: 'PATCH',
      url: '/v1/admin/models/local-pilot-v1',
      headers: { authorization: 'Bearer test_admin' },
      payload: { status: 'disabled' },
    });
    expect(disableModel.statusCode).toBe(200);
    expect(disableModel.json().model.status).toBe('disabled');

    await server.close();
  });
});
