import { adminFetch } from '@/lib/api';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { StatusBadge } from '@/components/StatusBadge';
import { DecisionExplanationView } from '@/components/DecisionExplanationView';
import { DecisionConsequencePanel } from '@/components/DecisionConsequencePanel';
import { DecisionDetailTabs } from '@/components/DecisionDetailTabs';
import {
  DecisionReviewHeaderActions,
  DecisionReviewPanel,
  DecisionReviewProvider,
} from '@/components/DecisionReviewPanel';
import { DecisionRequestContextPanel } from '@/components/DecisionRequestContextPanel';
import {
  DecisionRequestPreviewPanel,
  type HeldRequestPreview,
} from '@/components/DecisionRequestPreviewPanel';
import { formatDisplayDateTime } from '@/lib/display-datetime';
import { formatFieldLabel } from '@/lib/field-label';
import type { DecisionExplanationPayload } from '@/lib/decision-explanation';

type Consequence = {
  action_summary: string;
  expected_action?: string;
  controls_applied?: boolean;
  requires_review?: boolean;
};

type Enforcement = {
  status: string;
  verified: boolean;
  attempted: boolean;
  expected_action?: string;
  action_attempted?: string;
  gateway_report?: string;
  request_id?: string;
  audit_id?: string;
  occurred_at?: string;
  summary?: string;
  safety_fallback?: boolean;
};

type HumanResolution = {
  resolution_status: string;
  original_decision: string;
  human_disposition: string;
  final_decision: string;
  resolution_reason: string;
  resolved_by: string;
  resolved_at: string;
};

type RequestContext = {
  execution_mode?: 'simulation' | 'live';
  phase?: string;
  request_id?: string;
  action?: string;
  resource_type?: string;
  classification?: string;
  purpose?: string;
  recipient?: string;
  authorization?: string;
  governance?: {
    accountability_documented?: boolean;
    system_context_documented?: boolean;
    measurement_documented?: boolean;
    risk_response_documented?: boolean;
  };
  source?: string;
  processing_location?: string;
  regulatory_applicability?: string[];
  environment?: string;
  deployment_mode?: string;
  risk_level?: string;
  application_id?: string;
  organization_id?: string;
  model?: string;
  intent?: string;
};

