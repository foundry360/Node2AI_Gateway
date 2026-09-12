'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { useConsoleTimeframe } from '@/components/ConsoleTabs';
import { proxyJson } from '@/lib/client-api';
import { formatFieldLabel } from '@/lib/field-label';
import { formatDisplayDateTime } from '@/lib/display-datetime';

type EvaluationRow = {
  evaluation_id: string;
  created_at: string;
  decision: string;
  request_id?: string;
  resolution_category?: string;
  contributing_pack_ids: string[];
  action_summary: string;
  expected_action?: string;
  enforcement_result: string;
  enforcement?: { status: string; verified: boolean };
  review_state?: string;
  requires_review: boolean;
  controls_applied: boolean;
};

type EvaluationsResponse = {
  source?: string;
  evaluations: EvaluationRow[];
  attention?: {
    review: number;
    pending_review?: number;
    resolved?: number;
    denied: number;
    conflicts: number;
    controls_applied: number;
  };
};

export function GovernanceAttentionPanel({
  leadLeft,
  afterBanner,
  midRow,
  beforeRecent,
  showAttentionCard = true,
}: {
  /** Optional left column (e.g. overview microcards) paired with the top-right slot. */
  leadLeft?: ReactNode;
  /** Optional top-right content (e.g. spark charts). When set, attention moves below. */
  afterBanner?: ReactNode;
  /** Optional siblings rendered with the attention card in one row (e.g. risk + compliance). */
  midRow?: ReactNode;
  /** Optional content rendered above Recent decisions (always shown when provided). */
  beforeRecent?: ReactNode;
  /** When false, hide the "What requires governance attention?" card (code retained). */
  showAttentionCard?: boolean;
} = {}) {
  const days = useConsoleTimeframe();
  const [data, setData] = useState<EvaluationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        setError(null);
        const res = (await proxyJson(
          `evaluations?limit=25&filter=all`,
          'GET',
        )) as EvaluationsResponse;
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load decisions');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (error) {
    return (
      <div className="stack">
        {leadLeft ? (
          <div className="console-banner">
            <div className="console-banner-top">
              {leadLeft}
              {afterBanner ?? <div className="error">{error}</div>}
            </div>
            {midRow ? (
              <div className="console-banner-mid">
                {midRow}
                <div className="error">{error}</div>
              </div>
            ) : afterBanner ? (
              <div className="error">{error}</div>
            ) : null}
          </div>
        ) : (
          <div className="error">{error}</div>
        )}
      </div>
    );
  }

  if (!data) {
    const loadingCard = (
      <div className="section-card">
        <p className="muted">Loading governance activity…</p>
      </div>
    );
    return (
      <div className="stack">
        {leadLeft ? (
          <div className="console-banner">
            <div className="console-banner-top">
              {leadLeft}
              {afterBanner ?? (midRow ? null : loadingCard)}
            </div>
            {midRow ? (
              <div className="console-banner-mid">
                {midRow}
                {loadingCard}
              </div>
            ) : afterBanner ? (
              loadingCard
            ) : null}
          </div>
        ) : (
          <p className="muted">Loading governance activity…</p>
        )}
      </div>
    );
  }

  const rows = data.evaluations ?? [];
  const reviewRows = rows.filter(
    (e) => e.review_state === 'pending' || e.requires_review,
  );
  const deniedRows = rows.filter((e) => {
    const d = e.decision.toUpperCase();
    return d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT';
  });
  const conflictRows = rows.filter(
    (e) =>
      (e.resolution_category === 'CONFLICT' ||
        e.resolution_category === 'UNRESOLVED') &&
      (e.review_state === 'pending' || e.requires_review),
  );
  const recent = rows.slice(0, 10);
  const pendingCount = data.attention?.pending_review ?? reviewRows.length;
  const conflictCount = data.attention?.conflicts ?? conflictRows.length;

  const attentionCard = (
    <div className="section-card console-attention-card">
      <div className="section-card-header">
        <h3>What requires governance attention?</h3>
        <Link href="/decisions" className="table-link section-card-header-link">
          All decisions
        </Link>
      </div>
      <div className="metrics metrics-2x4" style={{ marginBottom: '0.75rem' }}>
        <div className="metric">
          <div className="metric-label">Requires review</div>
          <div className="metric-value">{pendingCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Denied / blocked</div>
          <div className="metric-value">{deniedRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Conflicts pending</div>
          <div className="metric-value">{conflictCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Controls applied</div>
          <div className="metric-value">
            {rows.filter((e) => e.controls_applied).length}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`stack${pending ? ' is-refreshing' : ''}`}>
      {leadLeft ? (
        <div className="console-banner">
          <div className="console-banner-top">
            {leadLeft}
            {afterBanner ?? (midRow || !showAttentionCard ? null : attentionCard)}
          </div>
          {afterBanner || midRow || showAttentionCard ? (
            midRow ? (
              <div className="console-banner-mid">
                {midRow}
                {showAttentionCard ? attentionCard : null}
              </div>
            ) : showAttentionCard ? (
              attentionCard
            ) : null
          ) : null}
        </div>
      ) : (
        <>
          {midRow ? (
            <div className="console-banner-mid">
              {midRow}
              {showAttentionCard ? attentionCard : null}
            </div>
          ) : showAttentionCard ? (
            attentionCard
          ) : null}
          {afterBanner}
        </>
      )}

      {(reviewRows.length > 0 || conflictRows.length > 0) && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>Requires review</h3>
          </div>
          {reviewRows.length === 0 && conflictRows.length === 0 ? (
            <p className="muted">No review or conflict decisions in recent activity.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Decision</th>
                  <th>Resolution</th>
                  <th>Enforcement</th>
                  <th>Decision ID</th>
                  <th className="table-col-narrow" aria-label="View" />
                </tr>
              </thead>
              <tbody>
                {[...reviewRows, ...conflictRows]
                  .filter(
                    (e, i, arr) =>
                      arr.findIndex((x) => x.evaluation_id === e.evaluation_id) === i,
                  )
                  .slice(0, 6)
                  .map((e) => (
                    <tr key={e.evaluation_id}>
                      <td className="mono">{formatDisplayDateTime(e.created_at)}</td>
                      <td>
                        <StatusBadge variant="badge" status={e.decision} />
                      </td>
                      <td className="mono">
                        {e.resolution_category
                          ? formatFieldLabel(e.resolution_category)
                          : '-'}
                      </td>
                      <td>
                        <StatusBadge
                          variant="badge"
                          status={
                            e.enforcement?.status ?? e.enforcement_result ?? 'UNKNOWN'
                          }
                        />
                      </td>
                      <td className="mono">{e.evaluation_id}</td>
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
          )}
        </div>
      )}

      {beforeRecent}

      <div className="section-card">
        <div className="section-card-header">
          <h3>Recent decisions</h3>
          <Link href="/decisions" className="table-link section-card-header-link">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title="No policy decisions yet"
            description="Enigma creates a decision for each request sent through the Gateway."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Machine</th>
                <th>Packs</th>
                <th>Expected action</th>
                <th>Enforcement</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.evaluation_id}>
                  <td className="mono">{formatDisplayDateTime(e.created_at)}</td>
                  <td>
                    <StatusBadge variant="badge" status={e.decision} />
                  </td>
                  <td className="mono">
                    {e.contributing_pack_ids?.length
                      ? e.contributing_pack_ids.join(', ')
                      : '-'}
                  </td>
                  <td>{formatFieldLabel(e.expected_action ?? e.action_summary)}</td>
                  <td>
                    <StatusBadge
                      variant="badge"
                      status={
                        e.enforcement?.status ?? e.enforcement_result ?? 'UNKNOWN'
                      }
                    />
                  </td>
                  <td className="mono">
                    <Link href={`/evaluations/${e.evaluation_id}`}>
                      {e.evaluation_id}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
