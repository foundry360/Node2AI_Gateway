'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ACTION_OPERATIONS } from '@/lib/action-catalog';
import { StatusBadge } from '@/components/StatusBadge';

function operationLabel(op: string): string {
  return ACTION_OPERATIONS.find((o) => o.id === op)?.label ?? op;
}

export function AuthorizedAgentAccordion({
  agentId,
  agentName,
  agentStatus,
  allowedOperations,
  defaultOpen = false,
}: {
  agentId: string;
  agentName: string;
  agentStatus?: string | null;
  allowedOperations: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const opCount = allowedOperations.length;
  const opSummary =
    opCount === 0
      ? 'No operations'
      : `${opCount} operation${opCount === 1 ? '' : 's'}`;

  return (
    <details
      className="section-card contribution-accordion grant-tool-accordion"
      open={open}
      onToggle={(e) => {
        setOpen((e.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="contribution-accordion-summary">
        <span className="contribution-accordion-lead">
          <ChevronDown
            className="contribution-accordion-chevron"
            size={16}
            strokeWidth={2}
            aria-hidden
          />
          <span className="contribution-accordion-title">
            {agentName}
            <span className="muted grant-tool-op-count"> · {opSummary}</span>
          </span>
        </span>
        {agentStatus ? (
          <StatusBadge showLabel status={agentStatus} />
        ) : null}
      </summary>
      <div className="contribution-accordion-body grant-tool-accordion-body">
        <p className="muted decision-panel-lede">
          Operations this agent may request on this tool via its active grant.
        </p>
        {allowedOperations.length === 0 ? (
          <p className="muted">No operations granted.</p>
        ) : (
          <div className="policy-chip-row grant-authorized-ops">
            {allowedOperations.map((op) => (
              <span key={op} className="policy-chip">
                {operationLabel(op)}
              </span>
            ))}
          </div>
        )}
        <div className="grant-op-footer">
          <Link
            href={`/agents/${encodeURIComponent(agentId)}`}
            className="grant-view-tool-link"
            onClick={(e) => e.stopPropagation()}
          >
            View agent
          </Link>
        </div>
      </div>
    </details>
  );
}
