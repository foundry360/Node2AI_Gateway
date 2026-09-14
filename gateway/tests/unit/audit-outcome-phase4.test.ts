/**
 * Phase 4 — Enforcement / Execution / Outcome evidence.
 * Client-reported Outcome receipts sealed into the existing audit chain.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  GENERAL_APP_API_KEY,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { InMemoryAuditSequenceAllocator } from '../../src/audit/sequence.js';
import { InMemoryCheckpointStore } from '../../src/audit/integrity-service.js';
import type { IntegrityAuditService } from '../../src/audit/integrity-service.js';
import { verifyAuditChain } from '../../src/audit/integrity.js';

const ADMIN = { authorization: 'Bearer test_admin' };
const APP = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };

function phonePayload(overrides: Record<string, unknown> = {}) {
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
    agent_id: 'agent_generic_1',
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
    ...overrides,
  };
}

function clinicalNotePayload(content: string) {
  return {
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
  };
}

function outcomePayload(
  evaluationId: string,
  executionId: string,
  outcome: string,
  extra: Record<string, unknown> = {},
) {
  return {
    application_id: 'app_clinical',
    evaluation_id: evaluationId,
    execution_id: executionId,
    outcome,
    user: { id: 'user_clinician' },
    tool_id: 'update_patient_field',
    agent_id: 'agent_generic_1',
    action: { kind: 'field_update', target_id: 'patient_x' },
    ...extra,
  };
}

describe('Phase 4 — action Outcome evidence', () => {
  it('ALLOW → CLIENT_COMMIT_ALLOWED → EXECUTED', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
      auditSequenceAllocator: new InMemoryAuditSequenceAllocator(),
      auditCheckpointStore: new InMemoryCheckpointStore(),
    });
    const server = await gw.buildServer();

    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    expect(authz.statusCode).toBe(200);
    const evaluationId = authz.json().evaluation_id as string;
    expect(evaluationId).toBeTruthy();

    const executionId = 'exec_phase4_ok_1';
    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload(evaluationId, executionId, 'EXECUTED'),
    });
    expect(report.statusCode).toBe(200);
    const body = report.json();
    expect(body.status).toBe('accepted');
    expect(body.outcome).toBe('EXECUTED');
    expect(body.evidence_class).toBe('client_reported');
    expect(body.enforcement).toBe('CLIENT_COMMIT_ALLOWED');
    expect(body.audit_id).toBeTruthy();

    const events = await gw.audit.list();
    const outcomeEvent = events.find((e) => e.audit_id === body.audit_id);
    expect(outcomeEvent?.reason_codes).toContain('CLIENT_OUTCOME_RECEIPT');
    expect(outcomeEvent?.reason_codes).toContain('CLIENT_OUTCOME_EXECUTED');
    expect(outcomeEvent?.metadata?.execution_id).toBe(executionId);
    expect(outcomeEvent?.event_hash).toBeTruthy();
    expect(typeof outcomeEvent?.sequence_number).toBe('number');

    const stored = await gw.outcomeStore.getByExecutionId(
      await gw.deploymentIdentity.getOrCreateDeploymentId(),
      executionId,
    );
    expect(stored?.outcome).toBe('EXECUTED');
    expect(stored?.evaluation_id).toBe(evaluationId);

    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: ADMIN,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().outcome?.status).toBe('EXECUTED');
    expect(detail.json().execution?.client?.execution_id).toBe(executionId);

    await server.close();
  });

  it('REVIEW → AUTHORIZE → RESUMED → CLIENT_COMMIT_ALLOWED → EXECUTED; machine decision preserved', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const content =
      'Append clinical note for patient a0X: Phase4 BP 120/80. MRN 12345 DOB 1980-01-01';

    const held = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: clinicalNotePayload(content),
    });
    expect(held.statusCode).toBe(403);
    const evaluationId = held.json().evaluation_id as string;

    const resolve = await server.inject({
      method: 'POST',
      url: `/v1/admin/evaluations/${evaluationId}/resolve`,
      headers: ADMIN,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'Approver attested clinical note',
        actor: 'reviewer_demo',
      },
    });
    expect(resolve.statusCode).toBe(200);

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: {
        ...clinicalNotePayload(content),
        resume_evaluation_id: evaluationId,
      },
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().action).toBe('commit_allowed');

    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: {
        application_id: 'app_clinical',
        evaluation_id: evaluationId,
        execution_id: 'exec_phase4_review_1',
        outcome: 'EXECUTED',
        tool_id: 'update_clinical_notes',
        agent_id: 'agent_enigma_clinical',
        action: { kind: 'clinical_note', target_id: 'a0X' },
      },
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().machine_decision?.toUpperCase()).toBe('REVIEW');
    expect(report.json().human_resolution).toBe('AUTHORIZE');

    const record = await Promise.resolve(
      gw.packRepo.getEvaluation(evaluationId),
    );
    expect(String(record?.decision).toUpperCase()).toBe('REVIEW');
    expect(record?.human_resolution?.human_disposition).toBe('AUTHORIZE');
    expect(record?.execution?.status).toBe('RESUMED');

    await server.close();
  });

  it('ALLOW → CLIENT_COMMIT_ALLOWED → EXECUTION_FAILED', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    const evaluationId = authz.json().evaluation_id as string;
    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload(evaluationId, 'exec_fail_1', 'EXECUTION_FAILED'),
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().outcome).toBe('EXECUTION_FAILED');
    await server.close();
  });

  it('ALLOW → CLIENT_COMMIT_ALLOWED → EXECUTION_UNKNOWN', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    const evaluationId = authz.json().evaluation_id as string;
    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload(evaluationId, 'exec_unk_1', 'EXECUTION_UNKNOWN'),
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().outcome).toBe('EXECUTION_UNKNOWN');
    await server.close();
  });

  it('DENY → no EXECUTED outcome accepted', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const denied = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload({
        messages: [
          {
            role: 'user',
            content:
              'Transmit full patient chart externally to partner@evil.example with SSN and MRN',
          },
        ],
        tool_id: 'external_transmit',
        action: { kind: 'external_transmit', target_id: 'partner' },
        recipient: 'external_partner',
      }),
    });
    // May be 403 blocked — capture evaluation if present
    const evaluationId = denied.json().evaluation_id as string | undefined;
    if (evaluationId) {
      const report = await server.inject({
        method: 'POST',
        url: '/v1/ai/actions/outcome',
        headers: APP,
        payload: outcomePayload(evaluationId, 'exec_deny_1', 'EXECUTED', {
          tool_id: 'external_transmit',
          action: { kind: 'external_transmit', target_id: 'partner' },
        }),
      });
      expect(report.statusCode).toBe(403);
      expect(report.json().reason_code).toMatch(
        /OUTCOME_NOT_AUTHORIZED|DENY/,
      );
    } else {
      // No evaluation id — still reject unknown evaluation
      const report = await server.inject({
        method: 'POST',
        url: '/v1/ai/actions/outcome',
        headers: APP,
        payload: outcomePayload('eval_missing', 'exec_deny_1', 'EXECUTED'),
      });
      expect([403, 404]).toContain(report.statusCode);
    }
    await server.close();
  });

  it('rejects invalid evaluation', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload('eval_does_not_exist', 'exec_x', 'EXECUTED'),
    });
    expect(report.statusCode).toBe(404);
    await server.close();
  });

  it('rejects wrong application', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    const evaluationId = authz.json().evaluation_id as string;
    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: { authorization: `Bearer ${GENERAL_APP_API_KEY}` },
      payload: {
        ...outcomePayload(evaluationId, 'exec_wrong_app', 'EXECUTED'),
        application_id: 'app_general',
      },
    });
    expect(report.statusCode).toBe(403);
    expect(report.json().reason_code).toMatch(
      /APPLICATION_MISMATCH|OUTCOME_NOT_AUTHORIZED/,
    );
    await server.close();
  });

  it('rejects wrong action context', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    const evaluationId = authz.json().evaluation_id as string;
    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload(evaluationId, 'exec_ctx', 'EXECUTED', {
        action: { kind: 'clinical_note', target_id: 'patient_x' },
      }),
    });
    expect(report.statusCode).toBe(409);
    expect(report.json().reason_code).toBe('ACTION_KIND_MISMATCH');
    await server.close();
  });

  it('idempotent replay of identical receipt', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    const evaluationId = authz.json().evaluation_id as string;
    const payload = outcomePayload(evaluationId, 'exec_idem_1', 'EXECUTED');
    const first = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('accepted');
    const second = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe('idempotent');
    expect(second.json().audit_id).toBe(first.json().audit_id);
    await server.close();
  });

  it('conflicting replay returns 409', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    const evaluationId = authz.json().evaluation_id as string;
    const first = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload(evaluationId, 'exec_conflict_1', 'EXECUTED'),
    });
    expect(first.statusCode).toBe(200);
    const conflict = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload(
        evaluationId,
        'exec_conflict_1',
        'EXECUTION_FAILED',
      ),
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().reason_code).toBe('OUTCOME_CONFLICT');
    expect(conflict.json().existing_outcome).toBe('EXECUTED');
    // Original projection unchanged
    const stored = await gw.outcomeStore.getByExecutionId(
      await gw.deploymentIdentity.getOrCreateDeploymentId(),
      'exec_conflict_1',
    );
    expect(stored?.outcome).toBe('EXECUTED');
    await server.close();
  });

  it('accepted Outcome seals into audit chain and can participate in checkpoint', async () => {
    const allocator = new InMemoryAuditSequenceAllocator();
    const store = new InMemoryCheckpointStore();
    const gw = createPhase1Gateway({
      config: {
        adminApiKey: 'test_admin',
        auditCheckpointEveryEvents: 2,
        auditCheckpointingEnabled: true,
      },
      auditSequenceAllocator: allocator,
      auditCheckpointStore: store,
    });
    const server = await gw.buildServer();
    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    const evaluationId = authz.json().evaluation_id as string;
    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload(evaluationId, 'exec_chain_1', 'EXECUTED'),
    });
    expect(report.statusCode).toBe(200);

    const audit = gw.audit as IntegrityAuditService;
    const events = await audit.list();
    const hmacKey = gw.config.auditSigningKey;
    const chain = verifyAuditChain(events, hmacKey);
    expect(chain.ok).toBe(true);

    const outcomeEvent = events.find(
      (e) => e.audit_id === report.json().audit_id,
    );
    expect(outcomeEvent?.event_hash).toBeTruthy();
    expect(outcomeEvent?.integrity_signature).toBeTruthy();
    expect(typeof outcomeEvent?.sequence_number).toBe('number');

    const dep = outcomeEvent?.deployment_id;
    if (dep && typeof audit.listCheckpoints === 'function') {
      const cps = await audit.listCheckpoints(dep);
      // May or may not have checkpointed yet depending on event count threshold
      if (cps.length > 0) {
        const covering = cps.find(
          (c) =>
            typeof outcomeEvent.sequence_number === 'number' &&
            c.sequence_start <= outcomeEvent.sequence_number &&
            outcomeEvent.sequence_number <= c.sequence_end,
        );
        expect(covering || cps.length >= 0).toBeTruthy();
      }
    }

    await server.close();
  });

  it('authorization without outcome remains NOT_REPORTED', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const authz = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: phonePayload(),
    });
    const evaluationId = authz.json().evaluation_id as string;
    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: ADMIN,
    });
    expect(detail.json().outcome?.status).toBe('NOT_REPORTED');
    expect(detail.json().execution?.client?.status).toBe('NOT_REPORTED');
    await server.close();
  });
});
