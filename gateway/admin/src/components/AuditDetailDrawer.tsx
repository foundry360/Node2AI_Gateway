'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDisplayDateTime } from '@/lib/display-datetime';
import { formatReasonCodes } from '@/lib/reason-codes';

export type AuditEventDetail = {
  audit_id: string;
  timestamp: string;
  request_id: string;
  correlation_id?: string;
  organization_id?: string;
  application_id?: string;
  user_id?: string;
  operation?: string;
  data_classification?: string;
  policy_decision?: string;
  response_decision?: string;
  model_selected?: string;
  provider?: string;
  input_transformation?: string;
  response_transformation?: string;
  reason_codes?: string[];
  latency_ms?: number;
  response_hash?: string;
  event_hash?: string;
  prev_event_hash?: string;
  evaluation_id?: string | null;
  decision_hash?: string | null;
  integrity_signature?: string;
};

function Attr({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="audit-detail-attr">
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{children ?? '-'}</dd>
    </div>
  );
}

function HashValue({ value }: { value?: string | null }) {
  if (!value) return <>-</>;
  return (
    <span className="mono audit-detail-hash" title={value}>
      {value}
    </span>
  );
}

export function AuditDetailDrawer({
  event,
  onClose,
}: {
  event: AuditEventDetail | null;
  onClose: () => void;
}) {
  const open = Boolean(event);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!event) return null;

  const reasons = formatReasonCodes(event.reason_codes);

  return (
    <div className="drawer-root" role="presentation">
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close audit panel"
        onClick={onClose}
      />
      <aside
        className="drawer-panel drawer-panel-audit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
      >
        <div className="drawer-header">
          <div>
            <h2 id="audit-detail-title" className="drawer-title">
              Audit event
            </h2>
            <p className="drawer-sub mono">{event.audit_id}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="drawer-body audit-detail-body">
          <section className="audit-detail-section">
            <h3 className="audit-detail-section-title">Identity</h3>
            <dl className="audit-detail-attrs">
              <Attr label="Date" mono>
                {formatDisplayDateTime(event.timestamp)}
              </Attr>
              <Attr label="Request" mono>
                {event.request_id || '-'}
              </Attr>
              <Attr label="Correlation" mono>
                {event.correlation_id || '-'}
              </Attr>
              <Attr label="Organization" mono>
                {event.organization_id || '-'}
              </Attr>
              <Attr label="Application" mono>
                {event.application_id || '-'}
              </Attr>
              <Attr label="User" mono>
                {event.user_id || '-'}
              </Attr>
              <Attr label="Operation" mono>
                {event.operation || '-'}
              </Attr>
              <Attr label="Classification">
                {event.data_classification || '-'}
              </Attr>
              <Attr label="Latency">
                {typeof event.latency_ms === 'number'
                  ? `${event.latency_ms} ms`
                  : '-'}
              </Attr>
            </dl>
          </section>

          <section className="audit-detail-section">
            <h3 className="audit-detail-section-title">Decisions</h3>
            <dl className="audit-detail-attrs">
              <Attr label="Policy">
                <StatusBadge
                  variant="badge"
                  status={event.policy_decision ?? '-'}
                />
              </Attr>
              <Attr label="Response">
                <StatusBadge
                  variant="badge"
                  status={event.response_decision ?? '-'}
                />
              </Attr>
              <Attr label="Model" mono>
                {event.model_selected || '-'}
              </Attr>
              <Attr label="Provider" mono>
                {event.provider || '-'}
              </Attr>
              <Attr label="Input transform" mono>
                {event.input_transformation || '-'}
              </Attr>
              <Attr label="Response transform" mono>
                {event.response_transformation || '-'}
              </Attr>
              <Attr label="Reasons">{reasons || '-'}</Attr>
            </dl>
          </section>

          <section className="audit-detail-section">
            <h3 className="audit-detail-section-title">Decision binding</h3>
            <dl className="audit-detail-attrs">
              <Attr label="Decision">
                {event.evaluation_id ? (
                  <Link
                    href={`/evaluations/${event.evaluation_id}`}
                    className="table-link"
                  >
                    {event.evaluation_id}
                  </Link>
                ) : (
                  <span className="muted">None</span>
                )}
              </Attr>
              <Attr label="Decision hash">
                <HashValue value={event.decision_hash} />
              </Attr>
            </dl>
          </section>

          <section className="audit-detail-section">
            <h3 className="audit-detail-section-title">Integrity</h3>
            <dl className="audit-detail-attrs">
              <Attr label="Response hash">
                <HashValue value={event.response_hash} />
              </Attr>
              <Attr label="Event hash">
                <HashValue value={event.event_hash} />
              </Attr>
              <Attr label="Previous hash">
                <HashValue value={event.prev_event_hash} />
              </Attr>
              <Attr label="Signature">
                <HashValue value={event.integrity_signature} />
              </Attr>
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}
