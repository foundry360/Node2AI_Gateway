import { describe, expect, it } from 'vitest';
import { deriveDecisionConsequence } from '../../src/policy/enterprise/evaluation-query.js';
import { projectEnforcementResult } from '../../src/policy/enterprise/enforcement-projection.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';
import type { AuditEvent } from '../../src/audit/service.js';

function baseRecord(
  overrides: Partial<PolicyEvaluationRecord>,
): PolicyEvaluationRecord {
  return {
    evaluation_id: 'eval_test',
    phase: 'input',
    subject: {},
    resource: {},
    context: {},
    ai_context: {},
    evidence_in: {},
    decision: 'DENY',
    applicable_policies: [],
    obligations: [],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: 'test',
    },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function baseAudit(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    audit_id: 'aud_test',
    timestamp: new Date().toISOString(),
    request_id: 'req_test',
    correlation_id: 'cor_test',
    ...overrides,
  };
}

describe('deriveDecisionConsequence (expected action only)', () => {
  it('maps DENY to expected BLOCK without claiming verified block', () => {
    const c = deriveDecisionConsequence('DENY');
    expect(c.expected_action).toBe('BLOCK');
    expect(c.action_summary).toMatch(/Block/i);
    expect(c.enforcement_result).toMatch(/expected/i);
    expect(c.requires_review).toBe(false);
  });

  it('maps REVIEW to HOLD (expected) — not a claimed BLOCK', () => {
    const c = deriveDecisionConsequence('REVIEW');
    expect(c.expected_action).toBe('HOLD');
    expect(c.requires_review).toBe(true);
    expect(c.enforcement_result).toMatch(/HOLD/i);
  });

  it('maps ALLOW with tokenization obligation to APPLY_CONTROLS', () => {
    const c = deriveDecisionConsequence('ALLOW', null, [{ code: 'TOKENIZE_PII' }]);
    expect(c.expected_action).toBe('APPLY_CONTROLS');
    expect(c.controls_applied).toBe(true);
  });

  it('maps plain ALLOW to ALLOW', () => {
    const c = deriveDecisionConsequence('ALLOW');
    expect(c.expected_action).toBe('ALLOW');
    expect(c.controls_applied).toBe(false);
  });
});

describe('projectEnforcementResult scenarios', () => {
  it('A — verified DENY → BLOCKED', () => {
    const record = baseRecord({
      decision: 'DENY',
      request_id: 'req_test',
    });
    const audit = baseAudit({
      policy_decision: 'BLOCK',
      response_decision: 'BLOCK',
      reason_codes: ['POLICY_BLOCKED'],
    });
    const e = projectEnforcementResult(record, audit);
    expect(e.expected_action).toBe('BLOCK');
    expect(e.status).toBe('BLOCKED');
    expect(e.verified).toBe(true);
  });

  it('B — verified ALLOW → ALLOWED', () => {
    const record = baseRecord({
      decision: 'ALLOW',
      request_id: 'req_test',
    });
    const audit = baseAudit({
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      input_transformation: 'none',
      response_transformation: 'none',
    });
    const e = projectEnforcementResult(record, audit);
    expect(e.expected_action).toBe('ALLOW');
    expect(e.status).toBe('ALLOWED');
    expect(e.verified).toBe(true);
  });

  it('C — verified controls → CONTROLS_APPLIED', () => {
    const record = baseRecord({
      decision: 'TOKENIZE',
      request_id: 'req_test',
      obligations: [{ code: 'TOKENIZE_PII' }],
    });
    const audit = baseAudit({
      policy_decision: 'TOKENIZE',
      response_decision: 'RELEASE',
      input_transformation: 'tokenize',
      response_transformation: 'none',
    });
    const e = projectEnforcementResult(record, audit);
    expect(e.expected_action).toBe('APPLY_CONTROLS');
    expect(e.status).toBe('CONTROLS_APPLIED');
    expect(e.verified).toBe(true);
  });

  it('LOCAL_MODEL_ONLY + RELEASE without transform → ALLOWED (not FAILED)', () => {
    const record = baseRecord({
      decision: 'ALLOW',
      request_id: 'req_test',
      obligations: [
        { code: 'LOG_GOVERNANCE_EVENT' },
        { code: 'LOCAL_MODEL_ONLY' },
      ],
    });
    const audit = baseAudit({
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      input_transformation: 'none',
      response_transformation: 'none',
      model_selected: 'local-general-v1',
    });
    const e = projectEnforcementResult(record, audit);
    expect(e.expected_action).toBe('ALLOW');
    expect(e.status).toBe('ALLOWED');
    expect(e.verified).toBe(true);
    expect(e.status).not.toBe('FAILED');
  });

  it('TOKENIZE expected but RELEASE without transform → FAILED', () => {
    const record = baseRecord({
      decision: 'ALLOW',
      request_id: 'req_test',
      obligations: [{ code: 'TOKENIZE_PII' }],
    });
    const audit = baseAudit({
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      input_transformation: 'none',
      response_transformation: 'none',
      model_selected: 'local-general-v1',
    });
    const e = projectEnforcementResult(record, audit);
    expect(e.expected_action).toBe('APPLY_CONTROLS');
    expect(e.status).toBe('FAILED');
  });

  it('D — no Gateway acknowledgment → UNKNOWN (not BLOCKED)', () => {
    const record = baseRecord({ decision: 'DENY' });
    const e = projectEnforcementResult(record, null);
    expect(e.expected_action).toBe('BLOCK');
    expect(e.status).toBe('UNKNOWN');
    expect(e.verified).toBe(false);
    expect(e.status).not.toBe('BLOCKED');
  });

  it('E — enforcement failure → FAILED', () => {
    const record = baseRecord({
      decision: 'DENY',
      request_id: 'req_test',
    });
    const audit = baseAudit({
      policy_decision: 'BLOCK',
      response_decision: 'BLOCK',
      input_transformation: 'failed',
      reason_codes: ['TRANSFORM_FAILURE'],
      errors: { transform: 'failed' },
    });
    const e = projectEnforcementResult(record, audit);
    expect(e.status).toBe('FAILED');
    expect(e.verified).toBe(true);
  });

  it('F — REVIEW → REVIEW_REQUIRED when Gateway held (not BLOCKED)', () => {
    const record = baseRecord({
      decision: 'REVIEW',
      request_id: 'req_test',
    });
    const audit = baseAudit({
      policy_decision: 'BLOCK',
      response_decision: 'BLOCK',
      reason_codes: ['REVIEW_REQUIRED'],
    });
    const e = projectEnforcementResult(record, audit);
    expect(e.expected_action).toBe('HOLD');
    expect(e.status).toBe('REVIEW_REQUIRED');
    expect(e.safety_fallback).toBe(true);
    expect(e.status).not.toBe('BLOCKED');
  });

  it('simulate phase → NOT_EXECUTED', () => {
    const record = baseRecord({ decision: 'DENY', phase: 'simulate' });
    const e = projectEnforcementResult(record, null);
    expect(e.status).toBe('NOT_EXECUTED');
    expect(e.verified).toBe(false);
  });
});
