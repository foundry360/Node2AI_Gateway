'use client';

/**
 * Historical action governance snapshot from evaluation ai_context.
 * Must not reconstruct from live Agent/Tool/Application state.
 */

import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatFieldLabel } from '@/lib/field-label';

export type ActionGovernanceSnapshot = {
  category?: string;
  operation?: string;
  kind?: string | null;
  target_id?: string | null;
  attributes?: Record<string, unknown>;
  write_governance_class?: string | null;
  enforcement_boundary?: string;
  client_commit?: boolean;
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

function boundaryLabel(boundary?: string): string {
  if (boundary === 'client_commit_required') {
    return 'Client commit required';
  }
  if (boundary === 'gateway_enforced') {
    return 'Gateway enforced';
  }
  return boundary ? formatFieldLabel(boundary) : '—';
}

export function DecisionActionGovernancePanel({
  actionGovernance,
}: {
  actionGovernance: ActionGovernanceSnapshot;
}) {
  const field =
    typeof actionGovernance.attributes?.field === 'string'
      ? actionGovernance.attributes.field
      : null;

  return (
    <section
      className="section-card consequence-card"
      aria-labelledby="action-governance-heading"
    >
      <div className="section-card-header">
        <h3 id="action-governance-heading">Action</h3>
      </div>
      <div className="contribution-attrs">
        {actionGovernance.category ? (
          <AttrRow label="Category" mono>
            {actionGovernance.category}
          </AttrRow>
        ) : null}
        {actionGovernance.operation ? (
          <AttrRow label="Operation" mono>
            {actionGovernance.operation}
          </AttrRow>
        ) : null}
        {actionGovernance.kind ? (
          <AttrRow label="Kind" mono>
            {actionGovernance.kind}
          </AttrRow>
        ) : null}
        {actionGovernance.target_id ? (
          <AttrRow label="Target" mono>
            {actionGovernance.target_id}
          </AttrRow>
        ) : null}
        {field ? (
          <AttrRow label="Field" mono>
            {field}
          </AttrRow>
        ) : null}
        {actionGovernance.write_governance_class ? (
          <AttrRow label="Write Class">
            <StatusBadge
              showLabel
              status={actionGovernance.write_governance_class}
              label={formatFieldLabel(actionGovernance.write_governance_class)}
            />
          </AttrRow>
        ) : null}
        <AttrRow label="Enforcement">
          {boundaryLabel(actionGovernance.enforcement_boundary)}
        </AttrRow>
        {actionGovernance.client_commit != null ? (
          <AttrRow label="Client Commit">
            {actionGovernance.client_commit ? 'Yes' : 'No'}
          </AttrRow>
        ) : null}
      </div>
    </section>
  );
}
