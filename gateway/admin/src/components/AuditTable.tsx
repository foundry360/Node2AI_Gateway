'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import {
  AuditDetailDrawer,
  type AuditEventDetail,
} from '@/components/AuditDetailDrawer';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDisplayDateTime } from '@/lib/display-datetime';

export function AuditTable({
  events,
  focusAuditId,
  focusRequestId,
}: {
  events: AuditEventDetail[];
  focusAuditId?: string | null;
  focusRequestId?: string | null;
}) {
  const [decision, setDecision] = useState('all');
  const [application, setApplication] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const focusRef = useRef<HTMLTableRowElement | null>(null);

  const focusedId = focusAuditId?.trim() || null;
  const focusedRequest = focusRequestId?.trim() || null;
  const hasFocus = Boolean(focusedId || focusedRequest);

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

  useEffect(() => {
    if (!hasFocus || !focusRef.current) return;
    focusRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [hasFocus, filtered, selectedId]);

  useEffect(() => {
    if (focusedId) {
      setSelectedId(focusedId);
      return;
    }
    if (focusedRequest) {
      const match = events.find((e) => e.request_id === focusedRequest);
      if (match) setSelectedId(match.audit_id);
    }
  }, [focusedId, focusedRequest, events]);

  const selected = useMemo(
    () => events.find((e) => e.audit_id === selectedId) ?? null,
    [events, selectedId],
  );

  const closePanel = useCallback(() => setSelectedId(null), []);

  return (
    <div className="stack-tight">
      <div className="toolbar">
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="all">All decisions</option>
          <option value="blocked">Blocked / Deny</option>
          <option value="ALLOW">Allow</option>
          <option value="TOKENIZE">Tokenize</option>
          <option value="RELEASE">Release</option>
          <option value="BLOCK">Block</option>
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
        <table className="audit-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Event</th>
              <th>Application</th>
              <th>Policy Decision</th>
              <th>Decision Response</th>
              <th>Model</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const isFocused =
                (focusedId && e.audit_id === focusedId) ||
                (!focusedId &&
                  focusedRequest &&
                  e.request_id === focusedRequest);
              const isSelected = selectedId === e.audit_id;
              return (
                <tr
                  key={e.audit_id}
                  id={`audit-${e.audit_id}`}
                  ref={isFocused ? focusRef : undefined}
                  className={[
                    'audit-row',
                    isFocused ? 'audit-row-focus' : '',
                    isSelected ? 'audit-row-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => setSelectedId(e.audit_id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      setSelectedId(e.audit_id);
                    }
                  }}
                >
                  <td className="mono">{formatDisplayDateTime(e.timestamp)}</td>
                  <td className="mono">{e.audit_id}</td>
                  <td className="mono">{e.application_id ?? '-'}</td>
                  <td>
                    <StatusBadge
                      variant="badge"
                      status={e.policy_decision ?? '-'}
                    />
                  </td>
                  <td>
                    <StatusBadge
                      variant="badge"
                      status={e.response_decision ?? '-'}
                    />
                  </td>
                  <td className="mono">{e.model_selected ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <AuditDetailDrawer event={selected} onClose={closePanel} />
    </div>
  );
}
