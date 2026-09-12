'use client';

/**
 * Historical model authorization vs Gateway execution.
 * Eligible models come only from the persisted evaluation snapshot.
 */

import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';

export type ModelGovernance = {
  authorization_evaluation_id?: string;
  authorization_phase?: string;
  requested_model?: string;
  eligible_models: string[] | null;
  eligibility: 'authorized' | 'none_authorized' | 'not_recorded';
  selected_model?: string;
  provider?: string;
  authorization_match: 'matched' | 'mismatch' | 'unknown' | 'not_applicable';
};

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

function matchLabel(match: ModelGovernance['authorization_match']): string {
  switch (match) {
    case 'matched':
      return 'Matched';
    case 'mismatch':
      return 'Mismatch';
    case 'not_applicable':
      return 'Not applicable';
    default:
      return 'Unknown';
  }
}

function AuthorizedModels({ gov }: { gov: ModelGovernance }) {
  if (gov.eligibility === 'not_recorded') {
    return (
      <span className="muted">
        Historical model eligibility was not recorded for this evaluation.
      </span>
    );
  }
  if (gov.eligibility === 'none_authorized') {
    return <span>None</span>;
  }
  const models = gov.eligible_models ?? [];
  if (models.length === 0) return <span>None</span>;
  return <span className="mono">{models.join(', ')}</span>;
}

export function DecisionModelGovernancePanel({
  governance,
}: {
  governance: ModelGovernance;
}) {
  return (
    <section
      className="section-card consequence-card"
      aria-labelledby="model-governance-heading"
    >
      <div className="section-card-header">
        <h3 id="model-governance-heading">Model Governance</h3>
      </div>
      <p className="muted decision-panel-lede">
        Authorized models come from the historical policy decision. Executed
        model and provider come from Gateway audit evidence, not from the
        current Models registry.
      </p>
      <div className="contribution-attrs">
        <AttrRow label="Requested" mono>
          {governance.requested_model ?? <span className="muted">-</span>}
        </AttrRow>
        <AttrRow label="Authorized">
          <AuthorizedModels gov={governance} />
        </AttrRow>
        <AttrRow label="Executed" mono>
          {governance.selected_model ?? <span className="muted">-</span>}
        </AttrRow>
        <AttrRow label="Provider" mono>
          {governance.provider ?? <span className="muted">-</span>}
        </AttrRow>
        <AttrRow label="Verification">
          <StatusBadge
            variant="badge"
            status={governance.authorization_match}
            label={matchLabel(governance.authorization_match)}
          />
        </AttrRow>
      </div>
    </section>
  );
}
