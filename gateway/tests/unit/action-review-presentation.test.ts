import { describe, expect, it } from 'vitest';
import { buildActionReviewPresentation } from '../../src/policy/enterprise/action-review-presentation.js';
import type { ChangeReviewPreview } from '../../src/policy/enterprise/change-governance/evaluate.js';

function lifecycleChange(
  overrides: Partial<ChangeReviewPreview> = {},
): ChangeReviewPreview {
  return {
    change_id: 'chg_test',
    request_id: 'req_test',
    target_type: 'application',
    target_id: 'app_payments',
    materiality: 'CRITICAL',
    lifecycle_decision: 'MANDATORY_REVIEW',
    change_types: ['WRITE_CAPABILITY', 'TOOL_ADDED'],
    governance_impacts: ['EXTERNAL_ACTION', 'ACCESS_CONTROL'],
    materiality_reasons: ['LIFECYCLE_WRITE_CAPABILITY_INTRODUCED'],
    items: [
      {
        action: 'updated',
        kind: 'capability',
        id: 'capability:write_capability',
        label: 'Write capability',
        before: 'false',
        after: 'true',
      },
      {
        action: 'added',
        kind: 'tool',
        id: 'tool:submit_payment',
        label: 'Tool submit_payment',
        after: 'id=submit_payment, write=true',
      },
    ],
    ...overrides,
  };
}

