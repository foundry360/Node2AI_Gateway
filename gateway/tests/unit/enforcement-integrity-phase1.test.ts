/**
 * Product 1.0 Workstream 1 — Enforcement integrity and honesty.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { InMemoryActorRegistry } from '../../src/actors/index.js';
import { loadConfig } from '../../src/shared/config.js';
import {
  deriveEnforcementIntegrity,
  deriveOutcomeIntegrityStatus,
} from '../../src/policy/enterprise/enforcement-integrity.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';

const APP = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };
const ADMIN = { authorization: 'Bearer test_admin' };

function notePayload(overrides: Record<string, unknown> = {}) {
  return {
    application_id: 'app_clinical',
    user: { id: 'user_clinician' },
    operation: 'write',
    model: 'local-general-v1',
    messages: [
      {
        role: 'user',
        content:
          'Agent write: append clinical note.\nPatient: Demo\nMRN: MRN-1\nDOB: 1980-01-01\nNote:\nIntegrity note.',
      },
    ],
    purpose: 'treatment',
    authorization_context: 'authorized',
    agent_id: 'agent_platform_a',
    tool_id: 'update_clinical_notes',
    governance_context: {
      tool_authorized: true,
      agent_authorized: true,
    },
    action: {
      kind: 'clinical_note',
      target_id: 'patient_demo',
      attributes: { note: 'Integrity note.' },
    },
    regulatory_applicability: ['HIPAA'],
    ...overrides,
  };
}

async function holdAndAuthorize(
  server: Awaited<
    ReturnType<Awaited<ReturnType<typeof createPhase1Gateway>>['buildServer']>
  >,
) {
  const held = await server.inject({
    method: 'POST',
    url: '/v1/ai/actions',
    headers: APP,
    payload: notePayload(),
  });
  expect(held.statusCode).toBe(403);
  const evaluationId = held.json().evaluation_id as string;
  const resolve = await server.inject({
    method: 'POST',
    url: `/v1/admin/evaluations/${evaluationId}/resolve`,
    headers: ADMIN,
    payload: {
      disposition: 'AUTHORIZE',
      reason: 'Approved for this Decision only',
      actor: 'reviewer_demo',
    },
  });
  expect(resolve.statusCode).toBe(200);
  return evaluationId;
}

describe('Product 1.0 enforcement integrity helpers', () => {
  it('classifies DENY / REVIEW / client-commit / gateway boundaries', () => {
    const base = {
      evaluation_id: 'e1',
      decision: 'ALLOW',
      phase: 'input',
      created_at: new Date().toISOString(),
      subject: {},
      resource: {},
      action: 'WRITE',
      context: {},
      ai_context: {
        action_governance: {
          enforcement_boundary: 'client_commit_required',
          client_commit: true,
        },
      },
    } as unknown as PolicyEvaluationRecord;

    expect(
      deriveEnforcementIntegrity({
        record: { ...base, decision: 'DENY' },
      }).boundary,
    ).toBe('DENIED');

    expect(
      deriveEnforcementIntegrity({
        record: { ...base, decision: 'REVIEW' },
        reviewState: 'pending',
      }).boundary,
    ).toBe('REVIEW_REQUIRED');

    const allowCc = deriveEnforcementIntegrity({
      record: base,
      reviewState: 'none',
      commitAuthorized: true,
    });
    expect(allowCc.boundary).toBe('CLIENT_COMMIT_REQUIRED');
    expect(allowCc.gateway_executed_side_effect).toBe(false);
    expect(allowCc.commit_authorized).toBe(true);

    const gw = deriveEnforcementIntegrity({
      record: {
        ...base,
        ai_context: {
          action_governance: { enforcement_boundary: 'gateway_enforced' },
        },
      } as unknown as PolicyEvaluationRecord,
    });
    expect(gw.boundary).toBe('GATEWAY_ENFORCED');
    expect(gw.gateway_executed_side_effect).toBe(true);

    expect(
      deriveOutcomeIntegrityStatus({
        boundary: 'CLIENT_COMMIT_REQUIRED',
        outcomeStatus: null,
      }),
    ).toBe('NOT_REPORTED');
    expect(
      deriveOutcomeIntegrityStatus({
        boundary: 'CLIENT_COMMIT_REQUIRED',
        outcomeStatus: 'EXECUTED',
      }),
    ).toBe('COMPLETED');
    expect(
      deriveOutcomeIntegrityStatus({
        boundary: 'GATEWAY_ENFORCED',
      }),
    ).toBe('NOT_APPLICABLE');
  });

  it('production defaults are enterprise + enforce + legacy gated', () => {
    const cfg = loadConfig({
      GATEWAY_ALLOW_LEGACY_ENGINE: undefined,
      GATEWAY_POLICY_ENGINE: undefined,
      GATEWAY_ACTOR_REGISTRY_MODE: undefined,
    } as NodeJS.ProcessEnv);
    expect(cfg.policyEngineMode).toBe('enterprise');
    expect(cfg.actorRegistryMode).toBe('enforce');
    expect(cfg.allowLegacyEngine).toBe(false);

    const forcedLegacy = loadConfig({
      GATEWAY_POLICY_ENGINE: 'legacy',
      GATEWAY_ALLOW_LEGACY_ENGINE: 'false',
    } as NodeJS.ProcessEnv);
    expect(forcedLegacy.policyEngineMode).toBe('enterprise');
  });
});

describe('Product 1.0 enforcement integrity runtime', () => {
  it('DENY cannot obtain commit_allowed', async () => {
    const registry = new InMemoryActorRegistry();
    const gw = createPhase1Gateway({
      config: { actorRegistryMode: 'enforce', adminApiKey: 'test_admin' },
      actorRegistry: registry,
    });
    const server = await gw.buildServer();
    const deploymentId = await gw.deploymentIdentity.getOrCreateDeploymentId();
    await registry.createAgent({
      deployment_id: deploymentId,
      agent_id: 'agent_deny',
      organization_id: 'org_demo',
      name: 'Deny Agent',
      status: 'ACTIVE',
      autonomy_level: 'HUMAN_APPROVED',
      metadata: {},
    });
    // No binding / grant → unauthorized → DENY before commit
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: notePayload({
        agent_id: 'agent_deny',
        tool_id: 'missing_tool',
        action: { kind: 'field_update', attributes: { field: 'phone' } },
      }),
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as {
      action?: string;
      enforcement_boundary?: string;
      evaluation_id?: string;
    };
    expect(body.action).not.toBe('commit_allowed');
    expect(body.enforcement_boundary).toBe('denied');
    await server.close();
  });

  it('ALLOW stamps commit_allowed with client_commit_required boundary', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: {
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
        tool_id: 'update_patient_field',
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
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      action?: string;
      enforcement_boundary?: string;
      evaluation_id?: string;
    };
    expect(body.action).toBe('commit_allowed');
    expect(body.enforcement_boundary).toBe('client_commit_required');

    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${body.evaluation_id}`,
      headers: ADMIN,
    });
    expect(detail.statusCode).toBe(200);
    const ei = (detail.json() as { enforcement_integrity?: { boundary?: string } })
      .enforcement_integrity;
    expect(ei?.boundary).toBe('CLIENT_COMMIT_REQUIRED');
    await server.close();
  });

  it('resume omitting held tool_id is CONTEXT_MISMATCH', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await holdAndAuthorize(server);

    const payload = notePayload({ resume_evaluation_id: evaluationId });
    delete (payload as { tool_id?: string }).tool_id;

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload,
    });
    expect(resume.statusCode).toBe(409);
    expect(resume.json().reason_code).toBe('CONTEXT_MISMATCH');
    await server.close();
  });

  it('resume omitting held action.kind is CONTEXT_MISMATCH', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await holdAndAuthorize(server);

    const payload = notePayload({ resume_evaluation_id: evaluationId });
    delete (payload as { action?: unknown }).action;

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload,
    });
    expect(resume.statusCode).toBe(409);
    expect(resume.json().reason_code).toBe('CONTEXT_MISMATCH');
    await server.close();
  });

  it('unresolved REVIEW cannot commit_allowed', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const held = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: notePayload(),
    });
    expect(held.statusCode).toBe(403);
    expect(held.json().enforcement_boundary).toBe('review_required');
    const evaluationId = held.json().evaluation_id as string;

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: notePayload({ resume_evaluation_id: evaluationId }),
    });
    expect(resume.statusCode).toBe(403);
    expect(resume.json().action).not.toBe('commit_allowed');
    await server.close();
  });

  it('client cannot spoof enforcement_boundary or commit_allowed on request', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: notePayload({
        commit_allowed: true,
        enforcement_boundary: 'gateway_enforced',
        decision: 'ALLOW',
      }),
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('admin evaluation exposes outcome_integrity NOT_REPORTED for client-commit', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        messages: [
          {
            role: 'user',
            content:
              'Agent write: update patient field.\nPatient: Demo\nMRN: MRN-1\nDOB: 1980-01-01\nField: phone\nValue: 555-0199',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        tool_id: 'update_patient_field',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        action: {
          kind: 'field_update',
          target_id: 'patient_y',
          attributes: { field: 'phone', value: '555-0199' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { evaluation_id: string }).evaluation_id;
    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${id}`,
      headers: ADMIN,
    });
    const body = detail.json() as {
      outcome_integrity?: { status?: string };
      execution?: { gateway_executed_side_effect?: boolean };
    };
    expect(body.outcome_integrity?.status).toBe('NOT_REPORTED');
    expect(body.execution?.gateway_executed_side_effect).toBe(false);
    await server.close();
  });
});
