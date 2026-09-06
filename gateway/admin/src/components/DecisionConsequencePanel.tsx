'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { formatFieldLabel } from '@/lib/field-label';

/**
 * Expected action vs verified Gateway enforcement.
 * Does not restate human-resolution form details (see DecisionReviewPanel).
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

function gatewayResultLabel(enforcement?: Enforcement | null): string {
  if (!enforcement) return '—';
  if (enforcement.status === 'NOT_EXECUTED') return '—';
  if (enforcement.status === 'UNKNOWN' && !enforcement.attempted) return '—';
  if (enforcement.gateway_report) return enforcement.gateway_report;
  return enforcement.status;
}

function verificationLabel(enforcement?: Enforcement | null): string {
  if (!enforcement) return 'UNKNOWN';
  if (enforcement.status === 'NOT_EXECUTED') return 'NOT_EXECUTED';
  if (enforcement.verified) return 'VERIFIED';
  if (enforcement.status === 'FAILED') return 'FAILED';
  return 'UNKNOWN';
}

export function DecisionConsequencePanel({
  decision,
  finalDecision,
  humanDisposition,
  consequence,
  enforcement,
  requiredControls,
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
    enforcement?.expected_action ?? consequence.expected_action ?? '—';
  const gatewayResult = gatewayResultLabel(enforcement);
  const verification = verificationLabel(enforcement);
  const isSimulation = executionMode === 'simulation' || enforcement?.status === 'NOT_EXECUTED';

  return (
    <section className="panel panel-pad" aria-labelledby="consequence-heading">
      <h3 id="consequence-heading" className="section-title">
        3. Decision → 5. Enforcement
      </h3>
      <p className="muted">
        {isSimulation
          ? 'Simulation: decision evaluated; Gateway action was not executed.'
          : 'Live: expected action is governance intent; Gateway result and verification come from operational audit when correlated.'}
      </p>
      <dl className="definition-list">
        <div>
          <dt>Machine decision</dt>
          <dd className="mono">{decision ?? '—'}</dd>
        </div>
        {humanDisposition ? (
          <div>
            <dt>Human resolution</dt>
            <dd className="mono">{humanDisposition}</dd>
          </div>
        ) : null}
        <div>
          <dt>Final decision</dt>
          <dd className="mono">
            {finalDecision ?? decision ?? '—'}
            {!humanDisposition && !finalDecision ? (
              <span className="muted"> — same as machine (no human resolution)</span>
            ) : null}
            {humanDisposition && finalDecision && finalDecision !== decision ? (
              <span className="muted"> — after human resolution</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Expected action</dt>
          <dd>
            <span>{formatFieldLabel(expected)}</span>
            {consequence.action_summary ? (
              <span className="muted">
                {' '}
                — {formatFieldLabel(consequence.action_summary)}
              </span>
            ) : null}
          </dd>
        </div>
        {requiredControls && requiredControls.length > 0 ? (
          <div>
            <dt>Required controls</dt>
            <dd className="mono">{requiredControls.join(', ')}</dd>
          </div>
        ) : null}
        <div>
          <dt>Gateway result</dt>
          <dd className="mono">{gatewayResult}</dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>
            <StatusBadge variant="badge" status={verification} />
            {enforcement?.safety_fallback ? (
              <span className="muted"> — safety hold (not a policy DENY)</span>
            ) : null}
          </dd>
        </div>
        {executionMode === 'live' && consequence.requires_review === false ? (
          <div>
            <dt>Note</dt>
            <dd className="muted">
              AUTHORIZE sets final ALLOW; Gateway result and verification reflect resume execution,
              not authorization alone.
            </dd>
          </div>
        ) : null}
        {enforcement?.summary ? (
          <div>
            <dt>Enforcement detail</dt>
            <dd>{enforcement.summary}</dd>
          </div>
        ) : null}
        {enforcement?.occurred_at ? (
          <div>
            <dt>Occurred</dt>
            <dd className="mono">{enforcement.occurred_at}</dd>
          </div>
        ) : null}
      </dl>
      {enforcement?.audit_id ? (
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Operational evidence:{' '}
          <Link href="/audit" className="table-link">
            Audit
          </Link>
          <span className="mono"> ({enforcement.audit_id})</span>
        </p>
      ) : (
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          No correlated Gateway audit for this evaluation
          {enforcement?.request_id ? (
            <>
              {' '}
              (<span className="mono">{enforcement.request_id}</span>)
            </>
          ) : null}
          .
        </p>
      )}
    </section>
  );
}
