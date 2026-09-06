import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { DecisionExplanationView } from '@/components/DecisionExplanationView';
import { DecisionConsequencePanel } from '@/components/DecisionConsequencePanel';
import { DecisionReviewPanel } from '@/components/DecisionReviewPanel';
import { DecisionRequestContextPanel } from '@/components/DecisionRequestContextPanel';
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

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { href: '/decisions', label: 'Decisions' },
          { label: evaluationId },
        ]}
      />
      <PageHeader
        title="Decision"
        lede={
          record
            ? `${record.evaluation_id} · ${
                requestContext?.execution_mode === 'simulation' ? 'simulation' : 'live'
              } · ${record.phase} · recorded ${record.created_at}`
            : evaluationId
        }
        actions={
          review?.final_decision || decision?.decision ? (
            <span className="stack-tight" style={{ alignItems: 'flex-end' }}>
              <span className="muted" style={{ fontSize: '0.75rem' }}>
                {review?.final_decision ? 'Final decision' : 'Machine decision'}
              </span>
              <StatusBadge
                variant="badge"
                status={review?.final_decision ?? decision?.decision ?? ''}
              />
            </span>
          ) : undefined
        }
      />
      {error ? <div className="error">{error}</div> : null}
      {data?.source === 'policy_evaluations' ? (
        <p className="muted">
          Governance journey from <code className="mono">policy_evaluations</code> (what Enigma
          decided and why). Human resolution is a separate intervention. Gateway/audit is operational
          evidence — not decision authority. See{' '}
          <Link href="/audit">Audit</Link>.
        </p>
      ) : null}

      <DecisionRequestContextPanel
        context={requestContext}
        executionSummary={execution?.summary}
      />

      {decision ? (
        <section aria-labelledby="governance-heading">
          <h3 id="governance-heading" className="section-title" style={{ marginBottom: '0.5rem' }}>
            2. Governance &amp; provenance
          </h3>
          <DecisionExplanationView decision={decision} />
        </section>
      ) : null}

      {showReview ? (
        <DecisionReviewPanel
          evaluationId={evaluationId}
          review={review}
          decision={decision?.decision ?? record?.decision}
          resolutionCategory={decision?.explanation?.resolution?.category}
          contributingPacks={
            decision?.explanation?.resolution?.contributing_pack_ids ??
            decision?.explanation?.operator?.contributing_pack_ids
          }
          conflictDetail={
            decision?.explanation?.resolution?.detail ??
            decision?.explanation?.operator?.conflict_detail
          }
          execution={execution?.resume}
          heldRequestPresent={execution?.held_request_present}
        />
      ) : null}

      {consequence ? (
        <DecisionConsequencePanel
          decision={decision?.decision ?? record?.decision}
          finalDecision={review?.final_decision ?? undefined}
          humanDisposition={review?.human_resolution?.human_disposition}
          consequence={consequence}
          enforcement={enforcement}
          requiredControls={requiredControls}
          executionMode={requestContext?.execution_mode ?? execution?.mode}
        />
      ) : null}
    </div>
  );
}
