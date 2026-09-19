/**
 * Console sparklines follow the timeframe filter (Last 7 / 30 / 60 / 90 days).
 * Without `days` the endpoints keep the legacy rolling 24-hour hourly window.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  buildRollingActivitySeries,
  resolveActivityWindow,
} from '../../src/api/admin-routes.js';

const APP = { authorization: `Bearer ${PHASE1_DEMO_API_KEY}` };
const ADMIN = { authorization: 'Bearer test_admin' };

type ActivityBody = {
  window_hours: number;
  window_granularity: 'hour' | 'day';
  series: {
    requests: { total: number; buckets: { start: string; label: string }[] };
    allowed: { buckets: unknown[] };
    blocked: { buckets: unknown[] };
    tokenize: { buckets: unknown[] };
  };
};

describe('resolveActivityWindow', () => {
  it('defaults to the rolling 24-hour hourly window', () => {
    expect(resolveActivityWindow(undefined)).toEqual({
      granularity: 'hour',
      buckets: 24,
    });
    expect(resolveActivityWindow({})).toEqual({
      granularity: 'hour',
      buckets: 24,
    });
  });

  it('maps each timeframe option to daily buckets', () => {
    for (const days of [7, 30, 60, 90]) {
      expect(resolveActivityWindow({ days: String(days) })).toEqual({
        granularity: 'day',
        buckets: days,
      });
    }
  });

  it('clamps beyond 90 days and falls back on junk input', () => {
    expect(resolveActivityWindow({ days: '365' })).toEqual({
      granularity: 'day',
      buckets: 90,
    });
    for (const days of ['0', '-5', 'abc', '']) {
      expect(resolveActivityWindow({ days })).toEqual({
        granularity: 'hour',
        buckets: 24,
      });
    }
  });
});

describe('activity series counts requests, not audit rows', () => {
  const now = Date.now();
  const at = (minutesAgo: number) =>
    new Date(now - minutesAgo * 60_000).toISOString();
  const totals = (events: Parameters<typeof buildRollingActivitySeries>[0]) => {
    const s = buildRollingActivitySeries(events, now, {
      granularity: 'hour',
      buckets: 24,
    });
    return {
      requests: s.requests.total,
      allowed: s.allowed.total,
      blocked: s.blocked.total,
      tokenize: s.tokenize.total,
    };
  };

  it('counts one prompt as one request', () => {
    expect(
      totals([
        {
          timestamp: at(10),
          request_id: 'req_a',
          policy_decision: 'ALLOW',
          response_decision: 'RELEASE',
        },
      ]),
    ).toEqual({ requests: 1, allowed: 1, blocked: 0, tokenize: 0 });
  });

  it('collapses a held write that resumes after authorization', () => {
    // One agent write: blocked for review, approved, resumed, outcome reported.
    const events = [
      {
        timestamp: at(30),
        request_id: 'req_b',
        policy_decision: 'BLOCK',
        response_decision: 'BLOCK',
      },
      {
        timestamp: at(20),
        request_id: 'req_b',
        policy_decision: 'ALLOW',
        response_decision: 'RELEASE',
        reason_codes: ['HUMAN_AUTHORIZE', 'EVALUATION_RESOLVED'],
      },
      {
        timestamp: at(15),
        request_id: 'req_b',
        policy_decision: 'ALLOW',
        response_decision: 'RELEASE',
      },
      {
        timestamp: at(14),
        request_id: 'req_b',
        policy_decision: 'REVIEW',
        response_decision: 'RELEASE',
        reason_codes: ['CLIENT_OUTCOME_RECEIPT', 'CLIENT_OUTCOME_EXECUTED'],
      },
    ];
    // Four audit rows, one request, finally allowed.
    expect(totals(events)).toEqual({
      requests: 1,
      allowed: 1,
      blocked: 0,
      tokenize: 0,
    });
  });

  it('excludes administrative audit rows', () => {
    expect(
      totals([
        {
          timestamp: at(10),
          request_id: 'req_c',
          policy_decision: 'ALLOW',
          response_decision: 'RELEASE',
        },
        {
          timestamp: at(9),
          request_id: 'req_admin_1',
          policy_decision: 'N/A',
          reason_codes: ['ADMIN_AUDIT', 'TOOL_GRANT_UPSERTED'],
        },
        {
          timestamp: at(8),
          request_id: 'req_admin_2',
          policy_decision: 'ALLOW',
          response_decision: 'RELEASE',
          reason_codes: ['POLICY_APPROVED'],
        },
      ]),
    ).toEqual({ requests: 1, allowed: 1, blocked: 0, tokenize: 0 });
  });

  it('keeps a request blocked when its final outcome is a block', () => {
    expect(
      totals([
        {
          timestamp: at(30),
          request_id: 'req_d',
          policy_decision: 'TOKENIZE',
          response_decision: 'RELEASE',
        },
        {
          timestamp: at(25),
          request_id: 'req_d',
          policy_decision: 'BLOCK',
          response_decision: 'BLOCK',
        },
      ]),
    ).toEqual({ requests: 1, allowed: 0, blocked: 1, tokenize: 1 });
  });

  it('partitions requests into allowed and blocked', () => {
    const t = totals([
      { timestamp: at(30), request_id: 'r1', policy_decision: 'ALLOW' },
      { timestamp: at(29), request_id: 'r2', policy_decision: 'BLOCK' },
      { timestamp: at(28), request_id: 'r3', policy_decision: 'TOKENIZE' },
      { timestamp: at(27), request_id: 'r4', policy_decision: 'N/A' },
    ]);
    expect(t.allowed + t.blocked).toBe(t.requests);
    expect(t).toEqual({ requests: 4, allowed: 3, blocked: 1, tokenize: 1 });
  });

  it('buckets a held request on its first attempt, not its resume', () => {
    const series = buildRollingActivitySeries(
      [
        { timestamp: at(90), request_id: 'req_e', policy_decision: 'BLOCK' },
        { timestamp: at(5), request_id: 'req_e', policy_decision: 'ALLOW' },
      ],
      now,
      { granularity: 'hour', buckets: 24 },
    );
    const filled = series.requests.buckets.filter((b) => b.value > 0);
    expect(filled).toHaveLength(1);
    expect(Date.parse(filled[0]!.start)).toBeLessThanOrEqual(now - 60 * 60_000);
  });
});

describe('GET /v1/admin/activity', () => {
  it('returns one bucket per day for the selected timeframe', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();

    await server.inject({
      method: 'POST',
      url: '/v1/ai/actions',
      headers: APP,
      payload: {
        application_id: 'app_clinical',
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        prompt: 'Update the care plan note.',
      },
    });

    const res = await server.inject({
      method: 'GET',
      url: '/v1/admin/activity?days=30',
      headers: ADMIN,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ActivityBody;

    expect(body.window_granularity).toBe('day');
    expect(body.window_hours).toBe(30 * 24);
    for (const key of ['requests', 'allowed', 'blocked', 'tokenize'] as const) {
      expect(body.series[key].buckets).toHaveLength(30);
    }

    // Consecutive calendar days, ending today, regardless of DST transitions.
    const starts = body.series.requests.buckets.map((b) => new Date(b.start));
    for (const start of starts) {
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
    }
    for (let i = 1; i < starts.length; i += 1) {
      const deltaDays =
        (starts[i]!.getTime() - starts[i - 1]!.getTime()) / 86_400_000;
      expect(deltaDays).toBeGreaterThanOrEqual(0.9);
      expect(deltaDays).toBeLessThanOrEqual(1.1);
    }
    const last = starts[starts.length - 1]!;
    expect(last.toDateString()).toBe(new Date().toDateString());

    // The request just made lands in today's bucket.
    expect(body.series.requests.total).toBeGreaterThanOrEqual(1);

    await server.close();
  });

  it('keeps hourly buckets when no timeframe is supplied', async () => {
    const gw = createPhase1Gateway({ config: { adminApiKey: 'test_admin' } });
    const server = await gw.buildServer();

    const res = await server.inject({
      method: 'GET',
      url: '/v1/admin/activity',
      headers: ADMIN,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ActivityBody;

    expect(body.window_granularity).toBe('hour');
    expect(body.window_hours).toBe(24);
    expect(body.series.requests.buckets).toHaveLength(24);

    await server.close();
  });
});
