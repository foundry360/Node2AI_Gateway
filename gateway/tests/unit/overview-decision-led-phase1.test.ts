/**
 * Product 1.0 Workstream 3 — Overview decision-led aggregates.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import { toEvaluationListItem } from '../../src/policy/enterprise/evaluation-query.js';
import {
  buildOverviewDecisionSummary,
  overviewOutcomeLabelFromStoreStatus,
} from '../../src/policy/enterprise/overview-summary.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';

const APP = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };
const ADMIN = { authorization: 'Bearer test_admin' };

function baseRecord(
  overrides: Partial<PolicyEvaluationRecord> = {},
): PolicyEvaluationRecord {
  return {
    evaluation_id: 'eval_overview_1',
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
      final_reason: 'Baseline allow',
      provenance: { matched_rules: [{ rule_id: 'baseline.write.allow' }] },
      resolution: {
        category: 'ALLOW',
        basis: 'Baseline allow',
        contributing_pack_ids: ['pack_baseline'],
      },
    },
    ...overrides,
  } as PolicyEvaluationRecord;
}

describe('Overview decision summary helpers', () => {
  it('counts activity and surfaces outcome-not-reported for client-commit ALLOW', () => {
    const allow = toEvaluationListItem(baseRecord());
    const deny = toEvaluationListItem(
      baseRecord({
        evaluation_id: 'eval_deny',
        decision: 'DENY',
      }),
    );
    const review = toEvaluationListItem(
      baseRecord({
        evaluation_id: 'eval_review',
        decision: 'REVIEW',
      }),
    );

    const summary = buildOverviewDecisionSummary({
      items: [allow, deny, review],
      days: 30,
    });

    expect(summary.source).toBe('policy_evaluations');
    expect(summary.activity.total).toBe(3);
    expect(summary.activity.allowed).toBe(1);
    expect(summary.activity.denied).toBe(1);
    expect(summary.activity.review).toBe(1);
    expect(summary.activity.outcome_not_reported).toBe(1);
    expect(summary.attention.pending_review.count).toBe(1);
    expect(summary.attention.pending_review.label).toMatch(/approver/i);
    expect(summary.attention.pending_review.description).toMatch(
      /end user is not the approver/i,
    );
    expect(summary.attention.outcome_not_reported.count).toBe(1);
    expect(summary.attention.outcome_not_reported.description).toMatch(
      /did not execute/i,
    );
    expect(summary.recent[0]?.actor_label).toBeTruthy();
    expect(summary.recent[0]?.action_label).toBeTruthy();
    expect(summary.recent[0]?.enforcement_boundary_label).toBeTruthy();
  });

  it('does not invent enforcement exceptions without safety_fallback', () => {
    const allow = toEvaluationListItem(baseRecord());
    const summary = buildOverviewDecisionSummary({ items: [allow], days: 30 });
    expect(summary.activity.enforcement_exceptions).toBe(0);
    expect(summary.attention.enforcement_exceptions.count).toBe(0);
  });

  it('refines outcome labels from store status without treating not-reported as failure', () => {
    expect(overviewOutcomeLabelFromStoreStatus('EXECUTED')).toBe('Completed');
    expect(overviewOutcomeLabelFromStoreStatus(null)).toBeUndefined();
    const allow = toEvaluationListItem(baseRecord());
    const summary = buildOverviewDecisionSummary({
      items: [allow],
      days: 30,
      outcomeByEvaluationId: new Map([[allow.evaluation_id, 'Completed']]),
    });
    expect(summary.activity.outcome_not_reported).toBe(0);
    expect(summary.recent[0]?.outcome_status).toBe('Completed');
  });

  it('marks data unavailable without fabricating zero activity', () => {
    const summary = buildOverviewDecisionSummary({
      items: [toEvaluationListItem(baseRecord())],
      days: 30,
      available: false,
    });
    expect(summary.available).toBe(false);
    expect(summary.activity.total).toBe(0);
    expect(summary.recent).toEqual([]);
  });
});

describe('Overview API decision payload', () => {
  it('returns decision activity from policy_evaluations and rejects unauthorized access', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();

    const denied = await server.inject({
      method: 'GET',
      url: '/v1/admin/overview',
    });
    expect(denied.statusCode).toBe(401);

    const action = await server.inject({
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
          target_id: 'patient_overview',
          attributes: { field: 'phone', value: '555-0144' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(action.statusCode).toBe(200);
    const evaluationId = (action.json() as { evaluation_id: string }).evaluation_id;

    const overview = await server.inject({
      method: 'GET',
      url: '/v1/admin/overview?days=30',
      headers: ADMIN,
    });
    expect(overview.statusCode).toBe(200);
    const body = overview.json() as {
      decisions?: {
        source?: string;
        activity?: {
          total: number;
          allowed: number;
          outcome_not_reported: number;
        };
        attention?: {
          pending_review?: { label?: string; description?: string };
          outcome_not_reported?: { description?: string; items?: Array<{ evaluation_id: string }> };
        };
        recent?: Array<{
          evaluation_id: string;
          actor_label?: string;
          action_label?: string;
          enforcement_boundary_label?: string;
          outcome_status?: string;
        }>;
      } | null;
      decisions_error?: string | null;
      coverage?: {
        policies: number;
        applications: number;
        models: number;
      };
    };

    expect(body.decisions_error).toBeNull();
    expect(body.decisions?.source).toBe('policy_evaluations');
    expect(body.decisions?.activity?.total).toBeGreaterThanOrEqual(1);
    expect(body.decisions?.activity?.allowed).toBeGreaterThanOrEqual(1);
    expect(body.decisions?.activity?.outcome_not_reported).toBeGreaterThanOrEqual(1);
    expect(body.decisions?.attention?.pending_review?.label).toMatch(/approver/i);
    expect(
      body.decisions?.attention?.outcome_not_reported?.description?.toLowerCase(),
    ).toMatch(/did not execute/);
    const recent = body.decisions?.recent ?? [];
    expect(recent.some((r) => r.evaluation_id === evaluationId)).toBe(true);
    const row = recent.find((r) => r.evaluation_id === evaluationId);
    expect(row?.actor_label).toBeTruthy();
    expect(row?.action_label).toBeTruthy();
    expect(row?.enforcement_boundary_label?.toLowerCase()).toMatch(/client commit/);
    expect(row?.outcome_status?.toLowerCase()).toMatch(/not reported/);
    expect(JSON.stringify(body).toLowerCase()).not.toContain('555-0144');
    expect(body.coverage?.applications).toBeGreaterThanOrEqual(0);
    expect(body.coverage?.policies).toBeGreaterThanOrEqual(0);

    await server.close();
  });

  it('does not expose prompt payloads on overview', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();
    const secretMarker = 'PHI_SECRET_MARKER_OVERVIEW_9f3a';
    await server.inject({
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
            content: `Agent write: update.\n${secretMarker}\nField: phone\nValue: x`,
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
          target_id: 'patient_secret',
          attributes: { field: 'phone', value: 'x' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });

    const overview = await server.inject({
      method: 'GET',
      url: '/v1/admin/overview',
      headers: ADMIN,
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.body).not.toContain(secretMarker);
    await server.close();
  });
});
