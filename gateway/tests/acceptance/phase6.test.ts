import { describe, expect, it } from 'vitest';
import { createPhase1Gateway } from '../../src/api/app-factory.js';

describe('Phase 6 — Admin API', () => {
  it('requires admin auth and returns overview', async () => {
    const gw = createPhase1Gateway();
    const server = await gw.buildServer();
    await server.ready();

    const denied = await server.inject({ method: 'GET', url: '/v1/admin/overview' });
    expect(denied.statusCode).toBe(401);

    const ok = await server.inject({
      method: 'GET',
      url: '/v1/admin/overview',
      headers: { authorization: 'Bearer n2ai_admin_dev_key' },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.gateway.status).toBe('ok');
    expect(body.policy.status).toBe('ready');
    expect(body.models.active).toBeGreaterThan(0);

    const apps = await server.inject({
      method: 'GET',
      url: '/v1/admin/applications',
      headers: { authorization: 'Bearer n2ai_admin_dev_key' },
    });
    expect(apps.statusCode).toBe(200);
    expect(apps.json().applications.length).toBeGreaterThan(0);

    await server.close();
  });
});
