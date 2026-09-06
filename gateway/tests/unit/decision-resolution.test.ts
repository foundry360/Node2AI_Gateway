import { describe, expect, it } from 'vitest';
import { createPhase1Gateway } from '../../src/api/app-factory.js';
import {
  InMemoryPolicyRepository,
  buildHumanResolution,
  projectEnforcementResult,
  toEvaluationListItem,
} from '../../src/policy/enterprise/index.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';
import type { AuditEvent } from '../../src/audit/service.js';

function reviewRecord(
  overrides: Partial<PolicyEvaluationRecord> = {},
): PolicyEvaluationRecord {
  return {
    evaluation_id: 'eval_review_1',
    request_id: 'req_review_1',
    phase: 'input',
    subject: {},
    resource: {},
    context: {},
    ai_context: {},
    evidence_in: {},
    decision: 'REVIEW',
    reason: 'Insufficient authorization context',
    applicable_policies: [{ policy_id: 'pol_test', version: 1, pack_id: 'pack_test' }],
    obligations: [],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: 'REVIEW',
      resolution: {
        category: 'UNRESOLVED',
        basis: 'UNRESOLVED_NO_PRECEDENCE',
        contributing_pack_ids: ['pack_a', 'pack_b'],
        detail: 'Material decision conflict without precedence',
        contributions: [],
      },
      provenance: {
        matched_rules: [
          {
            rule_id: 'R-1',
            obligation_ids: ['O-1'],
            citations: ['C-1'],
            source_ids: ['S-1'],
            authority_tier: 1,
          },
        ],
      },
    },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Human review & decision resolution', () => {
  it('A — pending REVIEW expects HOLD; safety block is not DENY/BLOCKED', () => {
    const record = reviewRecord();
    const audit: AuditEvent = {
      audit_id: 'aud_1',
      timestamp: new Date().toISOString(),
      request_id: 'req_review_1',
      correlation_id: 'cor_1',
      policy_decision: 'BLOCK',
      response_decision: 'BLOCK',
      reason_codes: ['POLICY_BLOCKED'],
    };
    const item = toEvaluationListItem(record, audit);
    expect(item.decision).toBe('REVIEW');
    expect(item.review_state).toBe('pending');
    expect(item.requires_review).toBe(true);
    expect(item.expected_action).toBe('HOLD');
    expect(item.enforcement.status).toBe('REVIEW_REQUIRED');
    expect(item.enforcement.safety_fallback).toBe(true);
    expect(item.enforcement.status).not.toBe('BLOCKED');
  });

  it('B — AUTHORIZE → final ALLOW with expected ALLOW', () => {
    const record = reviewRecord();
    const resolution = buildHumanResolution(record, {
      disposition: 'AUTHORIZE',
      reason: 'Approved based on documented relationship.',
      resolved_by: 'approver',
    });
    const updated = { ...record, human_resolution: resolution };
    expect(updated.decision).toBe('REVIEW');
    expect(resolution.final_decision).toBe('ALLOW');
    const item = toEvaluationListItem(updated, {
      audit_id: 'aud_res',
      timestamp: resolution.resolved_at,
      request_id: 'req_review_1',
      correlation_id: 'cor_res',
      operation: 'evaluation_resolve',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      metadata: { resolution: true, evaluation_id: record.evaluation_id },
    });
    expect(item.final_decision).toBe('ALLOW');
    expect(item.expected_action).toBe('ALLOW');
    expect(item.review_state).toBe('resolved');
    expect(item.requires_review).toBe(false);
    // AUTHORIZE alone is not verified Gateway ALLOWED.
    expect(item.enforcement.status).toBe('UNKNOWN');
    expect(item.enforcement.verified).toBe(false);
  });

  it('C — DENY disposition → final DENY / BLOCK expected', () => {
    const record = reviewRecord();
    const resolution = buildHumanResolution(record, {
      disposition: 'DENY',
      reason: 'Authorization could not be established.',
      resolved_by: 'approver',
    });
    const updated = { ...record, human_resolution: resolution };
    expect(updated.decision).toBe('REVIEW');
    expect(resolution.final_decision).toBe('DENY');
    const item = toEvaluationListItem(updated, {
      audit_id: 'aud_res',
      timestamp: resolution.resolved_at,
      request_id: 'req_review_1',
      correlation_id: 'cor_res',
      operation: 'evaluation_resolve',
      policy_decision: 'BLOCK',
      response_decision: 'BLOCK',
      metadata: { resolution: true, evaluation_id: record.evaluation_id },
    });
    expect(item.expected_action).toBe('BLOCK');
    expect(item.enforcement.status).toBe('BLOCKED');
  });

  it('D/E — unresolved conflict eligible; authorize/deny preserve provenance', () => {
    const record = reviewRecord({
      decision: 'REVIEW',
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'conflict',
        resolution: {
          category: 'UNRESOLVED',
          basis: 'UNRESOLVED_NO_PRECEDENCE',
          contributing_pack_ids: ['pack_a', 'pack_b'],
          detail: 'A ALLOW vs B DENY',
          contributions: [],
        },
        provenance: {
          matched_rules: [
            {
              rule_id: 'PACKA-R-1',
              obligation_ids: [],
              citations: ['cite-a'],
              source_ids: ['src-a'],
              authority_tier: 1,
            },
            {
              rule_id: 'PACKB-R-1',
              obligation_ids: [],
              citations: ['cite-b'],
              source_ids: ['src-b'],
              authority_tier: 1,
            },
          ],
        },
      },
    });
    const auth = buildHumanResolution(record, {
      disposition: 'AUTHORIZE',
      reason: 'Operator selected allow path for this conflict.',
      resolved_by: 'approver',
    });
    expect(auth.final_decision).toBe('ALLOW');
    const denied = buildHumanResolution(record, {
      disposition: 'DENY',
      reason: 'Operator selected deny path for this conflict.',
      resolved_by: 'approver',
    });
    expect(denied.final_decision).toBe('DENY');
    const after = { ...record, human_resolution: auth };
    expect(after.decision).toBe('REVIEW');
    expect(after.explanation.provenance?.matched_rules?.length).toBe(2);
  });

  it('F — reason required', () => {
    const record = reviewRecord();
    expect(() =>
      buildHumanResolution(record, {
        disposition: 'AUTHORIZE',
        reason: '   ',
        resolved_by: 'approver',
      }),
    ).toThrow(/reason/i);
  });

  it('G — actor recorded', () => {
    const record = reviewRecord();
    const resolution = buildHumanResolution(record, {
      disposition: 'AUTHORIZE',
      reason: 'ok',
      resolved_by: 'operator_jane',
    });
    expect(resolution.resolved_by).toBe('operator_jane');
    expect(resolution.resolved_at).toBeTruthy();
  });

  it('H — original machine decision preserved in repository', () => {
    const repo = new InMemoryPolicyRepository();
    const record = reviewRecord();
    repo.recordEvaluation(record);
    const resolution = buildHumanResolution(record, {
      disposition: 'DENY',
      reason: 'Denied after review.',
      resolved_by: 'approver',
    });
    const saved = repo.saveHumanResolution(record.evaluation_id, resolution)!;
    expect(saved.decision).toBe('REVIEW');
    expect(saved.human_resolution?.final_decision).toBe('DENY');
    expect(repo.getEvaluation(record.evaluation_id)?.decision).toBe('REVIEW');
  });

  it('I — provenance intact after resolution', () => {
    const record = reviewRecord();
    const rulesBefore = record.explanation.provenance?.matched_rules ?? [];
    const resolution = buildHumanResolution(record, {
      disposition: 'AUTHORIZE',
      reason: 'ok',
      resolved_by: 'approver',
    });
    const after = { ...record, human_resolution: resolution };
    expect(after.explanation.provenance?.matched_rules).toEqual(rulesBefore);
  });

  it('J — request_id correlation retained for enforcement after resolve', () => {
    const record = reviewRecord({ request_id: 'req_shared' });
    const resolution = buildHumanResolution(record, {
      disposition: 'AUTHORIZE',
      reason: 'ok',
      resolved_by: 'approver',
    });
    const updated = { ...record, human_resolution: resolution };
    const enforcement = projectEnforcementResult(updated, {
      audit_id: 'aud_j',
      timestamp: new Date().toISOString(),
      request_id: 'req_shared',
      correlation_id: 'cor_j',
      operation: 'evaluation_resolve',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      metadata: { resolution: true, evaluation_id: record.evaluation_id },
    });
    expect(enforcement.request_id).toBe('req_shared');
    expect(enforcement.status).toBe('UNKNOWN');
    expect(enforcement.verified).toBe(false);
    expect(enforcement.summary).toMatch(/not yet resumed|not verified|disposition only/i);
  });

  it('admin resolve API: authorize + deny + reason validation + auth', async () => {
    const repo2 = new InMemoryPolicyRepository();
    const seeded = reviewRecord({ evaluation_id: 'eval_api_review' });
    repo2.recordEvaluation(seeded);
    const gw2 = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
      policyRepository: repo2,
    });
    const server2 = await gw2.buildServer();
    const auth = { authorization: 'Bearer test_admin' };

    const noReason = await server2.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_api_review/resolve',
      headers: auth,
      payload: { disposition: 'AUTHORIZE', reason: '' },
    });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().reason_code).toBe('REASON_REQUIRED');

    const unauthorized = await server2.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_api_review/resolve',
      headers: { authorization: 'Bearer wrong' },
      payload: { disposition: 'AUTHORIZE', reason: 'ok', actor: 'alice' },
    });
    expect(unauthorized.statusCode).toBe(401);

    const ok = await server2.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_api_review/resolve',
      headers: auth,
      payload: {
        disposition: 'AUTHORIZE',
        reason: 'Approved after review.',
        actor: 'alice',
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().original_decision).toBe('REVIEW');
    expect(ok.json().final_decision).toBe('ALLOW');
    expect(ok.json().human_resolution.resolved_by).toBe('alice');
    expect(ok.json().human_resolution.resolution_reason).toBe('Approved after review.');

    const detail = await server2.inject({
      method: 'GET',
      url: '/v1/admin/evaluations/eval_api_review',
      headers: auth,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().evaluation.decision).toBe('REVIEW');
    expect(detail.json().review.final_decision).toBe('ALLOW');
    expect(detail.json().review.review_state).toBe('resolved');
    expect(detail.json().enforcement.status).toBe('UNKNOWN');
    expect(detail.json().enforcement.verified).toBe(false);

    const again = await server2.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_api_review/resolve',
      headers: auth,
      payload: { disposition: 'DENY', reason: 'second' },
    });
    expect(again.statusCode).toBe(409);

    const denyRepo = new InMemoryPolicyRepository();
    denyRepo.recordEvaluation(reviewRecord({ evaluation_id: 'eval_api_deny' }));
    const gw3 = createPhase1Gateway({
      config: { adminApiKey: 'test_admin' },
      policyRepository: denyRepo,
    });
    const server3 = await gw3.buildServer();
    const deny = await server3.inject({
      method: 'POST',
      url: '/v1/admin/evaluations/eval_api_deny/resolve',
      headers: auth,
      payload: {
        disposition: 'DENY',
        reason: 'Authorization could not be established.',
        actor: 'bob',
      },
    });
    expect(deny.statusCode).toBe(200);
    expect(deny.json().final_decision).toBe('DENY');
    expect(deny.json().enforcement.status).toBe('BLOCKED');

    await server2.close();
    await server3.close();
  });
});
