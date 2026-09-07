'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Eye } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { proxyJson } from '@/lib/client-api';
import { formatFieldLabel } from '@/lib/field-label';
import { formatDisplayDateTime } from '@/lib/display-datetime';

type EvaluationRow = {
  evaluation_id: string;
  created_at: string;
  decision: string;
  final_decision?: string;
  phase?: string;
  request_id?: string;
  resolution_category?: string;
  contributing_pack_ids: string[];
  policy_ids: string[];
  reason?: string;
  action_summary: string;
  expected_action?: string;
  enforcement_result: string;
  enforcement?: { status: string; verified: boolean; safety_fallback?: boolean };
  requires_review: boolean;
  controls_applied: boolean;
  review_state?: string;
  status: string;
};

type FilterId =
  | 'all'
  | 'review'
  | 'resolved'
  | 'allowed'
  | 'denied'
  | 'conflicts'
  | 'controls';

type GroupedDecision = {
  requestKey: string;
  rows: EvaluationRow[];
};

const PAGE_SIZE = 25;

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'review', label: 'Requires review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'allowed', label: 'Allowed' },
  { id: 'denied', label: 'Denied' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'controls', label: 'Controls applied' },
];

function phaseLabel(phase: string | undefined): string {
  const p = (phase ?? '').toLowerCase();
  if (p === 'input') return 'Input';
  if (p === 'output') return 'Output';
  if (p === 'simulate') return 'Simulate';
  return formatFieldLabel(phase) || 'Decision';
}

function groupByRequest(rows: EvaluationRow[]): GroupedDecision[] {
  const order: string[] = [];
  const map = new Map<string, EvaluationRow[]>();

  for (const row of rows) {
    const key = row.request_id?.trim() || `eval:${row.evaluation_id}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(row);
  }

  return order.map((requestKey) => {
    const groupRows = [...(map.get(requestKey) ?? [])].sort((a, b) => {
      const ta = Date.parse(a.created_at) || 0;
      const tb = Date.parse(b.created_at) || 0;
      if (ta !== tb) return ta - tb;
      const pa = (a.phase ?? '').toLowerCase();
      const pb = (b.phase ?? '').toLowerCase();
      if (pa === 'input' && pb !== 'input') return -1;
      if (pb === 'input' && pa !== 'input') return 1;
      return a.evaluation_id.localeCompare(b.evaluation_id);
    });
    return { requestKey, rows: groupRows };
  });
}

function DecisionsListView() {
  const [filter, setFilter] = useState<FilterId>('all');
  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        setError(null);
        const res = (await proxyJson(
          `evaluations?limit=100&filter=${filter}`,
          'GET',
        )) as { evaluations?: EvaluationRow[] };
        if (!cancelled) setRows(res.evaluations ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load decisions');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  const groups = useMemo(() => groupByRequest(rows), [rows]);

  const visibleGroups = useMemo(() => {
    const out: GroupedDecision[] = [];
    let used = 0;
    for (const group of groups) {
      if (used >= visibleCount) break;
      out.push(group);
      used += group.rows.length;
    }
    return out;
  }, [groups, visibleCount]);

  const visibleRowCount = useMemo(
    () => visibleGroups.reduce((n, g) => n + g.rows.length, 0),
    [visibleGroups],
  );
  const hasMore = visibleRowCount < rows.length;

  const countLabel = useMemo(() => {
    const decisionCount = rows.length;
    const requestCount = groups.filter((g) => !g.requestKey.startsWith('eval:')).length;
    const decisionWord = decisionCount === 1 ? 'decision' : 'decisions';
    if (requestCount > 0 && requestCount !== decisionCount) {
      return `${decisionCount} ${decisionWord} · ${requestCount} request${requestCount === 1 ? '' : 's'}`;
    }
    return `${decisionCount} ${decisionWord}`;
  }, [rows.length, groups]);

  return (
    <div>
      <PageHeader
        title="Decisions"
        lede="The source of truth for what Enigma decided and why."
      />

      {error ? <div className="error">{error}</div> : null}

      <div className="console-tabs-bar">
        <div className="tabs" role="tablist" aria-label="Decision filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`tab${filter === f.id ? ' tab-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="muted decisions-count">{countLabel}</span>
      </div>

      {rows.length === 0 && !error ? (
        <EmptyState
          title={
            filter === 'all'
              ? 'No decisions yet'
              : 'No decisions match this filter'
          }
          description="Enigma creates a decision for each request sent through the Gateway."
        />
      ) : rows.length > 0 ? (
        <>
          <table aria-busy={pending || undefined}>
            <thead>
              <tr>
                <th>Request</th>
                <th>Phase</th>
                <th>Machine</th>
                <th>Final</th>
                <th>Review</th>
                <th>Expected action</th>
                <th>Enforcement</th>
                <th>Date</th>
                <th className="table-col-narrow">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((group) => {
                const linked = group.rows.length > 1;
                const displayRequest = group.requestKey.startsWith('eval:')
                  ? '-'
                  : group.requestKey;

                return group.rows.map((e, index) => {
                  const position =
                    !linked
                      ? 'solo'
                      : index === 0
                        ? 'start'
                        : index === group.rows.length - 1
                          ? 'end'
                          : 'mid';

                  return (
                    <tr
                      key={e.evaluation_id}
                      className={
                        linked
                          ? `decision-group-row decision-group-${position}`
                          : undefined
                      }
                    >
                      <td>
                        {index === 0 ? (
                          <div className="decision-request-cell">
                            <div className="mono">{displayRequest}</div>
                            {linked ? (
                              <div className="muted decision-request-meta">
                                {group.rows.length} linked phases
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div
                            className="decision-request-continuation"
                            aria-label={`Same request as ${displayRequest}`}
                          >
                            <span className="decision-request-rail" aria-hidden />
                            <span className="muted">Same request</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="decision-phase">{phaseLabel(e.phase)}</span>
                      </td>
                      <td>
                        <StatusBadge variant="badge" status={e.decision} />
                      </td>
                      <td>
                        <StatusBadge
                          variant="badge"
                          status={e.final_decision ?? e.decision}
                        />
                      </td>
                      <td>
                        {e.review_state === 'pending' ? (
                          <StatusBadge
                            variant="badge"
                            status="review"
                            label="Pending"
                          />
                        ) : e.review_state === 'resolved' ? (
                          <StatusBadge
                            variant="badge"
                            status="approved"
                            label="Resolved"
                          />
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <span className="decision-expected">
                          {formatFieldLabel(e.expected_action ?? e.action_summary)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge
                          variant="badge"
                          status={
                            e.enforcement?.status ??
                            e.enforcement_result ??
                            'UNKNOWN'
                          }
                        />
                      </td>
                      <td className="mono">{formatDisplayDateTime(e.created_at)}</td>
                      <td className="table-col-narrow">
                        <Link
                          href={`/evaluations/${e.evaluation_id}`}
                          className="table-icon-link"
                          aria-label={`View decision ${e.evaluation_id}`}
                          title="View decision"
                        >
                          <Eye size={18} strokeWidth={1.75} aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
          {hasMore ? (
            <div className="table-load-more">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Load More
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function DecisionsPage() {
  return <DecisionsListView />;
}
