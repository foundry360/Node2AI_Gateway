import { describe, expect, it } from 'vitest';
import {
  buildDecisionEvidencePayload,
  computeDecisionHash,
  decisionBindingFromRecord,
} from '../../src/audit/decision-binding.js';
import { IntegrityAuditService } from '../../src/audit/integrity-service.js';
import {
  canonicalEventPayload,
  computeEventHash,
  hashResponseContent,
  verifyAuditChain,
} from '../../src/audit/integrity.js';
import { InMemoryAuditService } from '../../src/audit/service.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';
import { createPhase1Gateway, PHASE1_DEMO_API_KEY } from '../../src/api/app-factory.js';

function sampleRecord(
  overrides: Partial<PolicyEvaluationRecord> = {},
): PolicyEvaluationRecord {
  return {
    evaluation_id: 'eval_bind_1',
    request_id: 'req_bind_1',
    phase: 'input',
    subject: { type: 'user', id: 'u1' },
    resource: { type: 'document', classification: 'PHI' },
    action: 'summarize',
    context: { purpose: 'treatment', environment: 'prod' },
    ai_context: {},
    evidence_in: { classification: 'PHI', decision_reason_codes: ['POLICY_ALLOW'] },
    decision: 'ALLOW',
    reason_codes: ['POLICY_ALLOW'],
    applicable_policies: [
      { policy_id: 'pol_phase2_core', version: 2, pack_id: 'pack_enterprise_baseline' },
    ],
    obligations: [{ code: 'LOG_GOVERNANCE_EVENT' }, { code: 'LOCAL_MODEL_ONLY' }],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: 'allow',
      provenance: {
        matched_rules: [],
      },
    },
    created_at: '2026-09-06T15:00:00.000Z',
    ...overrides,
  };
}

