'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Eye } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { proxyJson } from '@/lib/client-api';
import { formatFieldLabel } from '@/lib/field-label';

type EvaluationRow = {
  evaluation_id: string;
  created_at: string;
  decision: string;
  final_decision?: string;
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

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'review', label: 'Requires review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'allowed', label: 'Allowed' },
  { id: 'denied', label: 'Denied' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'controls', label: 'Controls applied' },
];

function DecisionsListView() {
  const [filter, setFilter] = useState<FilterId>('all');
  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const countLabel = useMemo(
    () => `${rows.length} decision${rows.length === 1 ? '' : 's'}`,
    [rows.length],
  );

  return (
    <div>
      <PageHeader
        title="Decisions"
        lede="The source of truth for what Enigma decided and why."
        actions={<span className="muted">{countLabel}</span>}
      />

      {error ? <div className="error">{error}</div> : null}

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
        <table aria-busy={pending || undefined}>
          <thead>
            <tr>
              <th>Request</th>
              <th>Machine</th>
              <th>Final</th>
              <th>Review</th>
              <th>Expected action</th>
              <th>Enforcement</th>
              <th>Time</th>
              <th className="table-col-narrow">
                <span className="sr-only">View</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.evaluation_id}>
                <td className="mono">{e.request_id ?? '—'}</td>
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
                    <StatusBadge variant="badge" status="review" label="Pending" />
                  ) : e.review_state === 'resolved' ? (
                    <StatusBadge
                      variant="badge"
                      status="approved"
                      label="Resolved"
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {formatFieldLabel(e.expected_action ?? e.action_summary)}
                </td>
                <td>
                  <StatusBadge
                    variant="badge"
                    status={
                      e.enforcement?.status ?? e.enforcement_result ?? 'UNKNOWN'
                    }
                  />
                </td>
                <td className="mono">{e.created_at}</td>
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
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export default function DecisionsPage() {
  return <DecisionsListView />;
}
