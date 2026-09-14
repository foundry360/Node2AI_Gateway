/**
 * Product 1.0 Workstream 3 — Overview decision activity aggregates.
 *
 * Read-only projection over existing Evaluation list items.
 * Does not create a second Decision store or governance authority.
 */

import type { PolicyEvaluationListItem } from './evaluation-query.js';

export type OverviewDecisionRow = {
  evaluation_id: string;
  created_at: string;
  decision: string;
  final_decision?: string;
  actor_label?: string;
  action_label?: string;
  enforcement_boundary_label?: string;
  outcome_status?: string;
  narrative_headline?: string;
  review_state?: string;
  enforcement_exception?: boolean;
};

export type OverviewAttentionBucket = {
  count: number;
  href: string;
  label: string;
  description: string;
  items: OverviewDecisionRow[];
};

export type OverviewDecisionSummary = {
  source: 'policy_evaluations';
  window_days: number;
  available: boolean;
  activity: {
    total: number;
    allowed: number;
    review: number;
    denied: number;
    outcome_not_reported: number;
    enforcement_exceptions: number;
  };
  attention: {
    pending_review: OverviewAttentionBucket;
    outcome_not_reported: OverviewAttentionBucket;
    enforcement_exceptions: OverviewAttentionBucket;
    denied: OverviewAttentionBucket;
  };
  recent: OverviewDecisionRow[];
};

function isAllowedDecision(decision: string): boolean {
  const d = decision.toUpperCase();
  return (
    d === 'ALLOW' ||
    d === 'ALLOW_WITH_CONTROLS' ||
    d === 'TOKENIZE' ||
    d === 'REDACT' ||
    d === 'TRANSFORM' ||
    d === 'MASK'
  );
}

function isDeniedDecision(decision: string): boolean {
  const d = decision.toUpperCase();
  return d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT';
}

function effectiveDecision(item: {
  decision: string;
  final_decision?: string;
}): string {
  return String(item.final_decision ?? item.decision ?? '').toUpperCase();
}

function withinDays(iso: string, days: number, nowMs: number): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= nowMs - days * 86_400_000;
}

function toRow(
  item: PolicyEvaluationListItem,
  outcomeOverride?: string,
): OverviewDecisionRow {
  return {
    evaluation_id: item.evaluation_id,
    created_at: item.created_at,
    decision: item.decision,
    final_decision: item.final_decision,
    actor_label: item.actor_label,
    action_label: item.action_label,
    enforcement_boundary_label: item.enforcement_boundary_label,
    outcome_status: outcomeOverride ?? item.outcome_status,
    narrative_headline: item.narrative_headline,
    review_state: item.review_state,
    enforcement_exception: Boolean(item.enforcement?.safety_fallback),
  };
}

function isOutcomeNotReported(row: OverviewDecisionRow): boolean {
  const o = String(row.outcome_status ?? '').toLowerCase();
  return o === 'not reported' || o === 'not_reported';
}

/**
 * Build Overview decision activity from already-projected list items.
 * `outcomeByEvaluationId` may refine list-item outcome labels after store lookup.
 */
export function buildOverviewDecisionSummary(input: {
  items: PolicyEvaluationListItem[];
  days: number;
  nowMs?: number;
  outcomeByEvaluationId?: Map<string, string>;
  available?: boolean;
}): OverviewDecisionSummary {
  const nowMs = input.nowMs ?? Date.now();
  const available = input.available !== false;
  const windowItems = available
    ? input.items.filter((i) => withinDays(i.created_at, input.days, nowMs))
    : [];

  const rows = windowItems.map((item) => {
    const override = input.outcomeByEvaluationId?.get(item.evaluation_id);
    return toRow(item, override);
  });

  const pendingReview = rows.filter(
    (r) => r.review_state === 'pending' || String(r.decision).toUpperCase() === 'REVIEW',
  );
  const denied = rows.filter((r) => isDeniedDecision(effectiveDecision(r)));
  const outcomeNotReported = rows.filter((r) => {
    const d = effectiveDecision(r);
    return isAllowedDecision(d) && isOutcomeNotReported(r);
  });
  const enforcementExceptions = rows.filter((r) => r.enforcement_exception);

  const allowed = rows.filter((r) => {
    if (r.review_state === 'pending') return false;
    return isAllowedDecision(effectiveDecision(r));
  });
  const review = rows.filter(
    (r) =>
      r.review_state === 'pending' ||
      String(r.decision).toUpperCase() === 'REVIEW' ||
      String(r.decision).toUpperCase() === 'REQUIRE_APPROVAL',
  );

  const sample = (list: OverviewDecisionRow[], n = 5) => list.slice(0, n);
  const recent = [...rows]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 12);

  return {
    source: 'policy_evaluations',
    window_days: input.days,
    available,
    activity: {
      total: rows.length,
      allowed: allowed.length,
      review: review.length,
      denied: denied.length,
      outcome_not_reported: outcomeNotReported.length,
      enforcement_exceptions: enforcementExceptions.length,
    },
    attention: {
      pending_review: {
        count: pendingReview.length,
        href: '/decisions',
        label: 'Awaiting approver review',
        description:
          'Decisions held for a governance approver. The requesting end user is not the approver.',
        items: sample(pendingReview),
      },
      outcome_not_reported: {
        count: outcomeNotReported.length,
        href: '/decisions',
        label: 'Outcome not reported',
        description:
          'ALLOW decisions where client commit was authorized but no outcome receipt has been reported yet. Enigma did not execute the external side effect.',
        items: sample(outcomeNotReported),
      },
      enforcement_exceptions: {
        count: enforcementExceptions.length,
        href: '/decisions',
        label: 'Enforcement exceptions',
        description:
          'Decisions with authoritative safety-fallback enforcement signals.',
        items: sample(enforcementExceptions),
      },
      denied: {
        count: denied.length,
        href: '/decisions',
        label: 'Denied decisions',
        description:
          'DENY activity recorded for investigation. A DENY is a governance decision, not automatically an operational incident.',
        items: sample(denied),
      },
    },
    recent,
  };
}

/** Map raw outcome store status to Overview/Decision Story outcome labels. */
export function overviewOutcomeLabelFromStoreStatus(
  status: string | null | undefined,
): string | undefined {
  if (!status) return undefined;
  const raw = String(status).toUpperCase();
  if (raw === 'EXECUTED') return 'Completed';
  if (raw === 'EXECUTION_FAILED' || raw === 'EXECUTION_TIMEOUT') return 'Failed';
  if (raw === 'EXECUTION_UNKNOWN') return 'Reported';
  if (raw === 'NOT_REPORTED') return 'Not reported';
  return 'Reported';
}
