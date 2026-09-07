'use client';

import { useCallback, useState, type ReactNode } from 'react';
import {
  AuditDetailDrawer,
  type AuditEventDetail,
} from '@/components/AuditDetailDrawer';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDisplayDateTime } from '@/lib/display-datetime';
import { formatFieldLabel } from '@/lib/field-label';

/**
 * Verified Gateway enforcement vs expected action.
 * Decision identity is in the hero; policy controls are in Policy Contributions.
 */

type Consequence = {
  action_summary: string;
  expected_action?: string;
  controls_applied?: boolean;
  requires_review?: boolean;
};

type Enforcement = {
  status: string;
  verified: boolean;
  attempted: boolean;
  expected_action?: string;
  action_attempted?: string;
  gateway_report?: string;
  request_id?: string;
  audit_id?: string;
  occurred_at?: string;
  summary?: string;
  safety_fallback?: boolean;
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

function gatewayResultLabel(enforcement?: Enforcement | null): string {
  if (!enforcement) return '-';
  if (enforcement.status === 'NOT_EXECUTED') return '-';
  if (enforcement.status === 'UNKNOWN' && !enforcement.attempted) return '-';
  if (enforcement.gateway_report) return enforcement.gateway_report;
  return enforcement.status;
}

function GatewayResultView({
  enforcement,
}: {
  enforcement?: Enforcement | null;
}) {
  const label = gatewayResultLabel(enforcement);
  if (label === '-') return <>-</>;

  const report = enforcement?.gateway_report?.trim();
  if (report && report.includes('=')) {
    const parts = report
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);
    return (
      <span className="gateway-result-badges">
        {parts.map((part, i) => {
          const eq = part.indexOf('=');
          if (eq <= 0) {
            return (
              <span key={`${part}-${i}`} className="gateway-result-part">
                {i > 0 ? <span className="muted">; </span> : null}
                <StatusBadge variant="badge" status={part} />
              </span>
            );
          }
          const key = part.slice(0, eq);
          const value = part.slice(eq + 1);
          return (
            <span key={`${key}-${i}`} className="gateway-result-part">
              {i > 0 ? <span className="muted">; </span> : null}
              <span className="muted mono">{key}=</span>
              <StatusBadge variant="badge" status={value} />
            </span>
          );
        })}
      </span>
    );
  }

  return <StatusBadge variant="badge" status={label} />;
}

function verificationLabel(enforcement?: Enforcement | null): string {
  if (!enforcement) return 'UNVERIFIED';
  if (enforcement.status === 'FAILED') return 'FAILED';
  if (enforcement.status === 'NOT_EXECUTED') return 'NOT_EXECUTED';
  if (
    enforcement.verified &&
    (enforcement.status === 'ALLOWED' ||
      enforcement.status === 'CONTROLS_APPLIED' ||
      enforcement.status === 'BLOCKED')
  ) {
    return 'VERIFIED';
  }
  return 'UNVERIFIED';
}

async function loadAuditEvent(opts: {
  auditId?: string;
  requestId?: string;
}): Promise<AuditEventDetail> {
  const res = await fetch('/api/proxy/audit?limit=200', { cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as {
    events?: AuditEventDetail[];
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? `Failed to load audit (${res.status})`);
  }
  const events = data.events ?? [];
  if (opts.auditId) {
    const match = events.find((e) => e.audit_id === opts.auditId);
    if (!match) throw new Error('Observability event not found in recent trail');
    return match;
  }
  if (opts.requestId) {
    const match = events.find((e) => e.request_id === opts.requestId);
    if (!match) throw new Error('No observability event found for this request');
    return match;
  }
  throw new Error('No audit reference available');
}

export function DecisionConsequencePanel({
  humanDisposition,
  consequence,
  enforcement,
  executionMode,
}: {
  decision?: string;
  finalDecision?: string | null;
  humanDisposition?: string | null;
  consequence: Consequence;
  enforcement?: Enforcement | null;
  requiredControls?: string[];
  executionMode?: 'simulation' | 'live';
}) {
  const expected =
    enforcement?.expected_action ?? consequence.expected_action ?? '-';
  const verification = verificationLabel(enforcement);
  const isSimulation =
    executionMode === 'simulation' || enforcement?.status === 'NOT_EXECUTED';
  const showAuthorizeNote =
    humanDisposition === 'AUTHORIZE' && executionMode === 'live';

  const [auditEvent, setAuditEvent] = useState<AuditEventDetail | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const closeAudit = useCallback(() => {
    setAuditEvent(null);
    setAuditError(null);
  }, []);

  const openAudit = useCallback(async () => {
    if (!enforcement?.audit_id && !enforcement?.request_id) return;
    setAuditBusy(true);
    setAuditError(null);
    try {
      const event = await loadAuditEvent({
        auditId: enforcement.audit_id,
        requestId: enforcement.audit_id ? undefined : enforcement.request_id,
      });
      setAuditEvent(event);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Failed to open observability');
    } finally {
      setAuditBusy(false);
    }
  }, [enforcement?.audit_id, enforcement?.request_id]);

  const canOpenAudit = Boolean(enforcement?.audit_id || enforcement?.request_id);

  return (
    <>
      <section
        className="section-card consequence-card"
        aria-labelledby="consequence-heading"
      >
        <div className="section-card-header">
          <h3 id="consequence-heading">Enforcement Consequence</h3>
        </div>
        {isSimulation ? (
          <p className="muted decision-panel-lede">
            Simulation - Gateway not executed.
          </p>
        ) : null}

        <div className="contribution-attrs">
          <AttrRow label="Expected">
            <span>
              {formatFieldLabel(expected)}
              {consequence.action_summary ? (
                <span className="muted">
                  {' '}
                  - {formatFieldLabel(consequence.action_summary)}
                </span>
              ) : null}
            </span>
          </AttrRow>
          <AttrRow label="Result">
            <GatewayResultView enforcement={enforcement} />
          </AttrRow>
          <AttrRow label="Verification">
            <span className="contribution-policy-value">
              <StatusBadge variant="badge" status={verification} />
              {enforcement?.safety_fallback ? (
                <span className="muted">Safety hold (not a policy DENY)</span>
              ) : null}
            </span>
          </AttrRow>
          {enforcement?.summary ? (
            <AttrRow label="Detail">{enforcement.summary}</AttrRow>
          ) : null}
          {enforcement?.occurred_at ? (
            <AttrRow label="Occurred" mono>
              {formatDisplayDateTime(enforcement.occurred_at)}
            </AttrRow>
          ) : null}
          <AttrRow label="Observability">
            {canOpenAudit ? (
              <span>
                <button
                  type="button"
                  className="table-link audit-open-btn"
                  onClick={() => void openAudit()}
                  disabled={auditBusy}
                >
                  {auditBusy ? 'Opening…' : 'Open Observability'}
                </button>
                <span className="mono muted">
                  {' '}
                  ({enforcement?.audit_id ?? enforcement?.request_id})
                </span>
                {auditError ? (
                  <span className="error" style={{ display: 'block', marginTop: '0.25rem' }}>
                    {auditError}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="muted">-</span>
            )}
          </AttrRow>
          {showAuthorizeNote ? (
            <AttrRow label="Note">
              <span className="muted">
                AUTHORIZE sets final ALLOW; Gateway result reflects resume, not
                authorization alone.
              </span>
            </AttrRow>
          ) : null}
        </div>
      </section>
      <AuditDetailDrawer event={auditEvent} onClose={closeAudit} />
    </>
  );
}
