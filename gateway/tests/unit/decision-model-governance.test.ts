/**
 * Decision evidence projection — historical model eligibility vs execution.
 * Does not recalculate from Models registry or current packs.
 */
import { describe, expect, it } from 'vitest';
import {
  projectModelGovernance,
  projectRequestContext,
  toEvaluationRecord,
  type PolicyEvaluationRecord,
} from '../../src/policy/enterprise/index.js';
import type { AuditEvent } from '../../src/audit/service.js';
import type { PolicyDecision } from '../../src/policy/enterprise/types.js';

function baseDecision(
  overrides: Partial<PolicyDecision> & { decision: PolicyDecision['decision'] },
): PolicyDecision {
  return {
    decision: overrides.decision,
    reason: overrides.reason ?? overrides.decision,
    reason_codes: overrides.reason_codes ?? [],
    applicable_policies: overrides.applicable_policies ?? [],
    obligations: overrides.obligations ?? [],
    transformations: [],
    restrictions: overrides.restrictions ?? {},
    approval_requirements: [],
    conflicts: [],
    explanation: overrides.explanation ?? {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: overrides.decision,
    },
    evidence: {
      classification: 'Internal',
      confidence: 1,
      risk: 'low',
      reason_codes: [],
    },
    evaluation_id: overrides.evaluation_id ?? 'eval_test',
  };
}

function audit(partial: Partial<AuditEvent> & { request_id: string }): AuditEvent {
  return {
    audit_id: partial.audit_id ?? 'aud_1',
    timestamp: partial.timestamp ?? new Date().toISOString(),
    request_id: partial.request_id,
    correlation_id: partial.correlation_id ?? 'corr',
    organization_id: 'org_demo',
    application_id: 'app_clinical',
    user_id: 'user_clinician',
    operation: 'summarize',
    data_classification: 'Internal',
    policy_decision: partial.policy_decision ?? 'ALLOW',
    response_decision: partial.response_decision ?? 'RELEASE',
    model_selected: partial.model_selected,
    provider: partial.provider,
    input_transformation: 'none',
    response_transformation: 'none',
    reason_codes: [],
    latency_ms: 1,
    event_hash: 'h',
    prev_event_hash: null,
    ...partial,
  } as AuditEvent;
}

