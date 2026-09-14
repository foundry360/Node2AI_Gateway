/**
 * Phase B — Agent/Tool governance operations: hardening, shadow, positive ALLOW,
 * registry-unavailable fail-closed on the real request path.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { InMemoryActorRegistry } from '../../src/actors/index.js';
import type { ActorRegistry } from '../../src/actors/index.js';

const ADMIN = { authorization: 'Bearer test_admin' };
const CLINICAL = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };

async function seedAuthorizedSummarize(
  registry: ActorRegistry,
  deploymentId: string,
  opts?: {
    agentId?: string;
    toolId?: string;
    applicationId?: string;
    grantOps?: string[];
    operations?: string[];
  },
) {
  const agentId = opts?.agentId ?? 'agent_phase_b';
  const toolId = opts?.toolId ?? 'tool_phase_b';
  const applicationId = opts?.applicationId ?? 'app_clinical';
  const operations = opts?.operations ?? ['summarize', 'classify', 'generate'];
  await registry.createAgent({
    deployment_id: deploymentId,
    agent_id: agentId,
    organization_id: 'org_demo',
    name: 'Phase B Agent',
    status: 'ACTIVE',
    autonomy_level: 'HUMAN_APPROVED',
    metadata: {},
  });
  await registry.createTool({
    deployment_id: deploymentId,
    tool_id: toolId,
    organization_id: 'org_demo',
    name: 'Phase B Tool',
    status: 'ACTIVE',
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
    allowed_operations: opts?.grantOps ?? ['summarize'],
    status: 'ACTIVE',
  });
  return { agentId, toolId, applicationId };
}

function summarizePayload(overrides: Record<string, unknown> = {}) {
  return {
    application_id: 'app_clinical',
    user: { id: 'user_clinician' },
    operation: 'summarize',
    model: 'local-general-v1',
    messages: [{ role: 'user', content: 'Summarize visit notes for Demo patient.' }],
    purpose: 'treatment',
    authorization_context: 'authorized',
    agent_id: 'agent_phase_b',
    tool_id: 'tool_phase_b',
    governance_context: {
      tool_authorized: true,
      agent_authorized: true,
      accountability_documented: true,
      system_context_documented: true,
      measurement_documented: true,
      risk_response_documented: true,
    },
    regulatory_applicability: ['HIPAA'],
    ...overrides,
  };
}

async function latestRuntimeActor(server: {
  inject: (opts: {
    method: string;
    url: string;
    headers: Record<string, string>;
  }) => Promise<{ statusCode: number; json: () => unknown }>;
}) {
  const list = await server.inject({
    method: 'GET',
    url: '/v1/admin/evaluations?limit=5',
    headers: ADMIN,
  });
  const rows =
    (
      list.json() as {
        evaluations?: Array<{
          evaluation_id: string;
          ai_context?: { runtime_actor?: Record<string, unknown> };
        }>;
      }
    ).evaluations ?? [];
  const evaluationId = rows[0]?.evaluation_id;
  expect(evaluationId).toBeTruthy();
  const detail = await server.inject({
    method: 'GET',
    url: `/v1/admin/evaluations/${evaluationId}`,
    headers: ADMIN,
  });
  expect(detail.statusCode).toBe(200);
  const body = detail.json() as {
    runtime_actor?: {
      agent?: { status?: string; authorized?: boolean; id?: string };
      tool?: { authorized?: boolean; operation?: string | null; id?: string };
      substrate?: { reason_codes?: string[]; agent_authorized?: boolean | null };
      mismatch?: boolean;
      client_attested?: {
        agent_authorized?: boolean;
        tool_authorized?: boolean;
      };
      mode?: string;
    } | null;
    evaluation?: {
      ai_context?: { runtime_actor?: { agent?: { status?: string } } };
    };
  };
  return {
    evaluationId: evaluationId!,
    runtime_actor:
      body.runtime_actor ??
      (body.evaluation?.ai_context?.runtime_actor as
        | typeof body.runtime_actor
        | undefined) ??
      null,
  };
}

describe('Phase B Agent/Tool governance operations', () => {
  it('positive path: full substrate → authorized (ALLOW completions)', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedAuthorizedSummarize(registry, deploymentId);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/completions',
      headers: CLINICAL,
      payload: summarizePayload(),
    });
    expect(res.statusCode).toBe(200);

    const { runtime_actor } = await latestRuntimeActor(server);
    expect(runtime_actor?.agent?.authorized).toBe(true);
    expect(runtime_actor?.tool?.authorized).toBe(true);
    expect(runtime_actor?.tool?.operation).toBe('summarize');
    expect(runtime_actor?.mode).toBe('enforce');
  });

  it('positive path breaks when any required dimension fails', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedAuthorizedSummarize(registry, deploymentId, {
      grantOps: ['classify'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/completions',
      headers: CLINICAL,
      payload: summarizePayload(),
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { reason_code?: string };
    expect(
      ['TOOL_UNAUTHORIZED', 'AGENT_UNAUTHORIZED'].includes(
        String(body.reason_code),
      ) || String(body.reason_code).includes('UNAUTHORIZED'),
    ).toBe(true);
  });

  it('enforce + missing actorRegistry + agent/tool → DENY (no client fallback)', async () => {
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: null,
    });
    const server = await gw.buildServer();

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/completions',
      headers: CLINICAL,
      payload: summarizePayload({
        governance_context: {
          agent_authorized: true,
          tool_authorized: true,
          accountability_documented: true,
          system_context_documented: true,
          measurement_documented: true,
          risk_response_documented: true,
        },
      }),
    });
    expect(res.statusCode).toBe(403);

    const { runtime_actor } = await latestRuntimeActor(server);
    expect(runtime_actor?.agent?.authorized).toBe(false);
    expect(runtime_actor?.substrate?.reason_codes).toContain(
      'REGISTRY_UNAVAILABLE',
    );
  });

  describe('shadow mode (server authoritative + client compare metadata)', () => {
    it('authorized agent/tool uses server facts', async () => {
      const registry = new InMemoryActorRegistry();
      const gw = createPhase1Gateway({
        config: { actorRegistryMode: 'shadow', adminApiKey: 'test_admin' },
        actorRegistry: registry,
      });
      const server = await gw.buildServer();
      const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
      await seedAuthorizedSummarize(registry, deploymentId);

      const res = await server.inject({
        method: 'POST',
        url: '/v1/ai/completions',
        headers: CLINICAL,
        payload: summarizePayload({
          governance_context: {
            agent_authorized: false,
            tool_authorized: false,
            accountability_documented: true,
            system_context_documented: true,
            measurement_documented: true,
            risk_response_documented: true,
          },
        }),
      });
      // Client attested false — server registry true must win.
      expect(res.statusCode).toBe(200);
      const { runtime_actor } = await latestRuntimeActor(server);
      expect(runtime_actor?.mode).toBe('shadow');
      expect(runtime_actor?.agent?.authorized).toBe(true);
      expect(runtime_actor?.tool?.authorized).toBe(true);
      expect(runtime_actor?.mismatch).toBe(true);
      expect(runtime_actor?.client_attested?.agent_authorized).toBe(false);
    });

    it('unauthorized agent is denied despite client attestation', async () => {
      const registry = new InMemoryActorRegistry();
      const gw = createPhase1Gateway({
        config: { actorRegistryMode: 'shadow', adminApiKey: 'test_admin' },
        actorRegistry: registry,
      });
      const server = await gw.buildServer();

      const res = await server.inject({
        method: 'POST',
        url: '/v1/ai/completions',
        headers: CLINICAL,
        payload: summarizePayload({
          agent_id: 'agent_missing',
          tool_id: undefined,
          governance_context: {
            agent_authorized: true,
            accountability_documented: true,
            system_context_documented: true,
            measurement_documented: true,
            risk_response_documented: true,
          },
        }),
      });
      expect(res.statusCode).toBe(403);
      const { runtime_actor } = await latestRuntimeActor(server);
      expect(runtime_actor?.agent?.authorized).toBe(false);
      expect(runtime_actor?.mismatch).toBe(true);
    });

    it('unauthorized tool is denied despite client attestation', async () => {
      const registry = new InMemoryActorRegistry();
      const gw = createPhase1Gateway({
        config: { actorRegistryMode: 'shadow', adminApiKey: 'test_admin' },
        actorRegistry: registry,
      });
      const server = await gw.buildServer();
      const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
      await seedAuthorizedSummarize(registry, deploymentId);

      const res = await server.inject({
        method: 'POST',
        url: '/v1/ai/completions',
        headers: CLINICAL,
        payload: summarizePayload({
          tool_id: 'tool_not_granted',
          governance_context: {
            agent_authorized: true,
            tool_authorized: true,
            accountability_documented: true,
            system_context_documented: true,
            measurement_documented: true,
            risk_response_documented: true,
          },
        }),
      });
      expect(res.statusCode).toBe(403);
      const { runtime_actor } = await latestRuntimeActor(server);
      expect(runtime_actor?.tool?.authorized).toBe(false);
    });

    it('client/server mismatch is retained as comparison metadata', async () => {
      const registry = new InMemoryActorRegistry();
      const gw = createPhase1Gateway({
        config: { actorRegistryMode: 'shadow', adminApiKey: 'test_admin' },
        actorRegistry: registry,
      });
      const server = await gw.buildServer();
      const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
      await seedAuthorizedSummarize(registry, deploymentId);

      await server.inject({
        method: 'POST',
        url: '/v1/ai/completions',
        headers: CLINICAL,
        payload: summarizePayload({
          governance_context: {
            agent_authorized: false,
            tool_authorized: true,
            accountability_documented: true,
            system_context_documented: true,
            measurement_documented: true,
            risk_response_documented: true,
          },
        }),
      });
      const { runtime_actor } = await latestRuntimeActor(server);
      expect(runtime_actor?.mismatch).toBe(true);
      expect(runtime_actor?.client_attested?.agent_authorized).toBe(false);
      expect(runtime_actor?.agent?.authorized).toBe(true);
    });

    it('historical runtime_actor remains immutable after lifecycle change', async () => {
      const registry = new InMemoryActorRegistry();
      const gw = createPhase1Gateway({
        config: { actorRegistryMode: 'shadow', adminApiKey: 'test_admin' },
        actorRegistry: registry,
      });
      const server = await gw.buildServer();
      const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
      await seedAuthorizedSummarize(registry, deploymentId);

      const res = await server.inject({
        method: 'POST',
        url: '/v1/ai/completions',
        headers: CLINICAL,
        payload: summarizePayload(),
      });
      expect(res.statusCode).toBe(200);
      const { evaluationId, runtime_actor } = await latestRuntimeActor(server);
      expect(runtime_actor?.agent?.status).toBe('ACTIVE');

      await registry.updateAgent(deploymentId, 'agent_phase_b', {
        status: 'SUSPENDED',
      });

      const detail = await server.inject({
        method: 'GET',
        url: `/v1/admin/evaluations/${evaluationId}`,
        headers: ADMIN,
      });
      const body = detail.json() as {
        runtime_actor?: { agent?: { status?: string; authorized?: boolean } };
      };
      expect(body.runtime_actor?.agent?.status).toBe('ACTIVE');
      expect(body.runtime_actor?.agent?.authorized).toBe(true);
    });
  });

  it('admin agent/tool detail APIs enrich grants for operations UI', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedAuthorizedSummarize(registry, deploymentId);

    const agentDetail = await server.inject({
      method: 'GET',
      url: '/v1/admin/agents/agent_phase_b',
      headers: ADMIN,
    });
    expect(agentDetail.statusCode).toBe(200);
    const agentBody = agentDetail.json() as {
      grants: Array<{ tool_id: string; allowed_operations: string[] }>;
      deployment_id: string;
    };
    expect(agentBody.deployment_id).toBe(deploymentId);
    expect(agentBody.grants[0]?.tool_id).toBe('tool_phase_b');
    expect(agentBody.grants[0]?.allowed_operations).toContain('summarize');

    const toolsList = await server.inject({
      method: 'GET',
      url: '/v1/admin/tools',
      headers: ADMIN,
    });
    expect(toolsList.statusCode).toBe(200);
    const toolsBody = toolsList.json() as {
      tools: Array<{ tool_id: string; granted_agent_count: number }>;
    };
    const tool = toolsBody.tools.find((t) => t.tool_id === 'tool_phase_b');
    expect(tool?.granted_agent_count).toBe(1);
  });
});
