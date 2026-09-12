/**
 * POST /v1/ai/actions — every agent write creates a Decision; no model call.
 * write_capability must not blank-check subsequent writes.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';

describe('POST /v1/ai/actions — per-write Decisions', () => {
  it('PHI clinical note write → REVIEW Decision + hold (no model)', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        messages: [
          {
            role: 'user',
            content:
              'Append clinical note for patient a0X: Patient reports improved dyspnea after inhaler. MRN 12345 DOB 1980-01-01',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        tool_id: 'update_clinical_notes',
        agent_id: 'agent_enigma_clinical',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        action: {
          kind: 'clinical_note',
          target_id: 'a0X',
          attributes: { note: 'Patient reports improved dyspnea after inhaler.' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.status).toBe('blocked');
    expect(body.safety_hold).toBe(true);
    expect(body.evaluation_id).toBeTruthy();
    expect(String(body.machine_decision).toUpperCase()).toMatch(
      /REVIEW|REQUIRE_APPROVAL/,
    );

    const record = await Promise.resolve(
      gw.packRepo.getEvaluation(body.evaluation_id),
    );
    expect(record).toBeTruthy();
    expect(String(record?.decision).toUpperCase()).toBe('REVIEW');
    expect(record?.held_request?.governance_context).toMatchObject({
      client_commit: true,
    });
    expect(record?.held_request?.messages?.[0]?.content).toContain('dyspnea');

    await server.close();
  });

  it('AUTHORIZE then retry same content → commit_allowed without new Decision', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };
    const content =
      'Append clinical note for patient a0X: Follow-up BP 128/78 today. MRN 12345 DOB 1980-01-01';

    const held = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        messages: [{ role: 'user', content }],
        purpose: 'treatment',
        authorization_context: 'authorized',
        tool_id: 'update_clinical_notes',
        agent_id: 'agent_enigma_clinical',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        action: { kind: 'clinical_note', target_id: 'a0X' },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(held.statusCode).toBe(403);
    const evaluationId = held.json().evaluation_id as string;
    expect(evaluationId).toBeTruthy();
    expect(held.json().safety_hold).toBe(true);

    const resolve = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evaluationId}/resolve`,
      headers: auth,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'Clinician attested note is appropriate',
        actor: 'reviewer_demo',
      },
    });
    expect(resolve.statusCode).toBe(200);

    const retry = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        messages: [{ role: 'user', content }],
        purpose: 'treatment',
        authorization_context: 'authorized',
        tool_id: 'update_clinical_notes',
        agent_id: 'agent_enigma_clinical',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        action: { kind: 'clinical_note', target_id: 'a0X' },
        regulatory_applicability: ['HIPAA'],
      },
    });

    expect(retry.statusCode).toBe(200);
    const body = retry.json();
    expect(body.status).toBe('approved');
    expect(body.action).toBe('commit_allowed');
    expect(body.evaluation_id).toBe(evaluationId);
    expect(body.resumed).toBe(true);

    const record = await Promise.resolve(
      gw.packRepo.getEvaluation(evaluationId),
    );
    expect(record?.execution?.status).toBe('RESUMED');

    await server.close();
  });

  it('different note after AUTHORIZE creates a new REVIEW Decision', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    const first = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        messages: [
          {
            role: 'user',
            content: 'Note A: first write body MRN 12345 DOB 1980-01-01',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        tool_id: 'update_clinical_notes',
        agent_id: 'agent_enigma_clinical',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    const evalA = first.json().evaluation_id as string;
    await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evalA}/resolve`,
      headers: auth,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'ok',
        actor: 'reviewer_demo',
      },
    });
    await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        messages: [
          {
            role: 'user',
            content: 'Note A: first write body MRN 12345 DOB 1980-01-01',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        tool_id: 'update_clinical_notes',
        agent_id: 'agent_enigma_clinical',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        regulatory_applicability: ['HIPAA'],
      },
    });

    const second = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` },
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        messages: [
          {
            role: 'user',
            content: 'Note B: different write body MRN 12345 DOB 1980-01-01',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        tool_id: 'update_clinical_notes',
        agent_id: 'agent_enigma_clinical',
        governance_context: {
          tool_authorized: true,
          agent_authorized: true,
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(second.statusCode).toBe(403);
    const evalB = second.json().evaluation_id as string;
    expect(evalB).toBeTruthy();
    expect(evalB).not.toBe(evalA);
    expect(second.json().safety_hold).toBe(true);

    await server.close();
  });
});