describe('projectModelGovernance — Decision evidence', () => {
  it('ALLOW with eligible models + matching execution', () => {
    const decision = baseDecision({
      decision: 'ALLOW',
      evaluation_id: 'eval_allow',
      restrictions: { eligible_models: ['local-general-v1', 'local-special-v1'] },
    });
    const record = toEvaluationRecord(decision, {
      request_id: 'req_allow',
      phase: 'input',
      ai_context: { requested_model: 'local-general-v1' },
    });
    const gov = projectModelGovernance(
      record,
      audit({
        request_id: 'req_allow',
        model_selected: 'local-general-v1',
        provider: 'local-runtime',
      }),
    );
    expect(gov.eligibility).toBe('authorized');
    expect(gov.eligible_models).toEqual(['local-general-v1', 'local-special-v1']);
    expect(gov.requested_model).toBe('local-general-v1');
    expect(gov.selected_model).toBe('local-general-v1');
    expect(gov.provider).toBe('local-runtime');
    expect(gov.authorization_match).toBe('matched');
  });

  it('DENY with explicit eligible_models=[] shows none_authorized', () => {
    const record = toEvaluationRecord(
      baseDecision({
        decision: 'DENY',
        evaluation_id: 'eval_deny',
        restrictions: { eligible_models: [] },
      }),
      { request_id: 'req_deny', phase: 'input' },
    );
    const gov = projectModelGovernance(record, audit({
      request_id: 'req_deny',
      policy_decision: 'BLOCK',
      response_decision: 'BLOCK',
    }));
    expect(gov.eligibility).toBe('none_authorized');
    expect(gov.eligible_models).toEqual([]);
    expect(gov.selected_model).toBeUndefined();
    expect(gov.authorization_match).toBe('matched');
  });

  it('REVIEW with explicit [] preserves historical restriction', () => {
    const record = toEvaluationRecord(
      baseDecision({
        decision: 'REVIEW',
        evaluation_id: 'eval_review',
        restrictions: { eligible_models: [] },
      }),
      { request_id: 'req_review', phase: 'input' },
    );
    const gov = projectModelGovernance(record, null);
    expect(gov.eligibility).toBe('none_authorized');
    expect(gov.eligible_models).toEqual([]);
  });

  it('legacy evaluation without restrictions → not_recorded (not invented [])', () => {
    const record: PolicyEvaluationRecord = {
      evaluation_id: 'eval_legacy',
      request_id: 'req_legacy',
      phase: 'input',
      subject: {},
      resource: {},
      context: {},
      ai_context: { requested_model: 'local-general-v1' },
      evidence_in: {},
      decision: 'ALLOW',
      applicable_policies: [],
      obligations: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'ALLOW',
      },
      created_at: new Date().toISOString(),
    };
    const gov = projectModelGovernance(record, null);
    expect(gov.eligibility).toBe('not_recorded');
    expect(gov.eligible_models).toBeNull();
    expect(gov.authorization_match).toBe('unknown');
  });

  it('requested outside eligible → mismatch when selected outside set', () => {
    const record = toEvaluationRecord(
      baseDecision({
        decision: 'ALLOW',
        evaluation_id: 'eval_out',
        restrictions: { eligible_models: ['local-general-v1'] },
      }),
      {
        request_id: 'req_out',
        phase: 'input',
        ai_context: { requested_model: 'cloud-public-gpt' },
      },
    );
    const gov = projectModelGovernance(
      record,
      audit({
        request_id: 'req_out',
        model_selected: 'cloud-public-gpt',
        provider: 'external-openai-compatible',
      }),
    );
    expect(gov.requested_model).toBe('cloud-public-gpt');
    expect(gov.eligible_models).toEqual(['local-general-v1']);
    expect(gov.selected_model).toBe('cloud-public-gpt');
    expect(gov.authorization_match).toBe('mismatch');
  });

  it('does not use current registry — only persisted eligible set', () => {
    const record = toEvaluationRecord(
      baseDecision({
        decision: 'ALLOW',
        evaluation_id: 'eval_hist',
        restrictions: { eligible_models: ['local-historical-only'] },
      }),
      {
        request_id: 'req_hist',
        phase: 'input',
        ai_context: {
          requested_model: 'local-historical-only',
          available_models: ['local-general-v1', 'cloud-public-gpt'],
        },
      },
    );
    const currentRegistry = ['local-general-v1', 'cloud-public-gpt', 'brand-new-model'];
    const gov = projectModelGovernance(
      record,
      audit({
        request_id: 'req_hist',
        model_selected: 'local-historical-only',
        provider: 'local-runtime',
      }),
    );
    expect(gov.eligible_models).toEqual(['local-historical-only']);
    expect(gov.eligible_models).not.toEqual(currentRegistry);
    expect(currentRegistry).not.toContain('local-historical-only');
  });

  it('compatibility evidence_in.restrictions restores when column absent', () => {
    const record: PolicyEvaluationRecord = {
      evaluation_id: 'eval_compat',
      request_id: 'req_compat',
      phase: 'input',
      subject: {},
      resource: {},
      context: {},
      ai_context: { requested_model: 'local-general-v1' },
      evidence_in: {
        restrictions: { eligible_models: ['local-general-v1'] },
      },
      decision: 'ALLOW',
      applicable_policies: [],
      obligations: [],
      explanation: {
        matched_conditions: [],
        rejected_conditions: [],
        final_reason: 'ALLOW',
      },
      created_at: new Date().toISOString(),
    };
    const gov = projectModelGovernance(record, null);
    expect(gov.eligibility).toBe('authorized');
    expect(gov.eligible_models).toEqual(['local-general-v1']);
  });

  it('cross-domain style decision uses single final eligible set', () => {
    const record = toEvaluationRecord(
      baseDecision({
        decision: 'DENY',
        evaluation_id: 'eval_xd',
        reason_codes: ['CONSEQUENCE_DENY'],
        restrictions: { eligible_models: [] },
        explanation: {
          matched_conditions: [],
          rejected_conditions: [],
          final_reason: 'DENY',
          resolution: {
            category: 'RESTRICTIVE',
            basis: 'CONSEQUENCE_DENY',
            contributing_pack_ids: ['pack_hipaa', 'pack_cms'],
            detail: 'HIPAA DENY + CMS ALLOW → DENY',
            contributions: [],
          },
        },
      }),
      { request_id: 'req_xd', phase: 'input' },
    );
    const gov = projectModelGovernance(record, null);
    expect(gov.eligibility).toBe('none_authorized');
    expect(gov.eligible_models).toEqual([]);
  });
});

describe('projectRequestContext — actor chain', () => {
  it('exposes subject, application, agent, tool, requested model when present', () => {
    const record = toEvaluationRecord(
      baseDecision({
        decision: 'ALLOW',
        evaluation_id: 'eval_actor',
        restrictions: { eligible_models: ['local-general-v1'] },
      }),
      {
        request_id: 'req_actor',
        phase: 'input',
        subject: {
          user_id: 'user_clinician',
          application_id: 'app_clinical',
          organization_id: 'org_demo',
          agent_id: 'care-agent',
        } as never,
        ai_context: {
          requested_model: 'local-general-v1',
          agent_id: 'care-agent',
          tool_id: 'note-tool',
        },
        context: {
          purpose: 'treatment',
          authorization: 'authorized',
        },
      },
    );
    const ctx = projectRequestContext(record);
    expect(ctx.user_id).toBe('user_clinician');
    expect(ctx.application_id).toBe('app_clinical');
    expect(ctx.agent_id).toBe('care-agent');
    expect(ctx.tool_id).toBe('note-tool');
    expect(ctx.model).toBe('local-general-v1');
    expect(ctx.purpose).toBe('treatment');
    expect(ctx.authorization).toBe('authorized');
  });

  it('omits missing agent/tool rather than inventing', () => {
    const record = toEvaluationRecord(
      baseDecision({
        decision: 'ALLOW',
        evaluation_id: 'eval_no_agent',
        restrictions: { eligible_models: ['local-general-v1'] },
      }),
      {
        request_id: 'req_no_agent',
        phase: 'input',
        subject: {
          user_id: 'user_clinician',
          application_id: 'app_clinical',
          organization_id: 'org_demo',
        } as never,
        ai_context: { requested_model: 'local-general-v1' },
      },
    );
    const ctx = projectRequestContext(record);
    expect(ctx.agent_id).toBeUndefined();
    expect(ctx.tool_id).toBeUndefined();
  });
});
