'use client';

/**
 * Optional Decision narrative summary — same section-card styling as other panels.
 * No alternate visual language / hero treatment.
 */

import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';

export type DecisionNarrativePayload = {
  headline: string;
  reason: string;
  status: {
    decision: string;
    final_decision: string;
    enforcement: string;
    review: string;
    outcome: string;
  };
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

export function DecisionNarrativePanel({
  narrative,
}: {
  narrative: DecisionNarrativePayload;
}) {
  return (
    <section
      className="section-card consequence-card"
      aria-labelledby="decision-narrative-heading"
    >
      <div className="section-card-header">
        <h3 id="decision-narrative-heading">Summary</h3>
      </div>
      <p className="muted decision-panel-lede">{narrative.headline}</p>
      <div className="contribution-attrs">
        <AttrRow label="Reason">{narrative.reason}</AttrRow>
        <AttrRow label="Machine">
          <StatusBadge variant="badge" status={narrative.status.decision} />
        </AttrRow>
        <AttrRow label="Final">
          <StatusBadge variant="badge" status={narrative.status.final_decision} />
        </AttrRow>
        <AttrRow label="Enforcement">
          <StatusBadge variant="badge" status={narrative.status.enforcement} />
        </AttrRow>
        <AttrRow label="Review">
          <StatusBadge variant="badge" status={narrative.status.review} />
        </AttrRow>
        <AttrRow label="Outcome">
          <StatusBadge variant="badge" status={narrative.status.outcome} />
        </AttrRow>
      </div>
    </section>
  );
}
