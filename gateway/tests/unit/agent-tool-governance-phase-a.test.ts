/**
 * Phase A — First-class Agent/Tool governance (authorization substrate).
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
  GENERAL_APP_API_KEY,
} from '../../src/api/app-factory.js';
import { InMemoryActorRegistry } from '../../src/actors/index.js';
import type { ActorRegistry } from '../../src/actors/index.js';

const ADMIN = { authorization: 'Bearer test_admin' };
const CLINICAL = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };
const GENERAL = { authorization: `Bearer ${GENERAL_APP_API_KEY}` };

async function seedHappyPath(
  registry: ActorRegistry,
  deploymentId: string,
  opts?: {
    agentId?: string;
    toolId?: string;
    applicationId?: string;
    operations?: string[];
    agentStatus?: 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
    toolStatus?: 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
    grantOps?: string[];
  },
) {
  const agentId = opts?.agentId ?? 'agent_phase_a';
  const toolId = opts?.toolId ?? 'tool_phase_a';
  const applicationId = opts?.applicationId ?? 'app_clinical';
  const operations = opts?.operations ?? ['field_update', 'clinical_note', 'write'];
  await registry.createAgent({
    deployment_id: deploymentId,
    agent_id: agentId,
    organization_id: 'org_demo',
    name: 'Phase A Agent',
    status: opts?.agentStatus ?? 'ACTIVE',
    autonomy_level: 'HUMAN_APPROVED',
    metadata: {},
  });
  await registry.createTool({
    deployment_id: deploymentId,
    tool_id: toolId,
    organization_id: 'org_demo',
    name: 'Phase A Tool',
    status: opts?.toolStatus ?? 'ACTIVE',
    operations,
    metadata: {},
  });
  await registry.upsertBinding({
    deployment_id: deploymentId,
    agent_id: agentId,
    application_id: applicationId,
    status: 'ACTIVE',
  });
  await registry.upsertGrant({
    deployment_id: deploymentId,
    agent_id: agentId,
    tool_id: toolId,
    allowed_operations: opts?.grantOps ?? ['field_update', 'clinical_note'],
    status: 'ACTIVE',
  });
  return { agentId, toolId, applicationId };
}

function actionPayload(overrides: Record<string, unknown> = {}) {
  return {
    application_id: 'app_clinical',
    user: { id: 'user_clinician' },
    operation: 'write',
    model: 'local-general-v1',
    messages: [
      {
        role: 'user',
        content:
          'Agent write: update patient field.\nPatient: Demo\nMRN: MRN-1\nDOB: 1980-01-01\nField: phone\nValue: 555-0100',
      },
    ],
    purpose: 'treatment',
    authorization_context: 'authorized',
    agent_id: 'agent_phase_a',
    tool_id: 'tool_phase_a',
    governance_context: {
      tool_authorized: true,
      agent_authorized: true,
    },
    action: {
      kind: 'field_update',
      target_id: 'patient_x',
      attributes: { field: 'phone', value: '555-0100' },
    },
    regulatory_applicability: ['HIPAA'],
    ...overrides,
  };
}

describe('Phase A Agent/Tool governance', () => {
  it('client cannot invent agent authorization in enforce mode', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    // Agent not registered — client claims authorized.
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { reason_code?: string; reason_codes?: string[] };
    const codes = [
      body.reason_code,
      ...(Array.isArray(body.reason_codes) ? body.reason_codes : []),
    ].filter(Boolean);
    expect(codes.some((c) => String(c).includes('AGENT'))).toBe(true);
    void deploymentId;
  });

  it('client cannot invent tool authorization in enforce mode', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await registry.createAgent({
      deployment_id: deploymentId,
      agent_id: 'agent_phase_a',
      organization_id: 'org_demo',
      name: 'A',
      status: 'ACTIVE',
      autonomy_level: 'HUMAN_APPROVED',
      metadata: {},
    });
    await registry.upsertBinding({
      deployment_id: deploymentId,
      agent_id: 'agent_phase_a',
      application_id: 'app_clinical',
      status: 'ACTIVE',
    });
    // Tool missing — client claims tool_authorized.
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('registered agent + binding + grant allows substrate (policy may still decide)', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, deploymentId);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    // Substrate authorized — HIPAA write path may ALLOW or REVIEW depending on packs.
    expect([200, 403]).toContain(res.statusCode);
    if (res.statusCode === 403) {
      const body = res.json() as { reason_code?: string };
      // Must not be substrate unauthorized.
      expect(body.reason_code).not.toBe('AGENT_UNAUTHORIZED');
      expect(body.reason_code).not.toBe('TOOL_UNAUTHORIZED');
    }
    if (res.statusCode === 200) {
      expect((res.json() as { action?: string }).action).toBe('commit_allowed');
    }
  });

  it('cross-application agent is denied', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, deploymentId, {
      applicationId: 'app_clinical',
    });
    // Present agent from clinical app using general app key (different application).
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: GENERAL,
      payload: actionPayload({
        application_id: 'app_general',
        user: { id: 'user_analyst' },
      }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('ungranted tool is denied', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await registry.createAgent({
      deployment_id: deploymentId,
      agent_id: 'agent_phase_a',
      organization_id: 'org_demo',
      name: 'A',
      status: 'ACTIVE',
      autonomy_level: 'HUMAN_APPROVED',
      metadata: {},
    });
    await registry.upsertBinding({
      deployment_id: deploymentId,
      agent_id: 'agent_phase_a',
      application_id: 'app_clinical',
      status: 'ACTIVE',
    });
    await registry.createTool({
      deployment_id: deploymentId,
      tool_id: 'tool_phase_a',
      organization_id: 'org_demo',
      name: 'T',
      status: 'ACTIVE',
      operations: ['field_update'],
      metadata: {},
    });
    // No grant.
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('operation not declared by tool is denied', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, deploymentId, {
      operations: ['other_op'],
      grantOps: ['field_update'],
    });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('operation not granted is denied', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, deploymentId, {
      operations: ['field_update', 'clinical_note'],
      grantOps: ['clinical_note'],
    });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('suspended agent is denied', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, deploymentId, { agentStatus: 'SUSPENDED' });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('suspended tool is denied', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, deploymentId, { toolStatus: 'SUSPENDED' });
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('cross-deployment agent cannot authorize', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, 'other-deployment-id');
    void deploymentId;
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('historical evaluation retains runtime_actor snapshot after suspend', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, deploymentId);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });
    // Capture evaluation id from response or recent list.
    let evaluationId: string | undefined =
      (res.json() as { evaluation_id?: string }).evaluation_id;
    if (!evaluationId) {
      const list = await server.inject({
        method: 'GET',
        url: '/v1/admin/evaluations?limit=5',
        headers: ADMIN,
      });
      const rows = (list.json() as { evaluations?: Array<{ evaluation_id: string; ai_context?: { runtime_actor?: { agent?: { status?: string } } } }> }).evaluations ?? [];
      evaluationId = rows[0]?.evaluation_id;
    }
    expect(evaluationId).toBeTruthy();

    await registry.updateAgent(deploymentId, 'agent_phase_a', {
      status: 'SUSPENDED',
    });

    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: ADMIN,
    });
    expect(detail.statusCode).toBe(200);
    const evalBody = detail.json() as {
      evaluation?: { ai_context?: { runtime_actor?: { agent?: { status?: string; authorized?: boolean } } } };
      ai_context?: { runtime_actor?: { agent?: { status?: string } } };
    };
    const ra =
      evalBody.evaluation?.ai_context?.runtime_actor ??
      evalBody.ai_context?.runtime_actor;
    expect(ra?.agent?.status).toBe('ACTIVE');
  });

  it('off mode preserves legacy client attestation', async () => {
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'off', adminApiKey: 'test_admin' },
    });
    const server = await gw.buildServer();
    // Unregistered agent + client attestation — same as pre-Phase-A (may ALLOW/REVIEW/DENY by packs).
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload({
        agent_id: 'agent_generic_1',
        tool_id: 'update_patient_field',
      }),
    });
    // Must not fail solely because registry empty in off mode.
    expect([200, 403]).toContain(res.statusCode);
    if (res.statusCode === 403) {
      const body = res.json() as { reason_code?: string };
      expect(body.reason_code).not.toBe('AGENT_NOT_REGISTERED');
    }
  });

  it('admin registry mutations emit admin audit', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();

    const create = await server.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: ADMIN,
      payload: {
        agent_id: 'agent_admin_audit',
        organization_id: 'org_demo',
        name: 'Audit Agent',
        status: 'ACTIVE',
        autonomy_level: 'ASSISTIVE',
      },
    });
    expect(create.statusCode).toBe(201);

    const suspend = await server.inject({
      method: 'POST',
      url: '/v1/admin/agents/agent_admin_audit/suspend',
      headers: ADMIN,
    });
    expect(suspend.statusCode).toBe(200);

    const audit = await server.inject({
      method: 'GET',
      url: '/v1/admin/audit?limit=50',
      headers: ADMIN,
    });
    expect(audit.statusCode).toBe(200);
    const events = (audit.json() as { events?: Array<{ operation?: string; metadata?: { action?: string } }> }).events ??
      (audit.json() as { audit_events?: Array<{ operation?: string }> }).audit_events ??
      [];
    const ops = events.map((e) => e.operation ?? e.metadata?.action);
    expect(ops.some((o) => String(o).includes('agent_created') || String(o).includes('agent_suspended'))).toBe(true);
  });

  it('one PDP — resolution produces facts only (evaluation still recorded once)', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedHappyPath(registry, deploymentId);

    const before = await server.inject({
      method: 'GET',
      url: '/v1/admin/evaluations?limit=100',
      headers: ADMIN,
    });
    const beforeCount = (
      (before.json() as { evaluations?: unknown[] }).evaluations ?? []
    ).length;

    await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: actionPayload(),
    });

    const after = await server.inject({
      method: 'GET',
      url: '/v1/admin/evaluations?limit=100',
      headers: ADMIN,
    });
    const afterCount = (
      (after.json() as { evaluations?: unknown[] }).evaluations ?? []
    ).length;
    expect(afterCount - beforeCount).toBe(1);
  });
});
