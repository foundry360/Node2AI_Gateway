/**
 * Phase C — resume_evaluation_id is the canonical client_commit continuation.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';

const APP_AUTH = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };
const ADMIN_AUTH = { authorization: 'Bearer test_admin' };

const notePayload = (overrides: Record<string, unknown> = {}) => ({
  application_id: 'app_clinical',
  user: { id: 'user_clinician' },
  operation: 'write',
  model: 'local-general-v1',
  messages: [
    {
      role: 'user',
      content:
        'Agent write: append clinical note.\nPatient: Demo\nMRN: MRN-1\nDOB: 1980-01-01\nNote:\nPhase C note body.',
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
    attributes: { note: 'Phase C note body.' },
  },
  regulatory_applicability: ['HIPAA'],
  ...overrides,
});

async function holdAndAuthorize(
  server: Awaited<ReturnType<Awaited<ReturnType<typeof createPhase1Gateway>>['buildServer']>>,
  payload: Record<string, unknown> = notePayload(),
) {
  const held = await server.inject({
    method: 'POST',
    url: '/v1/ai/actions',
    headers: APP_AUTH,
    payload,
  });
  expect(held.statusCode).toBe(403);
  const evaluationId = held.json().evaluation_id as string;
  expect(evaluationId).toBeTruthy();

  const resolve = await server.inject({
    method: 'POST',
    url: `/v1/admin/evaluations/${evaluationId}/resolve`,
    headers: ADMIN_AUTH,
    payload: {
      disposition: 'AUTHORIZE',
      reason: 'Approved for continuation of this Decision only',
      actor: 'reviewer_demo',
    },
  });
  expect(resolve.statusCode).toBe(200);
  return evaluationId;
}

describe('Phase C — resume_evaluation_id canonical continuation', () => {
  it('1. valid AUTHORIZE + resume_evaluation_id → commit_allowed; no new Decision', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const before = gw.packRepo.listEvaluations({ limit: 200 }).length;
    const evaluationId = await holdAndAuthorize(server);

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({
        resume_evaluation_id: evaluationId,
        // Different message text must still resume — Decision identity, not content.
        messages: [
          {
            role: 'user',
            content: 'Retry clinical note write after human authorization.',
          },
        ],
      }),
    });
    expect(resume.statusCode).toBe(200);
    const body = resume.json();
    expect(body.status).toBe('approved');
    expect(body.action).toBe('commit_allowed');
    expect(body.resumed).toBe(true);
    expect(body.evaluation_id).toBe(evaluationId);

    const after = gw.packRepo.listEvaluations({ limit: 200 }).length;
    expect(after).toBe(before + 1);

    const record = gw.packRepo.getEvaluation(evaluationId)!;
    expect(String(record.decision).toUpperCase()).toBe('REVIEW');
    expect(record.human_resolution?.human_disposition).toBe('AUTHORIZE');
    expect(record.execution?.status).toBe('RESUMED');

    await server.close();
  });

  it('2. resume without human AUTHORIZE → NOT_AUTHORIZED', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const held = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload(),
    });
    const evaluationId = held.json().evaluation_id as string;

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({ resume_evaluation_id: evaluationId }),
    });
    expect(resume.statusCode).toBe(403);
    expect(resume.json().reason_code).toBe('NOT_AUTHORIZED');
    expect(resume.json().status).toBe('blocked');
    await server.close();
  });

  it('3. resume of DENY evaluation → DENY_CANNOT_RESUME', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const denied = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({
        governance_context: {
          tool_authorized: false,
          agent_authorized: true,
        },
      }),
    });
    expect(denied.statusCode).toBe(403);
    const evaluationId = denied.json().evaluation_id as string;
    expect(String(denied.json().machine_decision).toUpperCase()).toBe('DENY');

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({ resume_evaluation_id: evaluationId }),
    });
    expect(resume.statusCode).toBe(403);
    expect(resume.json().reason_code).toBe('DENY_CANNOT_RESUME');
    await server.close();
  });

  it('4. unknown evaluation ID → NOT_FOUND; no content fallback', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    // Seed an AUTHORIZE'd hold that content fallback could otherwise find.
    await holdAndAuthorize(server, notePayload({
      messages: [
        {
          role: 'user',
          content: 'Unique content for fallback trap MRN 999 DOB 1980-01-01',
        },
      ],
    }));

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({
        resume_evaluation_id: 'eval_does_not_exist',
        messages: [
          {
            role: 'user',
            content: 'Unique content for fallback trap MRN 999 DOB 1980-01-01',
          },
        ],
      }),
    });
    expect(resume.statusCode).toBe(404);
    expect(resume.json().reason_code).toBe('NOT_FOUND');
    await server.close();
  });

  it('5. context mismatch (tool) → rejected', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await holdAndAuthorize(server);

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({
        resume_evaluation_id: evaluationId,
        tool_id: 'update_patient_field',
      }),
    });
    expect(resume.statusCode).toBe(409);
    expect(resume.json().reason_code).toBe('CONTEXT_MISMATCH');
    await server.close();
  });

  it('6. different action kind → rejected', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await holdAndAuthorize(server);

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({
        resume_evaluation_id: evaluationId,
        tool_id: 'update_patient_field',
        action: {
          kind: 'field_update',
          attributes: { field: 'phone', value: '555' },
        },
      }),
    });
    expect(resume.statusCode).toBe(409);
    expect(resume.json().reason_code).toBe('CONTEXT_MISMATCH');
    await server.close();
  });

  it('8. human resolution remains additive after resume', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await holdAndAuthorize(server);
    await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({ resume_evaluation_id: evaluationId }),
    });
    const record = gw.packRepo.getEvaluation(evaluationId)!;
    expect(record.decision).toBe('REVIEW');
    expect(record.human_resolution?.human_disposition).toBe('AUTHORIZE');
    expect(record.human_resolution?.final_decision).toBe('ALLOW');
    expect(record.execution?.status).toBe('RESUMED');
    await server.close();
  });

  it('9. exact-content fallback works only when resume_evaluation_id omitted', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const content =
      'Exact content fallback clinical note MRN 42 DOB 1970-02-02';
    const evaluationId = await holdAndAuthorize(
      server,
      notePayload({
        messages: [{ role: 'user', content }],
      }),
    );

    const fallback = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({
        messages: [{ role: 'user', content }],
        // no resume_evaluation_id
      }),
    });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json().evaluation_id).toBe(evaluationId);
    expect(fallback.json().resumed).toBe(true);
    await server.close();
  });

  it('10. replay of already resumed Decision → ALREADY_RESUMED (not standing grant)', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await holdAndAuthorize(server);

    const first = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({ resume_evaluation_id: evaluationId }),
    });
    expect(first.statusCode).toBe(200);

    const second = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP_AUTH,
      payload: notePayload({ resume_evaluation_id: evaluationId }),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().reason_code).toBe('ALREADY_RESUMED');
    await server.close();
  });

  it('11. agent neutrality — same resume semantics across synthetic identities', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();

    const run = async (agentId: string) => {
      const payload = notePayload({
        agent_id: agentId,
        messages: [
          {
            role: 'user',
            content: `Clinical note for ${agentId} MRN 77 DOB 1990-01-01`,
          },
        ],
        action: {
          kind: 'clinical_note',
          target_id: `patient_${agentId}`,
          attributes: { note: `note for ${agentId}` },
        },
      });
      const evaluationId = await holdAndAuthorize(server, payload);
      const resume = await server.inject({
        method: 'POST',
        url: '/v1/ai/actions',
        headers: APP_AUTH,
        payload: { ...payload, resume_evaluation_id: evaluationId },
      });
      return {
        status: resume.statusCode,
        body: resume.json(),
        evaluationId,
      };
    };

    const a = await run('agent_platform_a');
    const b = await run('agent_platform_b');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.action).toBe(b.body.action);
    expect(a.body.resumed).toBe(true);
    expect(b.body.resumed).toBe(true);
    await server.close();
  });
});