describe('Decision ↔ Audit cryptographic binding', () => {
  it('A — Decision binding: audit seals evaluation_id + decision_hash into event_hash', async () => {
    const record = sampleRecord();
    const binding = decisionBindingFromRecord(record);
    expect(binding.evaluation_id).toBe('eval_bind_1');
    expect(binding.decision_hash).toMatch(/^[a-f0-9]{64}$/);

    const inner = new InMemoryAuditService();
    const audit = new IntegrityAuditService(inner, 'test-audit-key');
    const sealed = await audit.record({
      audit_id: 'aud_bind_1',
      timestamp: '2026-09-06T15:01:00.000Z',
      request_id: 'req_bind_1',
      correlation_id: 'cor_bind_1',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      evaluation_id: binding.evaluation_id,
      decision_hash: binding.decision_hash,
      metadata: { __response_content: 'released text' },
    });

    expect(sealed.evaluation_id).toBe(binding.evaluation_id);
    expect(sealed.decision_hash).toBe(binding.decision_hash);
    expect(sealed.event_hash).toBe(
      computeEventHash(
        canonicalEventPayload({
          audit_id: sealed.audit_id,
          timestamp: sealed.timestamp,
          request_id: sealed.request_id,
          correlation_id: sealed.correlation_id,
          policy_decision: sealed.policy_decision,
          response_decision: sealed.response_decision,
          evaluation_id: sealed.evaluation_id,
          decision_hash: sealed.decision_hash,
          response_hash: sealed.response_hash!,
          prev_event_hash: sealed.prev_event_hash!,
        }),
      ),
    );
    const integrity = await audit.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });

  it('B — Decision tampering changes decision_hash', () => {
    const original = sampleRecord();
    const h1 = computeDecisionHash(original);
    const tampered = sampleRecord({ decision: 'DENY' });
    const h2 = computeDecisionHash(tampered);
    expect(h2).not.toBe(h1);

    // Audit still claiming H1 no longer matches authoritative Decision
    expect(computeDecisionHash(tampered)).not.toBe(h1);
  });

  it('C — Audit tampering of evaluation_id / decision_hash invalidates event_hash', async () => {
    const binding = decisionBindingFromRecord(sampleRecord());
    const inner = new InMemoryAuditService();
    const audit = new IntegrityAuditService(inner, 'test-audit-key');
    await audit.record({
      audit_id: 'aud_tamper_1',
      timestamp: '2026-09-06T15:02:00.000Z',
      request_id: 'req_tamper_1',
      correlation_id: 'cor_tamper_1',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      evaluation_id: binding.evaluation_id,
      decision_hash: binding.decision_hash,
      metadata: { __response_content: 'ok' },
    });
    const events = await audit.list();
    events[0]!.evaluation_id = 'eval_forged';
    expect(verifyAuditChain(events, 'test-audit-key').ok).toBe(false);
    expect(verifyAuditChain(events, 'test-audit-key').reason).toBe(
      'event_hash_mismatch',
    );

    events[0]!.evaluation_id = binding.evaluation_id;
    events[0]!.decision_hash = '0'.repeat(64);
    expect(verifyAuditChain(events, 'test-audit-key').ok).toBe(false);
  });

  it('D — Response tampering still detected', async () => {
    const inner = new InMemoryAuditService();
    const audit = new IntegrityAuditService(inner, 'test-audit-key');
    await audit.record({
      audit_id: 'aud_resp_1',
      timestamp: '2026-09-06T15:03:00.000Z',
      request_id: 'req_resp_1',
      correlation_id: 'cor_resp_1',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      metadata: { __response_content: 'hello world' },
    });
    const events = await audit.list();
    events[0]!.response_hash = '0'.repeat(64);
    const result = verifyAuditChain(events, 'test-audit-key');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('event_hash_mismatch');
  });

  it('E — Chain tampering still detected', async () => {
    const inner = new InMemoryAuditService();
    const audit = new IntegrityAuditService(inner, 'test-audit-key');
    await audit.record({
      audit_id: 'aud_chain_1',
      timestamp: '2026-09-06T15:04:00.000Z',
      request_id: 'req_chain_1',
      correlation_id: 'cor_chain_1',
      metadata: { __response_content: 'a' },
    });
    await audit.record({
      audit_id: 'aud_chain_2',
      timestamp: '2026-09-06T15:04:01.000Z',
      request_id: 'req_chain_2',
      correlation_id: 'cor_chain_2',
      metadata: { __response_content: 'b' },
    });
    const events = await audit.list();
    events[1]!.prev_event_hash = 'GENESIS';
    const result = verifyAuditChain(events, 'test-audit-key');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('prev_hash_mismatch');
  });

  it('F — No-decision event remains valid with null binding fields', async () => {
    const inner = new InMemoryAuditService();
    const audit = new IntegrityAuditService(inner, 'test-audit-key');
    const sealed = await audit.record({
      audit_id: 'aud_nodecl_1',
      timestamp: '2026-09-06T15:05:00.000Z',
      request_id: 'req_nodecl_1',
      correlation_id: 'cor_nodecl_1',
      operation: 'admin_config',
      policy_decision: undefined,
      evaluation_id: null,
      decision_hash: null,
      metadata: { __response_content: '' },
    });
    expect(sealed.evaluation_id).toBeNull();
    expect(sealed.decision_hash).toBeNull();
    // Null binding omitted from hash — same as historical format
    const payload = canonicalEventPayload({
      audit_id: sealed.audit_id,
      timestamp: sealed.timestamp,
      request_id: sealed.request_id,
      correlation_id: sealed.correlation_id,
      operation: sealed.operation,
      response_hash: sealed.response_hash!,
      prev_event_hash: sealed.prev_event_hash!,
    });
    expect(sealed.event_hash).toBe(computeEventHash(payload));
    expect((await audit.verifyIntegrity()).ok).toBe(true);
  });

  it('G — AUTHORIZE decision fingerprint differs from machine-only; resume audit binds it', async () => {
    const before = sampleRecord({
      evaluation_id: 'eval_review_bind',
      decision: 'REVIEW',
      reason_codes: ['POLICY_REVIEW'],
    });
    const afterAuthorize = sampleRecord({
      evaluation_id: 'eval_review_bind',
      decision: 'REVIEW',
      reason_codes: ['POLICY_REVIEW'],
      human_resolution: {
        resolution_status: 'RESOLVED',
        original_decision: 'REVIEW',
        human_disposition: 'AUTHORIZE',
        final_decision: 'ALLOW',
        resolution_reason: 'Approved for treatment',
        resolved_by: 'approver',
        resolved_at: '2026-09-06T15:07:00.000Z',
      },
    });
    // Machine decision immutable
    expect(afterAuthorize.decision).toBe('REVIEW');
    expect(afterAuthorize.human_resolution?.final_decision).toBe('ALLOW');
    expect(computeDecisionHash(afterAuthorize)).not.toBe(computeDecisionHash(before));

    const binding = decisionBindingFromRecord(afterAuthorize);
    const inner = new InMemoryAuditService();
    const audit = new IntegrityAuditService(inner, 'test-audit-key');
    const sealed = await audit.record({
      audit_id: 'aud_resume_1',
      timestamp: '2026-09-06T15:08:00.000Z',
      request_id: 'req_review_bind',
      correlation_id: 'cor_review_bind',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      evaluation_id: binding.evaluation_id,
      decision_hash: binding.decision_hash,
      metadata: {
        resume: true,
        evaluation_id: afterAuthorize.evaluation_id,
        __response_content: 'resumed',
      },
    });
    expect(sealed.evaluation_id).toBe('eval_review_bind');
    expect(sealed.decision_hash).toBe(binding.decision_hash);
    expect((await audit.verifyIntegrity()).ok).toBe(true);
  });

  it('H — DENY cannot produce resume/release of authorized hold', async () => {
    const { InMemoryPolicyRepository } = await import(
      '../../src/policy/enterprise/repository.js'
    );
    const repo = new InMemoryPolicyRepository();
    repo.recordEvaluation(
      sampleRecord({
        evaluation_id: 'eval_deny_bind',
        decision: 'REVIEW',
        reason_codes: ['POLICY_REVIEW'],
        held_request: {
          version: 1,
          application_id: 'app_clinical',
          organization_id: 'org_demo',
          user_id: 'user_clinician',
          operation: 'summarize',
          messages: [{ role: 'user', content: 'x' }],
          correlation_id: 'cor_deny_bind',
          classification: {
            sensitivity: 'PHI',
            confidence: 0.9,
            intent: 'clinical',
            risk: 'high',
            reason_codes: [],
          },
          allowed_models: ['local-general-v1'],
          available_models: ['local-general-v1'],
        },
      }),
    );
    const gw = createPhase1Gateway({
      config: { adminApiKey: 'test_admin', auditSigningKey: 'test-audit-key' },
      policyRepository: repo,
    });
    const server = await gw.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_deny_bind/resolve',
      headers: auth,
      payload: { disposition: 'DENY', reason: 'No consent', actor: 'bob' },
    });

    const resume = await server.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_deny_bind/resume',
      headers: auth,
    });
    expect(resume.statusCode).toBe(400);
    expect(resume.json().reason_code).toBe('DENY_CANNOT_RESUME');

    const events = await gw.audit.list();
    const resolveEvt = events.find((e) => e.operation === 'evaluation_resolve');
    expect(resolveEvt?.evaluation_id).toBe('eval_deny_bind');
    expect(resolveEvt?.decision_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(resolveEvt?.response_decision).toBe('BLOCK');
    // No RELEASE resume audit for DENY
    expect(
      events.some(
        (e) =>
          e.metadata?.resume === true && e.response_decision === 'RELEASE',
      ),
    ).toBe(false);

    await server.close();
  });

  it('Historical audit without decision binding remains verifiable', async () => {
    const inner = new InMemoryAuditService();
    const audit = new IntegrityAuditService(inner, 'test-audit-key');
    // Legacy-format seal: no evaluation_id / decision_hash on the event
    const sealed = await audit.record({
      audit_id: 'aud_legacy_1',
      timestamp: '2026-09-06T14:00:00.000Z',
      request_id: 'req_legacy_1',
      correlation_id: 'cor_legacy_1',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      metadata: { __response_content: 'legacy' },
    });
    expect(sealed.evaluation_id == null || sealed.evaluation_id === null).toBe(true);
    expect(sealed.decision_hash == null || sealed.decision_hash === null).toBe(true);
    const legacyPayload = canonicalEventPayload({
      audit_id: sealed.audit_id,
      timestamp: sealed.timestamp,
      request_id: sealed.request_id,
      correlation_id: sealed.correlation_id,
      policy_decision: sealed.policy_decision,
      response_decision: sealed.response_decision,
      response_hash: sealed.response_hash!,
      prev_event_hash: sealed.prev_event_hash!,
    });
    expect(JSON.parse(legacyPayload)).not.toHaveProperty('evaluation_id');
    expect(JSON.parse(legacyPayload)).not.toHaveProperty('decision_hash');
    expect(sealed.event_hash).toBe(computeEventHash(legacyPayload));
    expect((await audit.verifyIntegrity()).ok).toBe(true);
  });

  it('Invariants: stable hash, no UI fields, machine decision immutable in payload', () => {
    const a = sampleRecord();
    const b = sampleRecord();
    expect(computeDecisionHash(a)).toBe(computeDecisionHash(b));
    expect(canonicalDecisionKeys(buildDecisionEvidencePayload(a))).not.toContain(
      'narrative',
    );
    expect(buildDecisionEvidencePayload(a).machine_decision).toBe('ALLOW');
    const withHuman = sampleRecord({
      human_resolution: {
        resolution_status: 'RESOLVED',
        original_decision: 'ALLOW',
        human_disposition: 'DENY',
        final_decision: 'DENY',
        resolution_reason: 'changed mind',
        resolved_by: 'alice',
        resolved_at: '2026-09-06T16:00:00.000Z',
      },
    });
    expect(buildDecisionEvidencePayload(withHuman).machine_decision).toBe('ALLOW');
    expect(
      (buildDecisionEvidencePayload(withHuman).human_resolution as { final_decision: string })
        .final_decision,
    ).toBe('DENY');
  });

  it('Live completion audit includes Decision binding when evaluation exists', async () => {
    const gw = createPhase1Gateway({
      config: { auditSigningKey: 'test-audit-key' },
    });
    const r1 = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });
    expect(r1.httpStatus).toBe(200);
    const events = await gw.audit.list();
    const last = events[events.length - 1]!;
    expect(last.evaluation_id).toBeTruthy();
    expect(last.decision_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(last.response_hash).toBe(
      hashResponseContent(
        (r1.body as { response: { message: { content: string } } }).response.message
          .content,
      ),
    );
    expect((await (gw.audit as IntegrityAuditService).verifyIntegrity()).ok).toBe(
      true,
    );
  });
});

function canonicalDecisionKeys(payload: Record<string, unknown>): string[] {
  return Object.keys(payload);
}
