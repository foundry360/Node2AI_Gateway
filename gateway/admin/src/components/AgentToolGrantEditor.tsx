'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { ACTION_OPERATIONS } from '@/lib/action-catalog';
import { StatusBadge } from '@/components/StatusBadge';

function operationLabel(op: string): string {
  return ACTION_OPERATIONS.find((o) => o.id === op)?.label ?? op;
}

export function AgentToolGrantEditor({
  agentId,
  toolId,
  toolName,
  toolOperations,
  grantedOperations,
  grantStatus,
  defaultOpen = false,
}: {
  agentId: string;
  toolId: string;
  toolName: string;
  toolOperations: string[];
  grantedOperations: string[];
  grantStatus?: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => new Set(grantedOperations),
    [grantedOperations],
  );
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(op: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op);
      else next.add(op);
      return next;
    });
  }

  async function save(status: 'ACTIVE' | 'REVOKED' = 'ACTIVE') {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await proxyJson(`agents/${agentId}/tools/${toolId}`, 'PUT', {
        allowed_operations: status === 'REVOKED' ? [] : [...selected],
        status,
      });
      setMessage(status === 'REVOKED' ? 'Grant revoked' : 'Grant saved');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const opCount = grantedOperations.length;
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
            {toolName}
            <span className="muted grant-tool-op-count"> · {opSummary}</span>
          </span>
        </span>
        {grantStatus ? (
          <StatusBadge showLabel status={grantStatus} />
        ) : null}
      </summary>
      <div className="contribution-accordion-body grant-tool-accordion-body">
        <p className="muted decision-panel-lede page-lede-nowrap">
          Select operations this agent may request on this tool. The registry is
          an authorization substrate; policy still decides ALLOW / DENY / REVIEW.
        </p>
        <div className="grant-op-list">
          {toolOperations.length === 0 ? (
            <p className="muted">This tool has no declared operations.</p>
          ) : (
            toolOperations.map((op) => {
              const on = selected.has(op);
              return (
                <button
                  key={op}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  className={`grant-op-toggle${on ? ' is-on' : ''}`}
                  onClick={() => toggle(op)}
                >
                  <span className="grant-op-label">{operationLabel(op)}</span>
                  <span className="grant-op-switch" aria-hidden>
                    <span className="grant-op-knob" />
                  </span>
                </button>
              );
            })
          )}
        </div>
        {error ? <div className="error">{error}</div> : null}
        {message ? <p className="muted">{message}</p> : null}
        <div className="grant-op-footer">
          <Link
            href={`/tools/${encodeURIComponent(toolId)}`}
            className="grant-view-tool-link"
          >
            View tool
          </Link>
          <div className="row-actions grant-op-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void save('ACTIVE')}
            >
              {busy ? 'Saving…' : 'Save grant'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Revoke grant for ${toolName}?`)) {
                  void save('REVOKED');
                }
              }}
            >
              Revoke
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}
