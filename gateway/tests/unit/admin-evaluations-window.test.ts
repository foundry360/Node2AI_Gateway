/**
 * Recent decisions and the governance attention counts follow the console
 * timeframe filter (Last 7 / 30 / 60 / 90 days).
 */
import { describe, expect, it } from 'vitest';
import { createPhase1Gateway } from '../../src/api/app-factory.js';
import { InMemoryPolicyRepository } from '../../src/policy/enterprise/repository.js';
import type { PolicyEvaluationRecord } from '../../src/policy/enterprise/evaluation-record.js';

const ADMIN = { authorization: 'Bearer test_admin' };
const DAY_MS = 24 * 60 * 60 * 1000;

function evaluationAgedDays(
  id: string,
  ageDays: number,
  decision = 'ALLOW',
): PolicyEvaluationRecord {
  return {
    evaluation_id: id,
    decision,
    phase: 'input',
    created_at: new Date(Date.now() - ageDays * DAY_MS).toISOString(),
    subject: { user_id: 'user_clinician', application_id: 'app_clinical' },
    resource: { type: 'document', classification: 'PHI' },
    action: 'WRITE',
    context: { purpose: 'treatment', authorization: 'authorized' },
    ai_context: {},
    evidence_in: {},
    reason: 'seeded for timeframe test',
    applicable_policies: [],
    obligations: [],
    explanation: {},
  } as unknown as PolicyEvaluationRecord;
}

/** Ages chosen to straddle every timeframe boundary. */
function seededRepository() {
  const repo = new InMemoryPolicyRepository();
  repo.recordEvaluation(evaluationAgedDays('eval_1d', 1, 'DENY'));
  repo.recordEvaluation(evaluationAgedDays('eval_5d', 5, 'ALLOW'));
  repo.recordEvaluation(evaluationAgedDays('eval_20d', 20, 'DENY'));
  repo.recordEvaluation(evaluationAgedDays('eval_45d', 45, 'ALLOW'));
  repo.recordEvaluation(evaluationAgedDays('eval_120d', 120, 'DENY'));
  return repo;
}

type EvaluationsBody = {
  window_days: number;
  truncated: boolean;
  evaluations: { evaluation_id: string }[];
  attention: { denied: number };
};

async function fetchWindow(days: number | null) {
  const gw = createPhase1Gateway({
    config: { adminApiKey: 'test_admin' },
    policyRepository: seededRepository(),
  });
  const server = await gw.buildServer();
  const url =
    days === null
      ? '/v1/admin/evaluations?limit=25&filter=all'
      : `/v1/admin/evaluations?limit=25&filter=all&days=${days}`;
  const res = await server.inject({ method: 'GET', url, headers: ADMIN });
  expect(res.statusCode).toBe(200);
  const body = res.json() as EvaluationsBody;
  await server.close();
  return body;
}

describe('InMemoryPolicyRepository.listEvaluations since', () => {
  it('excludes evaluations older than the window', () => {
    const repo = seededRepository();
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const ids = repo.listEvaluations({ since, limit: 100 }).map((r) => r.evaluation_id);
    expect(ids).toEqual(['eval_1d', 'eval_5d', 'eval_20d']);
  });

  it('returns everything when no window is given', () => {
    const repo = seededRepository();
    expect(repo.listEvaluations({ limit: 100 })).toHaveLength(5);
  });
});

describe('GET /v1/admin/evaluations', () => {
  it('narrows rows and attention counts to the selected timeframe', async () => {
    const week = await fetchWindow(7);
    expect(week.window_days).toBe(7);
    expect(week.evaluations.map((e) => e.evaluation_id)).toEqual([
      'eval_1d',
      'eval_5d',
    ]);
    expect(week.attention.denied).toBe(1);

    const month = await fetchWindow(30);
    expect(month.window_days).toBe(30);
    expect(month.evaluations.map((e) => e.evaluation_id)).toEqual([
      'eval_1d',
      'eval_5d',
      'eval_20d',
    ]);
    expect(month.attention.denied).toBe(2);

    const quarter = await fetchWindow(90);
    expect(quarter.window_days).toBe(90);
    expect(quarter.evaluations).toHaveLength(4);
    expect(quarter.attention.denied).toBe(2);
    // The 120-day-old record stays out of every allowed timeframe.
    expect(
      quarter.evaluations.some((e) => e.evaluation_id === 'eval_120d'),
    ).toBe(false);
  });

  it('defaults to 30 days when the timeframe is absent', async () => {
    const body = await fetchWindow(null);
    expect(body.window_days).toBe(30);
    expect(body.evaluations).toHaveLength(3);
  });

  it('does not report truncation for a small window', async () => {
    expect((await fetchWindow(90)).truncated).toBe(false);
  });
});
