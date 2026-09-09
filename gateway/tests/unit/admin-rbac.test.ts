import { describe, expect, it } from 'vitest';
import { createPhase1Gateway, PHASE1_DEMO_API_KEY } from '../../src/api/app-factory.js';
import {
  hashAdminPassword,
  issueAdminSessionToken,
  type AdminUserRecord,
} from '../../src/admin/authz.js';
import { InMemoryAdminUserStore } from '../../src/admin/admin-users.js';
import { InMemoryIdentityStore } from '../../src/identity/store.js';
import type { Application, Organization, User } from '../../src/identity/types.js';

async function sessionFor(
  gw: ReturnType<typeof createPhase1Gateway>,
  username: string,
  password: string,
) {
  const server = await gw.buildServer();
  const res = await server.inject({
    method: 'POST',
    url: '/v1/admin/auth/login',
    payload: { username, password },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { token: string };
  return body.token;
}

describe('V1 admin RBAC + organization isolation', () => {
  it('ADMINISTRATOR can mutate; READ_ONLY cannot', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    const adminToken = await sessionFor(gw, 'admin', 'admin');
    const readToken = await sessionFor(gw, 'readonly', 'readonly');

    const denied = await server.inject({
      method: 'POST',
      url: '/v1/admin/applications',
      headers: { authorization: `Bearer ${readToken}` },
      payload: { name: 'Nope', type: 'internal' },
    });
    expect(denied.statusCode).toBe(403);

    const allowed = await server.inject({
      method: 'POST',
      url: '/v1/admin/applications',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Yes', type: 'internal' },
    });
    expect(allowed.statusCode).toBe(201);
  });

  it('OPERATOR cannot resolve governance decisions', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    const opToken = await sessionFor(gw, 'operator', 'operator');
    const res = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_missing/resolve',
      headers: { authorization: `Bearer ${opToken}` },
      payload: { disposition: 'AUTHORIZE' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GOVERNANCE_REVIEWER cannot modify policies or manage users', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    const revToken = await sessionFor(gw, 'reviewer', 'reviewer');

    const policyPatch = await server.inject({
      method: 'PATCH',
      url: '/v1/admin/policies/pol_missing',
      headers: { authorization: `Bearer ${revToken}` },
      payload: { status: 'disabled' },
    });
    expect(policyPatch.statusCode).toBe(403);

    const users = await server.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: { authorization: `Bearer ${revToken}` },
    });
    expect(users.statusCode).toBe(403);
  });

  it('GOVERNANCE_REVIEWER can call resolve (authz gate passes; missing eval → 404)', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    const revToken = await sessionFor(gw, 'reviewer', 'reviewer');
    const res = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_missing/resolve',
      headers: { authorization: `Bearer ${revToken}` },
      payload: { disposition: 'AUTHORIZE' },
    });
    // Role allowed; evaluation missing → not 403
    expect(res.statusCode).not.toBe(403);
    expect([404, 400, 409]).toContain(res.statusCode);
  });

  it('disabled users cannot authenticate', async () => {
    const now = new Date().toISOString();
    const disabled: AdminUserRecord = {
      user_id: 'admin_disabled',
      organization_id: 'org_demo',
      username: 'disabled_user',
      password_hash: hashAdminPassword('x'),
      role: 'ADMINISTRATOR',
      status: 'DISABLED',
      created_at: now,
      updated_at: now,
    };
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
      adminUsers: new InMemoryAdminUserStore([disabled]),
    });
    const server = await gw.buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { username: 'disabled_user', password: 'x' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ reason_code: 'USER_DISABLED' });
  });

  it('org A cannot list org B applications', async () => {
    const orgA: Organization = {
      organization_id: 'org_a',
      name: 'A',
      status: 'active',
      configuration: {},
    };
    const orgB: Organization = {
      organization_id: 'org_b',
      name: 'B',
      status: 'active',
      configuration: {},
    };
    const appB: Application = {
      application_id: 'app_b',
      organization_id: 'org_b',
      name: 'B App',
      type: 'internal',
      environment: 'prod',
      status: 'active',
      trust_level: 'standard',
      allowed_models: ['local-general-v1'],
      allowed_datasets: [],
      allowed_operations: ['summarize'],
    };
    const user: User = {
      user_id: 'user_a',
      organization_id: 'org_a',
      roles: [],
      permissions: [],
      status: 'active',
    };
    const now = new Date().toISOString();
    const adminA: AdminUserRecord = {
      user_id: 'admin_a',
      organization_id: 'org_a',
      username: 'admin_a',
      password_hash: hashAdminPassword('a'),
      role: 'ADMINISTRATOR',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    };
    const gw = createPhase1Gateway({
      config: {
        adminApiKey: 'test_admin_key',
      } as never,
      identityStore: new InMemoryIdentityStore({
        organizations: [orgA, orgB],
        applications: [appB],
        users: [user],
        apiKeys: [],
      }),
      adminUsers: new InMemoryAdminUserStore([adminA]),
    });
    // Force default org for API key path away from org_demo for this test —
    // login as org_a admin instead.
    process.env.GATEWAY_DEFAULT_ORGANIZATION_ID = 'org_a';
    const server = await gw.buildServer();
    const token = await sessionFor(gw, 'admin_a', 'a');
    const res = await server.inject({
      method: 'GET',
      url: '/v1/admin/applications',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const apps = (res.json() as { applications: Array<{ application_id: string }> })
      .applications;
    expect(apps.find((a) => a.application_id === 'app_b')).toBeUndefined();
    delete process.env.GATEWAY_DEFAULT_ORGANIZATION_ID;
  });

  it('provider credential GET never returns plaintext api_key', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    await gw.providerCredentials.upsert({
      application_id: 'app_clinical',
      organization_id: 'org_demo',
      provider_kind: 'openai_compatible',
      endpoint_url: 'https://example.test/v1',
      api_key: 'sk-secret-should-not-leak',
    });
    const res = await server.inject({
      method: 'GET',
      url: '/v1/admin/applications/app_clinical/provider-credential',
      headers: { authorization: 'Bearer test_admin_key' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      provider_credential?: { api_key?: string; api_key_last4?: string };
    };
    expect(body.provider_credential?.api_key).toBeUndefined();
    expect(body.provider_credential?.api_key_last4).toBe('leak');
  });

  it('machine admin API key still authenticates as ADMINISTRATOR', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    const me = await server.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: { authorization: 'Bearer test_admin_key' },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      role: 'ADMINISTRATOR',
      auth_method: 'api_key',
    });
  });

  it('all roles can read overview', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    for (const [user, pass] of [
      ['admin', 'admin'],
      ['reviewer', 'reviewer'],
      ['operator', 'operator'],
      ['readonly', 'readonly'],
    ] as const) {
      const token = await sessionFor(gw, user, pass);
      const res = await server.inject({
        method: 'GET',
        url: '/v1/admin/overview',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    }
  });

  // Keep completions path untouched
  it('runtime completions still work with app API key', async () => {
    const gw = createPhase1Gateway();
    const server = await gw.buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/completions',
      headers: {
        authorization: `Bearer ${PHASE1_DEMO_API_KEY}`,
        'content-type': 'application/json',
      },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'summarize',
        model: 'local-general-v1',
        messages: [{ role: 'user', content: 'hello' }],
      },
    });
    expect(res.statusCode).toBeLessThan(500);
  });

  it('ADMINISTRATOR can list, create, role-change, disable/enable, and reset password', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    const adminToken = await sessionFor(gw, 'admin', 'admin');

    const listed = await server.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = listed.json() as { users: Array<Record<string, unknown>> };
    expect(listedBody.users.length).toBeGreaterThan(0);
    for (const u of listedBody.users) {
      expect(u).not.toHaveProperty('password_hash');
      expect(u).not.toHaveProperty('password');
    }

    const created = await server.inject({
      method: 'POST',
      url: '/v1/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'ops_new',
        password: 'ops_new_pass',
        role: 'OPERATOR',
        organization_id: 'org_other',
      },
    });
    expect(created.statusCode).toBe(400);

    const createdOk = await server.inject({
      method: 'POST',
      url: '/v1/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'ops_new',
        password: 'ops_new_pass',
        role: 'OPERATOR',
      },
    });
    expect(createdOk.statusCode).toBe(201);
    const createdUser = (createdOk.json() as { user: Record<string, unknown> }).user;
    expect(createdUser).toMatchObject({
      username: 'ops_new',
      role: 'OPERATOR',
      status: 'ACTIVE',
      organization_id: 'org_demo',
    });
    expect(createdUser).not.toHaveProperty('password_hash');
    expect(createdUser).not.toHaveProperty('password');
    const userId = String(createdUser.user_id);

    const rolePatch = await server.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'READ_ONLY' },
    });
    expect(rolePatch.statusCode).toBe(200);
    expect((rolePatch.json() as { user: { role: string } }).user.role).toBe('READ_ONLY');

    const disable = await server.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'DISABLED' },
    });
    expect(disable.statusCode).toBe(200);
    expect((disable.json() as { user: { status: string } }).user.status).toBe(
      'DISABLED',
    );

    const disabledLogin = await server.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { username: 'ops_new', password: 'ops_new_pass' },
    });
    expect(disabledLogin.statusCode).toBe(403);

    const enable = await server.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'ACTIVE' },
    });
    expect(enable.statusCode).toBe(200);

    const reset = await server.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { password: 'ops_new_pass_2' },
    });
    expect(reset.statusCode).toBe(200);
    expect((reset.json() as { user: Record<string, unknown> }).user).not.toHaveProperty(
      'password',
    );

    const loginNew = await server.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { username: 'ops_new', password: 'ops_new_pass_2' },
    });
    expect(loginNew.statusCode).toBe(200);
  });

  it('non-administrators cannot manage users', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();

    for (const [user, pass] of [
      ['reviewer', 'reviewer'],
      ['operator', 'operator'],
      ['readonly', 'readonly'],
    ] as const) {
      const token = await sessionFor(gw, user, pass);
      for (const req of [
        { method: 'GET' as const, url: '/v1/admin/users' },
        {
          method: 'POST' as const,
          url: '/v1/admin/users',
          payload: { username: 'x', password: 'y', role: 'READ_ONLY' },
        },
        {
          method: 'PATCH' as const,
          url: '/v1/admin/users/admin_seed',
          payload: { role: 'ADMINISTRATOR' },
        },
      ]) {
        const res = await server.inject({
          method: req.method,
          url: req.url,
          headers: { authorization: `Bearer ${token}` },
          payload: 'payload' in req ? req.payload : undefined,
        });
        expect(res.statusCode).toBe(403);
      }
    }
  });

  it('administrator cannot change own role or disable self', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin_key' } as never,
    });
    const server = await gw.buildServer();
    const adminToken = await sessionFor(gw, 'admin', 'admin');
    const me = await server.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const userId = (me.json() as { user_id: string }).user_id;

    const roleSelf = await server.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'OPERATOR' },
    });
    expect(roleSelf.statusCode).toBe(400);

    const disableSelf = await server.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'DISABLED' },
    });
    expect(disableSelf.statusCode).toBe(400);
  });
});

describe('admin session token', () => {
  it('issues and authenticates session JWT', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'sess_key' } as never,
    });
    const token = await issueAdminSessionToken(
      {
        user_id: 'u1',
        name: 'u1',
        organization_id: 'org_demo',
        role: 'OPERATOR',
        status: 'ACTIVE',
      },
      gw.config,
    );
    const server = await gw.buildServer();
    const res = await server.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: 'OPERATOR' });
  });
});