describe('buildActionReviewPresentation', () => {
  it('lifecycle write enable → short plain-English headline', () => {
    const review = buildActionReviewPresentation({
      operation: 'lifecycle_change',
      application_id: 'app_payments',
      organization_id: 'org_demo',
      user_id: 'user_ops',
      correlation_id: 'corr_1',
      messages: [],
      retained: true,
      machine_decision: 'REVIEW',
      change_review: lifecycleChange(),
    });

    expect(review.kind).toBe('lifecycle_change');
    // Without a retained user ask, do not invent capability text as Prompt.
    expect(review.prompt).toBeUndefined();
    expect(review.headline).toBe(
      'AI system is gaining the ability to update records.',
    );
    expect(review.headline).not.toMatch(
      /WRITE_CAPABILITY|EXTERNAL_ACTION|TOOL_ADDED|Update Clinical|Submit Payment/i,
    );
    expect(review.why_reviewing).toBe(
      'The AI system is gaining the ability to modify records.',
    );
    expect(review.why_reviewing).not.toMatch(/EXTERNAL_ACTION|critical governance/i);
    // Capability/tool inventory stays out of primary changes.
    expect(review.changes).toEqual([]);
    expect(review.decision.status).toBe('REVIEW REQUIRED');
    expect(review.technical.some((t) => t.label === 'Change ID')).toBe(true);
  });

  it('Prompt is the user business ask, not write justification', () => {
    const review = buildActionReviewPresentation({
      operation: 'lifecycle_change',
      application_id: 'app_payments',
      organization_id: 'org_demo',
      user_id: 'user_ops',
      correlation_id: 'corr_prompt',
      messages: [],
      machine_decision: 'REVIEW',
      change_review: lifecycleChange({
        evidence: {
          title: 'Enable write',
          summary: '…',
          requester_prompt: 'Add a follow-up note to the patient chart.',
          rationale: 'Write capability is required to fulfill the user request.',
          if_authorized: '…',
          if_denied: '…',
        },
      }),
    });
    expect(review.prompt).toBe('Add a follow-up note to the patient chart.');
    expect(review.prompt).not.toMatch(/write capability|justif/i);
  });

  it('rejects enable-write stand-ins as Prompt', () => {
    const review = buildActionReviewPresentation({
      operation: 'lifecycle_change',
      application_id: 'app_payments',
      organization_id: 'org_demo',
      user_id: 'user_ops',
      correlation_id: 'corr_fake',
      messages: [
        {
          role: 'user',
          content:
            'Enable write capability so clinical notes can be updated after human authorization.',
        },
      ],
      machine_decision: 'REVIEW',
      change_review: lifecycleChange({
        evidence: {
          title: 'Enable write',
          summary: '…',
          requester_prompt:
            'Enable write capability so this AI system can create or update records.',
          if_authorized: '…',
          if_denied: '…',
        },
      }),
    });
    expect(review.prompt).toBeUndefined();
  });

  it('extracts requester prompt embedded in system brief when needed', () => {
    const review = buildActionReviewPresentation({
      application_id: 'app_generic',
      organization_id: 'org_demo',
      user_id: 'user_1',
      correlation_id: 'corr_embed',
      machine_decision: 'REVIEW',
      messages: [
        {
          role: 'system',
          content: [
            'Enable write',
            '',
            'Summary here.',
            '',
            'Requester prompt:',
            'Update the account status for Acme from Prospect to Active.',
            '',
            'If Authorize is chosen, …',
          ].join('\n'),
        },
      ],
      change_review: lifecycleChange({
        evidence: {
          title: 'Enable write',
          summary: '…',
          if_authorized: '…',
          if_denied: '…',
        },
      }),
    });
    expect(review.prompt).toBe(
      'Update the account status for Acme from Prospect to Active.',
    );
  });

  it('lifecycle autonomy change does not invent clinical/CRM language', () => {
    const review = buildActionReviewPresentation({
      application_id: 'app_generic',
      organization_id: 'org_demo',
      user_id: 'user_1',
      correlation_id: 'corr_2',
      messages: [],
      machine_decision: 'REVIEW',
      change_review: lifecycleChange({
        target_id: 'sys_warehouse_bot',
        change_types: ['AUTONOMY_ESCALATION'],
        governance_impacts: ['AUTONOMY'],
        items: [
          {
            action: 'updated',
            kind: 'capability',
            id: 'capability:autonomy_level',
            label: 'Autonomy level',
            before: 'ASSISTIVE',
            after: 'SUPERVISED',
          },
        ],
      }),
    });

    expect(review.headline).toMatch(/autonomy/i);
    expect(review.prompt).toBeUndefined();
    expect(review.headline.toLowerCase()).not.toMatch(
      /patient|clinical|salesforce|crm/,
    );
    expect(review.changes[0]?.before).toBe('ASSISTIVE');
    expect(review.changes[0]?.after).toBe('SUPERVISED');
  });

  it('runtime summarize hold → short action summary', () => {
    const review = buildActionReviewPresentation({
      operation: 'summarize',
      application_id: 'app_docs',
      organization_id: 'org_demo',
      user_id: 'user_1',
      correlation_id: 'corr_3',
      retained: true,
      machine_decision: 'REVIEW',
      messages: [
        { role: 'user', content: 'Summarize the attached quarterly report.' },
        { role: 'assistant', content: 'Proposed summary of Q3 results.' },
      ],
      classification: { risk: 'high', reason_codes: ['HIGH_RISK_HOLD'] },
    });

    expect(review.kind).toBe('runtime');
    expect(review.headline).toMatch(/summarize/i);
    expect(review.why_reviewing).toBe(
      'This AI action needs human authorization before it can proceed.',
    );
  });

  it('email-style operation uses generic send language', () => {
    const review = buildActionReviewPresentation({
      operation: 'email',
      application_id: 'app_notify',
      organization_id: 'org_demo',
      user_id: 'user_1',
      correlation_id: 'corr_4',
      messages: [],
      machine_decision: 'REVIEW',
    });
    expect(review.headline).toMatch(/send a message/i);
  });

  it('authorized disposition surfaces AUTHORIZED status', () => {
    const review = buildActionReviewPresentation({
      operation: 'write',
      application_id: 'app_x',
      organization_id: 'org_demo',
      user_id: 'user_1',
      correlation_id: 'corr_5',
      messages: [],
      machine_decision: 'REVIEW',
      human_disposition: 'AUTHORIZE',
      final_decision: 'ALLOW',
    });
    expect(review.decision.status).toBe('AUTHORIZED');
  });
});
