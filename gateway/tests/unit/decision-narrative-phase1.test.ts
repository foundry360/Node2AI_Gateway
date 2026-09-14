/**
 * Product 1.0 Workstream 2 — Decision narrative cohesion.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { buildDecisionNarrative } from '../../src/policy/enterprise/decision-narrative.js';
import { deriveEnforcementIntegrity } from '../../src/policy/enterprise/enforcement-integrity.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';
import { toEvaluationListItem } from '../../src/policy/enterprise/evaluation-query.js';

const APP = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };
const ADMIN = { authorization: 'Bearer test_admin' };

function baseRecord(
  overrides: Partial<PolicyEvaluationRecord> = {},
): PolicyEvaluationRecord {
  return {
    evaluation_id: 'eval_story_1',
    decision: 'ALLOW',
    phase: 'input',
    created_at: new Date().toISOString(),
    subject: {
      user_id: 'user_clinician',
      application_id: 'app_clinical',
    },
    resource: { type: 'document', classification: 'PHI' },
    action: 'WRITE',
    context: { purpose: 'treatment', authorization: 'authorized' },
    ai_context: {
      agent_id: 'agent_platform_a',
      tool_id: 'update_patient_field',
      runtime_actor: {
        agent: {
          id: 'agent_platform_a',
          name: 'Platform A',
          authorized: true,
        },
        tool: {
          id: 'update_patient_field',
          name: 'Update Patient Field',
          authorized: true,
          operation: 'field_update',
        },
      },
      action_governance: {
        category: 'UPDATE',
        operation: 'write',
        kind: 'field_update',
        target_id: 'patient_x',
        attributes: { field: 'phone' },
        write_governance_class: 'ADMINISTRATIVE_LOW_RISK',
        enforcement_boundary: 'client_commit_required',
        client_commit: true,
      },
    },
    reason_codes: [],
    applicable_policies: [{ policy_id: 'pol_baseline', version: 1 }],
    explanation: {
      matched_conditions: [],
      rejected_conditions: [],
      final_reason: 'Baseline allow for administrative field update',
      provenance: { matched_rules: [{ rule_id: 'baseline.write.allow' }] },
      resolution: {
        category: 'ALLOW',
        basis: 'Baseline allow for administrative field update',
        contributing_pack_ids: ['pack_baseline'],
      },
    },
    ...overrides,
  } as PolicyEvaluationRecord;
}

describe('Decision narrative helpers', () => {
  it('builds ALLOW client-commit narrative without implying Enigma DML', () => {
    const record = baseRecord();
    const ei = deriveEnforcementIntegrity({ record });
    const n = buildDecisionNarrative({
      record,
      enforcementIntegrity: ei,
      outcomeIntegrityStatus: 'NOT_REPORTED',
    });
    expect(n.headline).toMatch(/Agent Platform A/i);
    expect(n.headline).toMatch(/field_update|field update/i);
    expect(n.headline.toLowerCase()).toMatch(/allowed/);
    expect(n.reason.toLowerCase()).toMatch(/client commit/);
    expect(n.reason.toLowerCase()).not.toMatch(/enigma executed/);
    expect(n.status.enforcement).toMatch(/Client commit/i);
    expect(n.status.outcome).toBe('Not reported');
    expect(n.actors.agent_id).toBe('agent_platform_a');
    expect(n.action.field).toBe('phone');
    expect(n.policy.pack_ids).toContain('pack_baseline');
  });

  it('builds DENY narrative from unauthorized agent reason', () => {
    const record = baseRecord({
      decision: 'DENY',
      reason_codes: ['AGENT_UNAUTHORIZED'],
      ai_context: {
        ...(baseRecord().ai_context as object),
        runtime_actor: {
          agent: {
            id: 'agent_x',
            name: 'Agent X',
            authorized: false,
          },
          tool: null,
          substrate: { reason_codes: ['AGENT_UNAUTHORIZED'] },
        },
      },
    } as Partial<PolicyEvaluationRecord>);
    const n = buildDecisionNarrative({ record });
    expect(n.headline.toLowerCase()).toMatch(/denied/);
    expect(n.reason.toLowerCase()).toMatch(/agent/);
    expect(n.status.decision).toBe('DENY');
  });

  it('builds REVIEW narrative distinguishing end user from approver', () => {
    const record = baseRecord({
      decision: 'REVIEW',
      held_request: {
        version: 1,
        application_id: 'app_clinical',
        organization_id: 'org',
        user_id: 'user_clinician',
        operation: 'write',
        model: 'local-general-v1',
        messages: [],
        classification: {
          sensitivity: 'PHI',
          confidence: 1,
          intent: 'write',
          risk: 'high',
          reason_codes: [],
        },
        allowed_models: [],
        available_models: [],
        governance_context: { client_commit: true },
      },
    } as Partial<PolicyEvaluationRecord>);
    const n = buildDecisionNarrative({
      record,
      enforcementIntegrity: deriveEnforcementIntegrity({
        record,
        reviewState: 'pending',
      }),
    });
    expect(n.status.review).toBe('Pending');
    expect(n.reason.toLowerCase()).toMatch(/review/);
    expect(n.reason.toLowerCase()).toMatch(/end user is not the approver/);
  });

  it('list projection includes narrative fields from snapshot', () => {
    const item = toEvaluationListItem(baseRecord());
    expect(item.narrative_headline).toBeTruthy();
    expect(item.actor_label).toMatch(/Platform A|agent_platform_a/);
    expect(item.action_label).toMatch(/field_update/);
    expect(item.enforcement_boundary_label).toMatch(/Client commit/i);
  });
});

describe('Decision narrative API', () => {
  it('evaluation detail returns decision_narrative for ALLOW actions', async () => {
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
              'Agent write: update patient field.\nPatient: Demo\nMRN: MRN-1\nDOB: 1980-01-01\nField: phone\nValue: 555-0144',
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
          target_id: 'patient_story',
          attributes: { field: 'phone', value: '555-0144' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(res.statusCode).toBe(200);
    const evaluationId = (res.json() as { evaluation_id: string }).evaluation_id;
    const detail = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: ADMIN,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as {
      decision_narrative?: {
        headline?: string;
        reason?: string;
        status?: { enforcement?: string; outcome?: string };
      };
      enforcement_integrity?: { boundary?: string };
    };
    expect(body.decision_narrative?.headline).toBeTruthy();
    expect(body.decision_narrative?.reason?.toLowerCase()).toMatch(/client commit/);
    expect(body.decision_narrative?.status?.outcome).toMatch(/Not reported/i);
    expect(body.enforcement_integrity?.boundary).toBe('CLIENT_COMMIT_REQUIRED');
    await server.close();
  });

  it('historical narrative survives agent suspend', async () => {
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
              'Agent write: update patient field.\nPatient: Demo\nMRN: MRN-1\nDOB: 1980-01-01\nField: email\nValue: a@b.com',
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
          target_id: 'patient_hist',
          attributes: { field: 'email', value: 'a@b.com' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(res.statusCode).toBe(200);
    const evaluationId = (res.json() as { evaluation_id: string }).evaluation_id;
    const before = await server.inject({
      method: 'GET',
      url: `/v1/admin/evaluations/${evaluationId}`,
      headers: ADMIN,
    });
    const headline = (before.json() as { decision_narrative?: { headline?: string } })
      .decision_narrative?.headline;
    expect(headline).toBeTruthy();

    const list = await server.inject({
      method: 'GET',
      url: '/v1/admin/evaluations?limit=20',
      headers: ADMIN,
    });
    const rows = (list.json() as { evaluations?: Array<{ evaluation_id: string; narrative_headline?: string }> })
      .evaluations ?? [];
    const row = rows.find((r) => r.evaluation_id === evaluationId);
    expect(row?.narrative_headline).toBeTruthy();
    await server.close();
  });
});
