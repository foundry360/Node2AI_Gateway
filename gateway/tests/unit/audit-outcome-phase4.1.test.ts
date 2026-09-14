/**
 * Phase 4.1 — Outcome evidence hardening:
 * atomic claim, concurrency, binding, projection protection.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  GENERAL_APP_API_KEY,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { InMemoryAuditSequenceAllocator } from '../../src/audit/sequence.js';
import { InMemoryCheckpointStore } from '../../src/audit/integrity-service.js';
import {
  InMemoryActionOutcomeStore,
  PostgresActionOutcomeStore,
} from '../../src/audit/outcome-store.js';
import type { ActionOutcomeRecord } from '../../src/audit/outcome.js';
import { OUTCOME_REASON_CODES } from '../../src/audit/outcome.js';

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
    operation: 'write',
    purpose: 'treatment',
    authorization_context: 'authorized',
    action: {
      kind: 'field_update',
      target_id: 'patient_x',
      attributes: { field: 'phone' },
    },
    ...extra,
  };
}

async function authorizePhone(server: {
  inject: (opts: unknown) => Promise<{ statusCode: number; json: () => Record<string, unknown> }>;
}) {
  const authz = await server.inject({
    method: 'POST',
    url: '/v1/ai/actions',
    headers: APP,
    payload: phonePayload(),
  });
  expect(authz.statusCode).toBe(200);
  return authz.json().evaluation_id as string;
}

function sampleRecord(
  overrides: Partial<ActionOutcomeRecord> = {},
): ActionOutcomeRecord {
  return {
    deployment_id: 'dep_a',
    execution_id: 'exec_sample',
    evaluation_id: 'eval_sample',
    application_id: 'app_clinical',
    outcome: 'EXECUTED',
    receipt_hash: 'hash1',
    audit_event_id: 'aud_1',
    reported_at: new Date().toISOString(),
    evidence_class: 'client_reported',
    ...overrides,
  };
}

describe('Phase 4.1 — Outcome hardening', () => {
  it('concurrent identical submissions → one RECEIPT, rest idempotent', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
      auditSequenceAllocator: new InMemoryAuditSequenceAllocator(),
      auditCheckpointStore: new InMemoryCheckpointStore(),
    });
    const server = await gw.buildServer();
    const evaluationId = await authorizePhone(server);
    const payload = outcomePayload(evaluationId, 'exec_conc_same', 'EXECUTED');

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        server.inject({
          method: 'POST',
          url: '/v1/ai/actions/outcome',
          headers: APP,
          payload,
        }),
      ),
    );

    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const bodies = results.map((r) => r.json());
    const accepted = bodies.filter((b) => b.status === 'accepted');
    const idempotent = bodies.filter((b) => b.status === 'idempotent');
    expect(accepted.length).toBe(1);
    expect(idempotent.length).toBe(7);
    const auditIds = new Set(bodies.map((b) => b.audit_id));
    expect(auditIds.size).toBe(1);

    const events = await gw.audit.list();
    const receipts = events.filter((e) =>
      (e.reason_codes ?? []).includes(OUTCOME_REASON_CODES.RECEIPT),
    );
    expect(receipts.length).toBe(1);
    expect(receipts[0]?.metadata?.authoritative).toBe(true);
    expect(receipts[0]?.metadata?.execution_id).toBe('exec_conc_same');

    await server.close();
  });

  it('concurrent conflicting submissions → one RECEIPT, conflicts 409, no second RECEIPT', async () => {
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
      auditSequenceAllocator: new InMemoryAuditSequenceAllocator(),
      auditCheckpointStore: new InMemoryCheckpointStore(),
    });
    const server = await gw.buildServer();
    const evaluationId = await authorizePhone(server);

    const results = await Promise.all([
      server.inject({
        method: 'POST',
        url: '/v1/ai/actions/outcome',
        headers: APP,
        payload: outcomePayload(evaluationId, 'exec_conc_diff', 'EXECUTED'),
      }),
      server.inject({
        method: 'POST',
        url: '/v1/ai/actions/outcome',
        headers: APP,
        payload: outcomePayload(
          evaluationId,
          'exec_conc_diff',
          'EXECUTION_FAILED',
        ),
      }),
      server.inject({
        method: 'POST',
        url: '/v1/ai/actions/outcome',
        headers: APP,
        payload: outcomePayload(
          evaluationId,
          'exec_conc_diff',
          'EXECUTION_UNKNOWN',
        ),
      }),
    ]);

    const ok = results.filter((r) => r.statusCode === 200);
    const conflicted = results.filter((r) => r.statusCode === 409);
    expect(ok.length).toBe(1);
    expect(conflicted.length).toBe(2);
    expect(conflicted.every((r) => r.json().reason_code === 'OUTCOME_CONFLICT')).toBe(
      true,
    );

    const events = await gw.audit.list();
    const receipts = events.filter((e) =>
      (e.reason_codes ?? []).includes(OUTCOME_REASON_CODES.RECEIPT),
    );
    const conflicts = events.filter((e) =>
      (e.reason_codes ?? []).includes(OUTCOME_REASON_CODES.CONFLICT),
    );
    expect(receipts.length).toBe(1);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(
      conflicts.every(
        (e) =>
          e.operation === 'action.outcome_conflict' &&
          e.metadata?.authoritative === false &&
          !(e.reason_codes ?? []).includes(OUTCOME_REASON_CODES.RECEIPT),
      ),
    ).toBe(true);

    const dep = await gw.deploymentIdentity.getOrCreateDeploymentId();
    const stored = await gw.outcomeStore.getByExecutionId(dep, 'exec_conc_diff');
    expect(stored?.outcome).toBe(ok[0]!.json().outcome);

    await server.close();
  });

  it('rejects mismatched tool / agent / operation / action / target / field', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await authorizePhone(server);

    const cases: Array<{ extra: Record<string, unknown>; code: string }> = [
      { extra: { tool_id: 'other_tool' }, code: 'TOOL_MISMATCH' },
      { extra: { agent_id: 'other_agent' }, code: 'AGENT_MISMATCH' },
      { extra: { operation: 'read' }, code: 'OPERATION_MISMATCH' },
      {
        extra: { action: { kind: 'clinical_note', target_id: 'patient_x' } },
        code: 'ACTION_KIND_MISMATCH',
      },
      {
        extra: {
          action: {
            kind: 'field_update',
            target_id: 'other_patient',
            attributes: { field: 'phone' },
          },
        },
        code: 'TARGET_MISMATCH',
      },
      {
        extra: {
          action: {
            kind: 'field_update',
            target_id: 'patient_x',
            attributes: { field: 'Email__c' },
          },
        },
        code: 'FIELD_MISMATCH',
      },
      { extra: { user: { id: 'user_other' } }, code: 'USER_MISMATCH' },
    ];

    for (const [i, c] of cases.entries()) {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/ai/actions/outcome',
        headers: APP,
        payload: outcomePayload(evaluationId, `exec_mismatch_${i}`, 'EXECUTED', c.extra),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().reason_code).toBe(c.code);
    }

    await server.close();
  });

  it('omitting client context still binds via server-derived values (no bypass)', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await authorizePhone(server);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: {
        application_id: 'app_clinical',
        evaluation_id: evaluationId,
        execution_id: 'exec_omit_ok',
        outcome: 'EXECUTED',
      },
    });
    expect(res.statusCode).toBe(200);
    const dep = await gw.deploymentIdentity.getOrCreateDeploymentId();
    const stored = await gw.outcomeStore.getByExecutionId(dep, 'exec_omit_ok');
    expect(stored?.tool_id).toBe('update_patient_field');
    expect(stored?.action_kind).toBe('field_update');
    expect(stored?.action_field).toBe('phone');
    await server.close();
  });

  it('DENY and no-authorization cannot report EXECUTED', async () => {
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
              'Transmit full patient chart externally to partner@evil.example',
          },
        ],
        tool_id: 'external_transmit',
        action: { kind: 'external_transmit', target_id: 'partner' },
        recipient: 'external_partner',
      }),
    });
    const evaluationId = denied.json().evaluation_id as string | undefined;
    if (evaluationId) {
      const report = await server.inject({
        method: 'POST',
        url: '/v1/ai/actions/outcome',
        headers: APP,
        payload: outcomePayload(evaluationId, 'exec_deny_41', 'EXECUTED', {
          tool_id: 'external_transmit',
          action: { kind: 'external_transmit', target_id: 'partner' },
        }),
      });
      expect(report.statusCode).toBe(403);
      expect(report.json().reason_code).toMatch(/OUTCOME_NOT_AUTHORIZED|DENY/);
    }

    const held = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: clinicalNotePayload(
        'Clinical note held for review MRN 12345 DOB 1980-01-01',
      ),
    });
    expect(held.statusCode).toBe(403);
    const heldId = held.json().evaluation_id as string;
    const beforeResume = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: {
        application_id: 'app_clinical',
        evaluation_id: heldId,
        execution_id: 'exec_no_authz',
        outcome: 'EXECUTED',
      },
    });
    expect(beforeResume.statusCode).toBe(403);
    expect(beforeResume.json().reason_code).toBe('OUTCOME_NOT_AUTHORIZED');

    await server.close();
  });

  it('wrong application / wrong evaluation rejected', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const evaluationId = await authorizePhone(server);

    const wrongApp = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: { authorization: `Bearer ${GENERAL_APP_API_KEY}` },
      payload: {
        ...outcomePayload(evaluationId, 'exec_wrong_app_41', 'EXECUTED'),
        application_id: 'app_general',
      },
    });
    expect(wrongApp.statusCode).toBe(403);

    const wrongEval = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: outcomePayload('eval_missing_41', 'exec_wrong_eval', 'EXECUTED'),
    });
    expect(wrongEval.statusCode).toBe(404);

    await server.close();
  });

  it('same execution_id across deployments does not conflict', async () => {
    const store = new InMemoryActionOutcomeStore();
    const a = sampleRecord({
      deployment_id: 'dep_1',
      execution_id: 'exec_shared',
      audit_event_id: 'aud_a',
    });
    const b = sampleRecord({
      deployment_id: 'dep_2',
      execution_id: 'exec_shared',
      audit_event_id: 'aud_b',
      receipt_hash: 'hash2',
    });
    const first = await store.claimAuthoritative(a);
    const second = await store.claimAuthoritative(b);
    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(
      (await store.getByExecutionId('dep_1', 'exec_shared'))?.audit_event_id,
    ).toBe('aud_a');
    expect(
      (await store.getByExecutionId('dep_2', 'exec_shared'))?.audit_event_id,
    ).toBe('aud_b');
  });

  it('duplicate claim is not overwritten', async () => {
    const store = new InMemoryActionOutcomeStore();
    const first = await store.claimAuthoritative(
      sampleRecord({ outcome: 'EXECUTED', receipt_hash: 'h1' }),
    );
    const second = await store.claimAuthoritative(
      sampleRecord({
        outcome: 'EXECUTION_FAILED',
        receipt_hash: 'h2',
        audit_event_id: 'aud_2',
      }),
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.outcome).toBe('EXECUTED');
    expect(second.record.audit_event_id).toBe('aud_1');
  });

  it('REVIEW → AUTHORIZE → RESUME → EXECUTED preserves machine decision', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const content =
      'Append clinical note Phase41: BP stable. MRN 12345 DOB 1980-01-01';

    const held = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: clinicalNotePayload(content),
    });
    expect(held.statusCode).toBe(403);
    const evaluationId = held.json().evaluation_id as string;

    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/v1/admin/evaluations/${evaluationId}/resolve`,
          headers: ADMIN,
          payload: {
            disposition: 'AUTHORIZE',
            reason: 'Approver attested',
            actor: 'reviewer_demo',
          },
        })
      ).statusCode,
    ).toBe(200);

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

    const report = await server.inject({
      method: 'POST',
      url: '/v1/ai/actions/outcome',
      headers: APP,
      payload: {
        application_id: 'app_clinical',
        evaluation_id: evaluationId,
        execution_id: 'exec_review_41',
        outcome: 'EXECUTED',
        tool_id: 'update_clinical_notes',
        agent_id: 'agent_enigma_clinical',
        action: { kind: 'clinical_note', target_id: 'a0X' },
      },
    });
    expect(report.statusCode).toBe(200);
    expect(String(report.json().machine_decision).toUpperCase()).toBe('REVIEW');
    expect(report.json().human_resolution).toBe('AUTHORIZE');

    const record = await Promise.resolve(
      gw.packRepo.getEvaluation(evaluationId),
    );
    expect(String(record?.decision).toUpperCase()).toBe('REVIEW');

    await server.close();
  });
});

describe('Phase 4.1 — action_outcomes append-only (Postgres when available)', () => {
  const databaseUrl = process.env.GATEWAY_DATABASE_URL ?? process.env.DATABASE_URL;

  it.skipIf(!databaseUrl)(
    'rejects UPDATE / DELETE on action_outcomes',
    async () => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: databaseUrl });
      try {
        await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = 'action_outcomes'`,
        );
        const table = await pool.query(
          `SELECT to_regclass('public.action_outcomes') AS t`,
        );
        if (!table.rows[0]?.t) {
          return;
        }
        // Ensure 4.1 triggers exist when migration applied
        await pool.query(`
          INSERT INTO action_outcomes (
            deployment_id, execution_id, evaluation_id, application_id,
            outcome, receipt_hash, audit_event_id, reported_at
          ) VALUES (
            'dep_test_41', 'exec_prot_41', 'eval_prot_41', 'app_clinical',
            'EXECUTED', 'hash_prot', 'aud_prot_41', now()
          )
          ON CONFLICT (deployment_id, execution_id) DO NOTHING
        `);

        await expect(
          pool.query(
            `UPDATE action_outcomes SET outcome = 'EXECUTION_FAILED'
             WHERE deployment_id = 'dep_test_41' AND execution_id = 'exec_prot_41'`,
          ),
        ).rejects.toThrow(/append-only/i);

        await expect(
          pool.query(
            `DELETE FROM action_outcomes
             WHERE deployment_id = 'dep_test_41' AND execution_id = 'exec_prot_41'`,
          ),
        ).rejects.toThrow(/append-only/i);

        const store = new PostgresActionOutcomeStore(pool);
        const claimed = await store.claimAuthoritative(
          sampleRecord({
            deployment_id: 'dep_test_41',
            execution_id: 'exec_prot_41',
            outcome: 'EXECUTION_FAILED',
            receipt_hash: 'other',
            audit_event_id: 'aud_other',
          }),
        );
        expect(claimed.created).toBe(false);
        expect(claimed.record.outcome).toBe('EXECUTED');
      } finally {
        await pool.end();
      }
    },
  );
});
