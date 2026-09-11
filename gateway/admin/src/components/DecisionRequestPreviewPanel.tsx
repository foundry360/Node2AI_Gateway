'use client';

import { StatusBadge } from '@/components/StatusBadge';

export type ActionReviewPresentation = {
  kind: 'runtime' | 'lifecycle_change';
  headline: string;
  /** End-user business ask retained for review — never capability justification. */
  prompt?: string;
  why_reviewing: string;
  decision: {
    status: string;
    explanation: string;
  };
};

export type HeldRequestPreview = {
  operation: string;
  model?: string;
  application_id: string;
  organization_id: string;
  user_id: string;
  correlation_id: string;
  messages: Array<{ role: string; content: string }>;
  classification: {
    sensitivity: string;
    confidence: number;
    intent?: string;
    risk: 'low' | 'medium' | 'high';
    reason_codes: string[];
  };
  retained?: boolean;
  change_review?: {
    evidence?: {
      requester_prompt?: string;
    };
  };
  action_review?: ActionReviewPresentation;
};

function decisionBadgeStatus(status: string): string {
  const s = status.toUpperCase();
  if (s.includes('AUTHORIZE') || s === 'ALLOW' || s === 'AUTHORIZED') {
    return 'allow';
  }
  if (s.includes('DENY') || s.includes('BLOCK')) return 'deny';
  if (s.includes('REVIEW')) return 'review';
  return status;
}

function looksLikeNotUserAsk(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.startsWith('ai system is gaining') ||
    t.startsWith('ai system is losing') ||
    t.startsWith('ai system wants to') ||
    t.startsWith('ai system is requesting') ||
    t.startsWith('technical change inventory') ||
    t.startsWith('enable write capability') ||
    t.startsWith('disable write capability') ||
    t.startsWith('authorize the proposed capability') ||
    t.includes('elevating the governed application') ||
    t.includes('need write capability approved')
  );
}

function promptFromSystemBrief(content: string): string | undefined {
  const match =
    /Requester prompt:\s*\n([\s\S]+?)(?:\n\s*\n(?:Rationale|Agent rationale|Intended outcome|If Authorize|If Deny)|$)/i.exec(
      content,
    );
  const prompt = match?.[1]?.trim();
  return prompt && !looksLikeNotUserAsk(prompt) ? prompt : undefined;
}

/** Prompt = what the user asked the agent to do — not write justification. */
function resolvePrompt(preview: HeldRequestPreview): string | undefined {
  const fromAction = preview.action_review?.prompt?.trim();
  if (fromAction && !looksLikeNotUserAsk(fromAction)) return fromAction;

  const fromEvidence =
    preview.change_review?.evidence?.requester_prompt?.trim();
  if (fromEvidence && !looksLikeNotUserAsk(fromEvidence)) return fromEvidence;

  for (const m of preview.messages ?? []) {
    if (m.role.toLowerCase() !== 'user') continue;
    const content = m.content?.trim();
    if (!content || looksLikeNotUserAsk(content)) continue;
    if (content.startsWith('Technical change inventory')) continue;
    return content;
  }

  for (const m of preview.messages ?? []) {
    if (m.role.toLowerCase() !== 'system') continue;
    const fromBrief = promptFromSystemBrief(m.content ?? '');
    if (fromBrief) return fromBrief;
  }

  return undefined;
}

/**
 * Request Review — show the user’s ask to the agent (resolution is on Human Review).
 */
export function DecisionRequestPreviewPanel({
  preview,
}: {
  preview?: HeldRequestPreview | null;
}) {
  const review = preview?.action_review;
  const prompt = preview ? resolvePrompt(preview) : undefined;

  return (
    <section
      className="section-card request-preview-card"
      aria-labelledby="request-preview-heading"
    >
      <div className="section-card-header">
        <h3 id="request-preview-heading">Request Review</h3>
      </div>

      {!preview || !review ? (
        <p className="muted decision-panel-lede">
          Request details are not available for this evaluation.
        </p>
      ) : (
        <div className="action-review action-review-simple">
          <div className="action-review-section">
            <div className="muted decision-sublabel">Prompt</div>
            {prompt ? (
              <pre className="action-review-prompt">{prompt}</pre>
            ) : (
              <p className="muted action-review-missing-prompt">
                No user request was retained for this review.
              </p>
            )}
          </div>

          <div className="action-review-section action-review-decision">
            <div className="muted decision-sublabel">Enigma decision</div>
            <div className="action-review-decision-row">
              <StatusBadge
                variant="badge"
                status={decisionBadgeStatus(review.decision.status)}
                label={review.decision.status}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
