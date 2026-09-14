/**
 * Phase D — Action Governance: facts for EPA, historical snapshot, enforcement boundary.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { InMemoryActorRegistry } from '../../src/actors/index.js';
import {
  buildRuntimeActionFacts,
  deriveActionCategory,
  sanitizeActionAttributes,
} from '../../src/policy/enterprise/action-governance.js';
import { projectRequestContext } from '../../src/policy/enterprise/evaluation-query.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';

const ADMIN = { authorization: 'Bearer test_admin' };
const CLINICAL = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };

async function seedActors(registry: InMemoryActorRegistry, deploymentId: string) {
  await registry.createAgent({
    deployment_id: deploymentId,
    agent_id: 'agent_phase_d',
    organization_id: 'org_demo',
    name: 'Phase D Agent',
    status: 'ACTIVE',
    autonomy_level: 'HUMAN_APPROVED',
    metadata: {},
  });
  await registry.createTool({
    deployment_id: deploymentId,
    tool_id: 'tool_phase_d',
    organization_id: 'org_demo',
    name: 'Phase D Tool',
    status: 'ACTIVE',
    operations: ['field_update', 'clinical_note', 'summarize'],
    metadata: {},
  });
  await registry.upsertBinding({
    deployment_id: deploymentId,
    agent_id: 'agent_phase_d',
    application_id: 'app_clinical',
    status: 'ACTIVE',
  });
  await registry.upsertGrant({
    deployment_id: deploymentId,
    agent_id: 'agent_phase_d',
    tool_id: 'tool_phase_d',
    allowed_operations: ['field_update', 'clinical_note'],
    status: 'ACTIVE',
  });
}

function writePayload(overrides: Record<string, unknown> = {}) {
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
    agent_id: 'agent_phase_d',
    tool_id: 'tool_phase_d',
    governance_context: {
      tool_authorized: true,
      agent_authorized: true,
    },
    action: {
      kind: 'field_update',
      target_id: 'patient_x',
      attributes: { field: 'phone', value: '555-0100-SECRET' },
    },
    regulatory_applicability: ['HIPAA'],
    ...overrides,
  };
}

describe('Phase D Action Governance helpers', () => {
  it('derives categories from operation/kind', () => {
    expect(deriveActionCategory({ operation: 'summarize' })).toBe('READ');
    expect(
      deriveActionCategory({ operation: 'write', actionKind: 'field_update' }),
    ).toBe('UPDATE');
    expect(
      deriveActionCategory({ operation: 'write', actionKind: 'clinical_note' }),
    ).toBe('CREATE');
    expect(deriveActionCategory({ operation: 'delete' })).toBe('DELETE');
    expect(deriveActionCategory({ operation: 'export' })).toBe('TRANSMIT');
  });

  it('strips sensitive attribute payloads', () => {
    const safe = sanitizeActionAttributes({
      field: 'phone',
      value: 'secret',
      content: 'note body',
      entity_type: 'Patient',
    });
    expect(safe).toEqual({ field: 'phone', entity_type: 'Patient' });
    expect(safe.value).toBeUndefined();
  });

  it('marks actions path as client_commit_required', () => {
    const facts = buildRuntimeActionFacts({
      operation: 'write',
      action: {
        kind: 'field_update',
        target_id: 'patient_x',
        attributes: { field: 'phone', value: 'x' },
      },
      clientCommit: true,
    });
    expect(facts.category).toBe('UPDATE');
    expect(facts.write_governance_class).toBe('ADMINISTRATIVE_LOW_RISK');
    expect(facts.enforcement_boundary).toBe('client_commit_required');
    expect(facts.attributes.value).toBeUndefined();
    expect(facts.attributes.field).toBe('phone');
  });
});

describe('Phase D Action Governance runtime', () => {
  it('persists action_governance snapshot without sensitive values', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedActors(registry, deploymentId);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: writePayload(),
    });
    expect([200, 403]).toContain(res.statusCode);

    const list = await server.inject({
      method: 'GET',
      url: '/v1/admin/evaluations?limit=5',
      headers: ADMIN,
    });
    const rows =
      (list.json() as { evaluations?: Array<{ evaluation_id: string }> })
        .evaluations ?? [];
    expect(rows[0]?.evaluation_id).toBeTruthy();

    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${rows[0]!.evaluation_id}`,
      headers: ADMIN,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as {
      action_governance?: {
        category?: string;
        kind?: string;
        attributes?: Record<string, unknown>;
        write_governance_class?: string;
        enforcement_boundary?: string;
        client_commit?: boolean;
      };
      request_context?: {
        action_category?: string;
        action_kind?: string;
        action_field?: string;
        action_enforcement_boundary?: string;
      };
      evaluation?: {
        ai_context?: {
          action?: { attributes?: Record<string, unknown> };
          action_governance?: { attributes?: Record<string, unknown> };
        };
      };
    };

    expect(body.action_governance?.category).toBe('UPDATE');
    expect(body.action_governance?.kind).toBe('field_update');
    expect(body.action_governance?.write_governance_class).toBe(
      'ADMINISTRATIVE_LOW_RISK',
    );
    expect(body.action_governance?.enforcement_boundary).toBe(
      'client_commit_required',
    );
    expect(body.action_governance?.client_commit).toBe(true);
    expect(body.action_governance?.attributes?.value).toBeUndefined();
    expect(body.action_governance?.attributes?.field).toBe('phone');

    expect(body.request_context?.action_category).toBe('UPDATE');
    expect(body.request_context?.action_kind).toBe('field_update');
    expect(body.request_context?.action_field).toBe('phone');
    expect(body.request_context?.action_enforcement_boundary).toBe(
      'client_commit_required',
    );

    const persistedAction =
      body.evaluation?.ai_context?.action ??
      (
        detail.json() as {
          evaluation?: { ai_context?: { action?: { attributes?: Record<string, unknown> } } };
        }
      ).evaluation?.ai_context?.action;
    if (persistedAction?.attributes) {
      expect(persistedAction.attributes.value).toBeUndefined();
    }
  });

  it('rejects client action_category / write_governance_class in governance_context', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedActors(registry, deploymentId);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: writePayload({
        governance_context: {
          agent_authorized: true,
          tool_authorized: true,
          // Unknown governance keys — schema fail-closed (strict).
          action_category: 'READ',
          write_governance_class: 'CLINICAL_NOTE',
        },
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('action_governance is server-derived, not taken from client governance_context', () => {
    // Even if a client somehow supplied classification spoof fields on governance_context
    // (bypassing HTTP schema), map builds category/class only from operation + action.
    const facts = buildRuntimeActionFacts({
      operation: 'write',
      action: {
        kind: 'field_update',
        target_id: 'patient_x',
        attributes: { field: 'phone', value: '555' },
      },
      clientCommit: true,
    });
    expect(facts.category).toBe('UPDATE');
    expect(facts.write_governance_class).toBe('ADMINISTRATIVE_LOW_RISK');
    expect(facts.category).not.toBe('READ');
    expect(facts.write_governance_class).not.toBe('CLINICAL_NOTE');
  });

  it('unauthorized operation remains DENY despite client attestation', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedActors(registry, deploymentId);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: writePayload({
        action: {
          kind: 'submit_claim',
          target_id: 'claim_1',
          attributes: { field: 'status' },
        },
      }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('historical action_governance survives agent suspend', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await seedActors(registry, deploymentId);

    await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: writePayload(),
    });
    const list = await server.inject({
      method: 'GET',
      url: '/v1/admin/evaluations?limit=3',
      headers: ADMIN,
    });
    const id = (list.json() as { evaluations?: Array<{ evaluation_id: string }> })
      .evaluations?.[0]?.evaluation_id!;

    await registry.updateAgent(deploymentId, 'agent_phase_d', {
      status: 'SUSPENDED',
    });

    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${id}`,
      headers: ADMIN,
    });
    const body = detail.json() as {
      action_governance?: { category?: string; kind?: string };
      runtime_actor?: { agent?: { status?: string } };
    };
    expect(body.action_governance?.category).toBe('UPDATE');
    expect(body.action_governance?.kind).toBe('field_update');
    expect(body.runtime_actor?.agent?.status).toBe('ACTIVE');
  });

  it('projectRequestContext surfaces action governance fields', () => {
    const record = {
      evaluation_id: 'eval_x',
      created_at: new Date().toISOString(),
      phase: 'input',
      decision: 'ALLOW',
      action: 'WRITE',
      ai_context: {
        action: { kind: 'field_update', target_id: 't1', attributes: { field: 'email' } },
        action_governance: {
          category: 'UPDATE',
          operation: 'write',
          kind: 'field_update',
          target_id: 't1',
          attributes: { field: 'email' },
          write_governance_class: 'ADMINISTRATIVE_LOW_RISK',
          enforcement_boundary: 'client_commit_required',
          client_commit: true,
        },
      },
      context: {},
      subject: { application_id: 'app_clinical', organization_id: 'org_demo' },
      resource: {},
      evidence_in: {},
    } as unknown as PolicyEvaluationRecord;

    const projected = projectRequestContext(record);
    expect(projected.action_category).toBe('UPDATE');
    expect(projected.action_kind).toBe('field_update');
    expect(projected.action_field).toBe('email');
    expect(projected.action_target_id).toBe('t1');
    expect(projected.action_write_class).toBe('ADMINISTRATIVE_LOW_RISK');
    expect(projected.action_enforcement_boundary).toBe('client_commit_required');
  });

  it('enforcement boundary: Gateway blocks DENY before commit_allowed', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    // No actors seeded — enforce DENY.
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: CLINICAL,
      payload: writePayload(),
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { action?: string; status?: string };
    expect(body.action).not.toBe('commit_allowed');
  });
});
