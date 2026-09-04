'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';

type AuditEvent = {
  audit_id: string;
  timestamp: string;
  request_id: string;
  application_id?: string;
  user_id?: string;
  operation?: string;
  data_classification?: string;
  policy_decision?: string;
  response_decision?: string;
  model_selected?: string;
  provider?: string;
  reason_codes?: string[];
  latency_ms?: number;
  response_hash?: string;
  event_hash?: string;
};

export function AuditTable({ events }: { events: AuditEvent[] }) {
  const [decision, setDecision] = useState('all');
  const [application, setApplication] = useState('');

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (decision !== 'all') {
        const d = (e.policy_decision ?? '').toUpperCase();
        const r = (e.response_decision ?? '').toUpperCase();
        if (decision === 'blocked') {
          if (d !== 'BLOCK' && d !== 'DENY' && r !== 'BLOCK') return false;
        } else if (d !== decision.toUpperCase() && r !== decision.toUpperCase()) {
          return false;
        }
      }
      if (application.trim()) {
        const q = application.trim().toLowerCase();
        if (!(e.application_id ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [events, decision, application]);

  return (
    <div className="stack-tight">
      <div className="toolbar">
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="all">All decisions</option>
          <option value="blocked">Blocked / deny</option>
          <option value="ALLOW">ALLOW</option>
          <option value="TOKENIZE">TOKENIZE</option>
          <option value="RELEASE">RELEASE</option>
          <option value="BLOCK">BLOCK</option>
        </select>
        <input
          placeholder="Filter by application"
          value={application}
          onChange={(e) => setApplication(e.target.value)}
        />
        <span className="muted">
          {filtered.length} of {events.length}
        </span>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No matching events"
          description="Adjust filters or wait for governed traffic."
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>App / User</th>
              <th>Decisions</th>
              <th>Model</th>
              <th>Response hash</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.audit_id}>
                <td className="mono">{e.timestamp}</td>
                <td>
                  <div className="mono">{e.application_id ?? '—'}</div>
                  <div className="muted mono">{e.user_id ?? ''}</div>
                </td>
                <td>
                  <div>
                    req: <StatusBadge status={e.policy_decision ?? '—'} />
                  </div>
                  <div style={{ marginTop: '0.25rem' }}>
                    res: <StatusBadge status={e.response_decision ?? '—'} />
                  </div>
                </td>
                <td className="mono">
                  {e.model_selected ?? '—'}
                  <div className="muted">{e.provider ?? ''}</div>
                </td>
                <td className="mono" title={e.response_hash}>
                  {e.response_hash ? `${e.response_hash.slice(0, 16)}…` : '—'}
                  <div className="muted" title={e.event_hash}>
                    evt {e.event_hash ? `${e.event_hash.slice(0, 12)}…` : '—'}
                  </div>
                </td>
                <td className="mono">{(e.reason_codes ?? []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
