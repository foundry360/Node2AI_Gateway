'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDisplayDateTime } from '@/lib/display-datetime';
import { proxyJson } from '@/lib/client-api';

type HumanResolution = {
  resolution_status: string;
  original_decision: string;
  human_disposition: string;
  final_decision: string;
  resolution_reason: string;
  resolved_by: string;
  resolved_at: string;
};

type ReviewInfo = {
  eligible?: boolean;
  review_state?: string;
  original_decision?: string;
  human_resolution?: HumanResolution | null;
  final_decision?: string | null;
};

type ResumeExecution = {
  status?: string;
  error?: string;
  resumed_at?: string;
};

/**
 * Human review - machine decision stays immutable.
 * Expected action / Gateway verification live in DecisionConsequencePanel.
 */
export function DecisionReviewPanel({
  evaluationId,
  review,
  decision,
  resolutionCategory,
  contributingPacks,
  conflictDetail,
  execution,
  heldRequestPresent,
}: {
  evaluationId: string;
  review?: ReviewInfo | null;
  decision?: string;
  resolutionCategory?: string;
  contributingPacks?: string[];
  conflictDetail?: string;
  execution?: ResumeExecution | null;
  heldRequestPresent?: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = review?.review_state ?? 'not_applicable';
  const resolution = review?.human_resolution;
  const show =
    state === 'pending' ||
    state === 'resolved' ||
    decision?.toUpperCase() === 'REVIEW' ||
    resolutionCategory === 'UNRESOLVED' ||
    resolutionCategory === 'CONFLICT';

  if (!show) return null;

  async function resolve(disposition: 'AUTHORIZE' | 'DENY') {
    setBusy(true);
    setError(null);
    try {
      await proxyJson(`evaluations/${evaluationId}/resolve`, 'POST', {
        disposition,
        reason,
        actor: 'approver',
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      await proxyJson(`evaluations/${evaluationId}/resume`, 'POST', {});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume failed');
    } finally {
      setBusy(false);
    }
  }

  const canResume =
    resolution?.human_disposition === 'AUTHORIZE' &&
    resolution.final_decision === 'ALLOW' &&
    heldRequestPresent &&
    (execution?.status === 'AUTHORIZED_NOT_RESUMED' ||
      execution?.status === 'RESUME_FAILED');

  return (
    <section className="section-card" aria-labelledby="review-heading">
      <div className="section-card-header">
        <h3 id="review-heading">Human Review</h3>
        {state !== 'not_applicable' ? (
          <StatusBadge variant="badge" status={state} />
        ) : null}
      </div>
      <p className="muted decision-panel-lede">
        REVIEW is not DENY. Machine decision stays immutable; human resolution sets final
        enforceable intent. AUTHORIZE is not Gateway success - resume executes the held request.
        Actor is claimed identity - not a full identity system.
      </p>

      <dl className="definition-list">
        <div>
          <dt>Machine Decision</dt>
          <dd>
            <StatusBadge
              variant="badge"
              status={review?.original_decision ?? decision ?? '-'}
            />
          </dd>
        </div>
        {resolutionCategory ? (
          <div>
            <dt>Pack Resolution</dt>
            <dd className="mono">{resolutionCategory}</dd>
          </div>
        ) : null}
        {contributingPacks && contributingPacks.length > 0 ? (
          <div>
            <dt>Contributing Packs</dt>
            <dd className="mono">{contributingPacks.join(', ')}</dd>
          </div>
        ) : null}
        {conflictDetail ? (
          <div>
            <dt>Conflict / Uncertainty</dt>
            <dd>{conflictDetail}</dd>
          </div>
        ) : null}
      </dl>

      {state === 'resolved' && resolution ? (
        <dl className="definition-list decision-review-resolved">
          <div>
            <dt>Human Resolution</dt>
            <dd>
              <StatusBadge variant="badge" status={resolution.human_disposition} />
            </dd>
          </div>
          <div>
            <dt>Final Decision</dt>
            <dd>
              <StatusBadge variant="badge" status={resolution.final_decision} />
            </dd>
          </div>
          <div>
            <dt>Authorization</dt>
            <dd className="mono">
              {resolution.human_disposition === 'AUTHORIZE' ? 'AUTHORIZED' : 'DENIED'}
            </dd>
          </div>
          {execution?.status ? (
            <div>
              <dt>Execution</dt>
              <dd className="mono">{execution.status}</dd>
            </div>
          ) : null}
          <div>
            <dt>Resolved By</dt>
            <dd>{resolution.resolved_by}</dd>
          </div>
          <div>
            <dt>Resolved At</dt>
            <dd className="mono">
              {formatDisplayDateTime(resolution.resolved_at)}
            </dd>
          </div>
          <div>
            <dt>Resolution Reason</dt>
            <dd>{resolution.resolution_reason}</dd>
          </div>
        </dl>
      ) : null}

      {canResume ? (
        <div className="stack-tight decision-review-actions">
          <p className="muted">
            Final decision is ALLOW. Resume the original held request through Gateway
            (idempotent).
          </p>
          <button type="button" className="btn" disabled={busy} onClick={() => resume()}>
            Resume Original Request
          </button>
          {execution?.error ? (
            <p className="error">Previous resume error: {execution.error}</p>
          ) : null}
        </div>
      ) : null}

      {state === 'pending' ? (
        <div className="stack-tight decision-review-actions">
          <p className="muted">
            Resolve with a reason. AUTHORIZE → final ALLOW; DENY → final DENY. Machine stays
            REVIEW.
          </p>
          <label>
            Resolution Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              placeholder="Why authorize or deny this decision?"
            />
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={busy || !reason.trim()}
              onClick={() => resolve('AUTHORIZE')}
            >
              Authorize
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !reason.trim()}
              onClick={() => resolve('DENY')}
            >
              Deny
            </button>
          </div>
          {error ? <div className="error">{error}</div> : null}
        </div>
      ) : null}
      {state !== 'pending' && error ? <div className="error">{error}</div> : null}
    </section>
  );
}