type EvaluationDetailResponse = {
  source?: string;
  evaluation: {
    evaluation_id: string;
    created_at: string;
    decision: string;
    phase: string;
    request_id?: string;
    action?: string;
    human_resolution?: HumanResolution;
  };
  decision: DecisionExplanationPayload;
  consequence?: Consequence;
  enforcement?: Enforcement;
  request_context?: RequestContext;
  held_request_preview?: HeldRequestPreview | null;
  execution?: {
    mode?: 'simulation' | 'live';
    phase?: string;
    gateway_executed?: boolean;
    summary?: string;
    resume?: { status?: string; error?: string; resumed_at?: string } | null;
    held_request_present?: boolean;
  };
  review?: {
    eligible?: boolean;
    review_state?: string;
    original_decision?: string;
    human_resolution?: HumanResolution | null;
    final_decision?: string | null;
  };
};

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export default async function EvaluationDetailPage({
  params,
}: {
  params: { evaluationId: string };
}) {
  const evaluationId = params.evaluationId;
  let data: EvaluationDetailResponse | null = null;
  let error: string | null = null;

  try {
    data = await adminFetch<EvaluationDetailResponse>(
      `/v1/admin/evaluations/${evaluationId}`,
    );
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load evaluation';
  }

  const decision = data?.decision;
  const record = data?.evaluation;
  const consequence = data?.consequence;
  const enforcement = data?.enforcement;
  const review = data?.review;
  const requestContext = data?.request_context;
  const heldRequestPreview = data?.held_request_preview ?? null;
  const execution = data?.execution;
  const showReview =
    review?.review_state === 'pending' ||
    review?.review_state === 'resolved' ||
    (decision?.decision ?? record?.decision)?.toUpperCase() === 'REVIEW' ||
    decision?.explanation?.resolution?.category === 'UNRESOLVED' ||
    decision?.explanation?.resolution?.category === 'CONFLICT';
  const requiredControls =
    decision?.explanation?.operator?.enforcement_controls?.map((c) =>
      typeof c === 'string' ? c : c.control_id,
    ) ??
    decision?.explanation?.operator?.enigma_obligations ??
    [];

  const machineDecision = decision?.decision ?? record?.decision ?? '-';
  const finalDecision = review?.final_decision ?? machineDecision;
  const executionMode =
    requestContext?.execution_mode === 'simulation' ? 'Simulation' : 'Live';
  const phaseLabel = formatFieldLabel(record?.phase ?? requestContext?.phase) || '-';
  const recordedAt = formatDisplayDateTime(record?.created_at ?? null);
  const resolutionCategory = decision?.explanation?.resolution?.category;

  const page = (
    <div className="stack">
      <Breadcrumbs
        items={[
          { href: '/decisions', label: 'Decisions' },
          { label: evaluationId },
        ]}
      />

      <div className="meridian-top">
        <div className="meridian-header">
          <div className="meridian-header-text">
            <div className="policy-detail-title-row">
              <h1 className="meridian-title">Decision</h1>
              <StatusBadge variant="badge" status={finalDecision} />
            </div>
          </div>
          {showReview ? <DecisionReviewHeaderActions /> : null}
        </div>

        {record ? (
          <div className="meridian-panel">
            <div className="meridian-panel-left">
              <div className="meridian-card-head">
                <h2 className="meridian-card-title">Decision Identity</h2>
                <span className="meridian-pill">Authoritative</span>
              </div>
              <div className="leader-rows">
                <div className="leader-row">
                  <span className="leader-label">Machine</span>
                  <span className="leader-dots" aria-hidden />
                  <span className="leader-value">
                    <StatusBadge variant="badge" status={machineDecision} />
                  </span>
                </div>
                <div className="leader-row">
                  <span className="leader-label">Final</span>
                  <span className="leader-dots" aria-hidden />
                  <span className="leader-value">
                    <StatusBadge variant="badge" status={finalDecision} />
                  </span>
                </div>
                <div className="leader-row">
                  <span className="leader-label">Phase</span>
                  <span className="leader-dots" aria-hidden />
                  <span className="leader-value">{phaseLabel}</span>
                </div>
                <div className="leader-row">
                  <span className="leader-label">Mode</span>
                  <span className="leader-dots" aria-hidden />
                  <span className="leader-value">{executionMode}</span>
                </div>
                {review?.review_state ? (
                  <div className="leader-row">
                    <span className="leader-label">Review</span>
                    <span className="leader-dots" aria-hidden />
                    <span className="leader-value">
                      {formatFieldLabel(review.review_state)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="meridian-panel-right">
              <div className="meridian-attr">
                <span className="meridian-attr-label">Evaluation ID</span>
                <span className="meridian-attr-value mono">
                  {record.evaluation_id}
                </span>
              </div>
              <div className="meridian-attr">
                <span className="meridian-attr-label">Request ID</span>
                <span className="meridian-attr-value mono">
                  {record.request_id ?? requestContext?.request_id ?? '-'}
                </span>
              </div>
              <div className="meridian-attr">
                <span className="meridian-attr-label">Action</span>
                <span className="meridian-attr-value mono">
                  {record.action ?? requestContext?.action ?? '-'}
                </span>
              </div>
              <div className="meridian-attr">
                <span className="meridian-attr-label">Recorded</span>
                <span className="meridian-attr-value mono">{recordedAt}</span>
              </div>
              <div className="meridian-attr">
                <span className="meridian-attr-label">Source</span>
                <span className="meridian-attr-value">
                  {data?.source === 'policy_evaluations'
                    ? 'EPA'
                    : capitalize(data?.source ?? '-')}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <div className="error">{error}</div> : null}

      <DecisionDetailTabs
        showPreview
        showContext={Boolean(requestContext)}
        showPolicy={Boolean(decision || consequence)}
        showReview={showReview}
        defaultTab={
          decision || consequence
            ? 'policy'
            : review?.review_state === 'pending'
              ? 'preview'
              : 'policy'
        }
        preview={<DecisionRequestPreviewPanel preview={heldRequestPreview} />}
        context={
          <DecisionRequestContextPanel
            context={requestContext}
            executionSummary={execution?.summary}
          />
        }
        policy={
          decision ? (
            <DecisionExplanationView
              decision={decision}
              afterTop={
                consequence ? (
                  <DecisionConsequencePanel
                    decision={decision?.decision ?? record?.decision}
                    finalDecision={review?.final_decision ?? undefined}
                    humanDisposition={
                      review?.human_resolution?.human_disposition
                    }
                    consequence={consequence}
                    enforcement={enforcement}
                    requiredControls={requiredControls}
                    executionMode={
                      requestContext?.execution_mode ?? execution?.mode
                    }
                  />
                ) : undefined
              }
            />
          ) : consequence ? (
            <DecisionConsequencePanel
              decision={record?.decision}
              finalDecision={review?.final_decision ?? undefined}
              humanDisposition={review?.human_resolution?.human_disposition}
              consequence={consequence}
              enforcement={enforcement}
              requiredControls={requiredControls}
              executionMode={requestContext?.execution_mode ?? execution?.mode}
            />
          ) : null
        }
        review={
          showReview ? (
            <DecisionReviewPanel
              review={review}
              decision={decision?.decision ?? record?.decision}
              resolutionCategory={resolutionCategory}
              contributingPacks={
                decision?.explanation?.resolution?.contributing_pack_ids ??
                decision?.explanation?.operator?.contributing_pack_ids
              }
              execution={execution?.resume}
              heldRequestPresent={execution?.held_request_present}
            />
          ) : null
        }
      />
    </div>
  );

  if (!showReview) return page;

  return (
    <DecisionReviewProvider
      evaluationId={evaluationId}
      review={review}
      decision={decision?.decision ?? record?.decision}
      resolutionCategory={resolutionCategory}
    >
      {page}
    </DecisionReviewProvider>
  );
}
