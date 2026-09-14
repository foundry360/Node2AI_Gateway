'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { proxyJson } from '@/lib/client-api';

export function AgentToolGrantEditor({
  agentId,
  toolId,
  toolName,
  toolOperations,
  grantedOperations,
  grantStatus,
}: {
  agentId: string;
  toolId: string;
  toolName: string;
  toolOperations: string[];
  grantedOperations: string[];
  grantStatus?: string;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => new Set(grantedOperations),
    [grantedOperations],
  );
  const [selected, setSelected] = useState<Set<string>>(initial);
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

  return (
    <div className="section-card">
      <div className="section-card-header">
        <h3>
          {toolName}{' '}
          <span className="mono muted">({toolId})</span>
        </h3>
      </div>
      <p className="muted decision-panel-lede">
        Select operations this agent may request on this tool. The registry is
        an authorization substrate — policy still decides ALLOW / DENY / REVIEW.
      </p>
      {grantStatus ? (
        <p className="muted">
          Current grant status: <strong>{grantStatus}</strong>
        </p>
      ) : null}
      <div className="drawer-form">
        {toolOperations.length === 0 ? (
          <p className="muted">This tool has no declared operations.</p>
        ) : (
          toolOperations.map((op) => (
            <label key={op} className="checkbox-row">
              <input
                type="checkbox"
                checked={selected.has(op)}
                onChange={() => toggle(op)}
              />
              <span className="mono">{op}</span>
            </label>
          ))
        )}
      </div>
      {error ? <div className="error">{error}</div> : null}
      {message ? <p className="muted">{message}</p> : null}
      <div className="row-actions" style={{ marginTop: '0.75rem' }}>
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
            if (window.confirm(`Revoke grant for ${toolId}?`)) {
              void save('REVOKED');
            }
          }}
        >
          Revoke
        </button>
      </div>
    </div>
  );
}
