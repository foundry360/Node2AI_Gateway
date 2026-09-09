'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDisplayDateTime } from '@/lib/display-datetime';
import { formatFieldLabel } from '@/lib/field-label';
import { proxyJson } from '@/lib/client-api';
import { useAdminCapabilities } from '@/hooks/useAdminCapabilities';

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

type DecisionReviewContextValue = {
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  error: string | null;
  state: string;
  pending: boolean;
  resolve: (disposition: 'AUTHORIZE' | 'DENY') => Promise<void>;
  resume: () => Promise<void>;
};

const DecisionReviewContext = createContext<DecisionReviewContextValue | null>(
  null,
);

function useDecisionReview() {
  const ctx = useContext(DecisionReviewContext);
  if (!ctx) {
    throw new Error('DecisionReview components require DecisionReviewProvider');
  }
  return ctx;
}

function useOptionalDecisionReview() {
  return useContext(DecisionReviewContext);
}

function AttrRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="meridian-attr">
      <span className="meridian-attr-label">{label}</span>
      <span className={mono ? 'meridian-attr-value mono' : 'meridian-attr-value'}>
        {children}
      </span>
    </div>
  );
}

export function DecisionReviewProvider({
  evaluationId,
  review,
  children,
}: {
  evaluationId: string;
  review?: ReviewInfo | null;
  decision?: string;
  resolutionCategory?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = review?.review_state ?? 'not_applicable';
  const showHeaderActions = state === 'pending';

  const resolve = useCallback(
    async (disposition: 'AUTHORIZE' | 'DENY') => {
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
    },
    [evaluationId, reason, router],
  );

  const resume = useCallback(async () => {
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
  }, [evaluationId, router]);

  const value = useMemo(
    () => ({
      reason,
      setReason,
      busy,
      error,
      state,
      pending: showHeaderActions,
      resolve,
      resume,
    }),
    [reason, busy, error, state, showHeaderActions, resolve, resume],
  );

  return (
    <DecisionReviewContext.Provider value={value}>
      {children}
    </DecisionReviewContext.Provider>
  );
}

/** Authorize / Deny controls for pending human review (shared by header + Request Review). */
export function DecisionReviewResolveControls() {
  const ctx = useOptionalDecisionReview();
  const { canResolveGovernance, role } = useAdminCapabilities();
  if (!ctx?.pending) return null;
  if (role && !canResolveGovernance) return null;
  const { busy, reason, setReason, resolve, error } = ctx;

  return (
    <div className="action-review-resolve">
      <label className="review-reason-field">
        <span className="sr-only">Resolution reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
          placeholder="Why authorize or deny?"
        />
      </label>
      <div className="review-card-actions action-review-resolve-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !reason.trim()}
          onClick={() => resolve('DENY')}
        >
          Deny
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !reason.trim()}
          onClick={() => resolve('AUTHORIZE')}
        >
          Authorize
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

/** Authorize / Deny on the Decision page heading when review is pending. */
export function DecisionReviewHeaderActions() {
  const { pending, busy, reason, resolve } = useDecisionReview();
  const { canResolveGovernance, role } = useAdminCapabilities();
  if (!pending) return null;
  if (role && !canResolveGovernance) return null;

  return (
    <div className="meridian-header-actions">
      <div className="review-card-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !reason.trim()}
          onClick={() => resolve('DENY')}
        >
          Deny
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !reason.trim()}
          onClick={() => resolve('AUTHORIZE')}
        >
          Authorize
        </button>
      </div>
    </div>
  );
}

/**
 * Human review - machine decision stays immutable.
 * Expected action / Gateway verification live in DecisionConsequencePanel.
 */
export function DecisionReviewPanel({
  review,
  decision,
  resolutionCategory,
  contributingPacks,
  execution,
  heldRequestPresent,
}: {
  review?: ReviewInfo | null;
  decision?: string;
  resolutionCategory?: string;
  contributingPacks?: string[];
  execution?: ResumeExecution | null;
  heldRequestPresent?: boolean;
}) {
  const { reason, setReason, busy, error, state, resume } = useDecisionReview();
  const resolution = review?.human_resolution;
  const show =
    state === 'pending' ||
    state === 'resolved' ||
    decision?.toUpperCase() === 'REVIEW' ||
    resolutionCategory === 'UNRESOLVED' ||
    resolutionCategory === 'CONFLICT';

  if (!show) return null;

  const canResume =
    resolution?.human_disposition === 'AUTHORIZE' &&
    resolution.final_decision === 'ALLOW' &&
    heldRequestPresent &&
    (execution?.status === 'AUTHORIZED_NOT_RESUMED' ||
      execution?.status === 'RESUME_FAILED');

  return (
    <section className="section-card review-card" aria-labelledby="review-heading">
      <div className="section-card-header">
        <h3 id="review-heading">Human Review</h3>
      </div>

      <p className="muted decision-panel-lede review-card-lede">
        Machine decision stays immutable. Human resolution sets final enforceable intent;
        AUTHORIZE still requires resume to execute a held request.
      </p>

      <div
        className={`review-card-layout${
          state === 'pending' ||
          (state === 'resolved' && resolution) ||
          canResume
            ? ''
            : ' review-card-layout-single'
        }`}
      >
        <div className="review-card-context">
          <div className="muted decision-sublabel">Context</div>
          <div className="contribution-attrs">
            <AttrRow label="Machine">
              <StatusBadge
                variant="badge"
                status={review?.original_decision ?? decision ?? '-'}
              />
            </AttrRow>
            {resolutionCategory ? (
              <AttrRow label="Resolution" mono>
                {formatFieldLabel(resolutionCategory)}
              </AttrRow>
            ) : null}
            {contributingPacks && contributingPacks.length > 0 ? (
              <AttrRow label="Packs">
                <span className="review-pack-chips">
                  {contributingPacks.map((packId) => (
                    <span key={packId} className="policy-chip">
                      <span className="policy-chip-code">{packId}</span>
                    </span>
                  ))}
                </span>
              </AttrRow>
            ) : null}
          </div>
        </div>

        {state === 'pending' ||
        (state === 'resolved' && resolution) ||
        canResume ? (
          <div className="review-card-main">
            {state === 'resolved' && resolution ? (
              <div className="review-card-outcome">
                <div className="muted decision-sublabel">Resolution</div>
                <div className="contribution-attrs">
                  <AttrRow label="Disposition">
                    <StatusBadge
                      variant="badge"
                      status={resolution.human_disposition}
                    />
                  </AttrRow>
                  <AttrRow label="Final">
                    <StatusBadge variant="badge" status={resolution.final_decision} />
                  </AttrRow>
                  <AttrRow label="Authorization" mono>
                    {resolution.human_disposition === 'AUTHORIZE'
                      ? 'AUTHORIZED'
                      : 'DENIED'}
                  </AttrRow>
                  {execution?.status ? (
                    <AttrRow label="Execution" mono>
                      {execution.status}
                    </AttrRow>
                  ) : null}
                  <AttrRow label="Resolved by">{resolution.resolved_by}</AttrRow>
                  <AttrRow label="Resolved at" mono>
                    {formatDisplayDateTime(resolution.resolved_at)}
                  </AttrRow>
                  <AttrRow label="Reason">{resolution.resolution_reason}</AttrRow>
                </div>
              </div>
            ) : null}

            {canResume ? (
              <div className="review-card-action">
                <div className="muted decision-sublabel">Resume</div>
                <p className="muted review-card-hint">
                  Final decision is ALLOW. Resume the held request through Gateway
                  (idempotent).
                </p>
                <div className="review-card-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => resume()}
                  >
                    Resume Original Request
                  </button>
                </div>
                {execution?.error ? (
                  <p className="error">Previous resume error: {execution.error}</p>
                ) : null}
              </div>
            ) : null}

            {state === 'pending' ? (
              <div className="review-card-action">
                <div className="muted decision-sublabel">Resolve</div>
                <label className="review-reason-field">
                  <span className="sr-only">Resolution reason</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    required
                    placeholder="Why authorize or deny this decision?"
                  />
                </label>
                {error ? <div className="error">{error}</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {state !== 'pending' && error ? <div className="error">{error}</div> : null}
    </section>
  );
}
