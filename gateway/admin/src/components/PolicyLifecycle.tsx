'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { proxyJson } from '@/lib/client-api';
import { formatReasonCodes } from '@/lib/reason-codes';
import { StatusBadge } from '@/components/StatusBadge';

type Decision = {
  decision?: string;
  reason?: string;
  reason_codes?: string[];
  obligations?: Array<{ code: string; parameters?: Record<string, unknown> }>;
  explanation?: string;
  evidence?: unknown;
  applicable_policies?: string[];
  eligible_models?: string[];
};

export function PolicyLifecycleActions({
  policyId,
  status,
  interpreter,
}: {
  policyId: string;
  status: string;
  interpreter?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validateResult, setValidateResult] = useState<Record<string, unknown> | null>(
    null,
  );

  const canApprove = ['draft', 'review', 'suspended', 'active', 'approved'].includes(
    status,
  );
  const canActivate = status === 'approved' || status === 'active';
  const canSuspend = status === 'active' || status === 'approved';
  const canRetire = status === 'suspended' || status === 'disabled' || status === 'draft';

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await fn();
      setInfo(`${label} succeeded`);
      router.refresh();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-tight">
      <div className="action-row">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={async () => {
            const result = (await run('Validate', () =>
              proxyJson(`policies/${policyId}/validate`, 'POST', {}),
            )) as Record<string, unknown> | null;
            if (result) setValidateResult(result);
          }}
        >
          Validate
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !canApprove || status === 'retired'}
          onClick={() =>
            run('Approve', () =>
              proxyJson(`policies/${policyId}/approve`, 'POST', {}),
            )
          }
        >
          Approve
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !canActivate}
          onClick={() =>
            run('Activate', () =>
              proxyJson(`policies/${policyId}/activate`, 'POST', {}),
            )
          }
        >
          Activate
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !canSuspend}
          onClick={() =>
            run('Suspend', () =>
              proxyJson(`policies/${policyId}/suspend`, 'POST', {}),
            )
          }
        >
          Suspend
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy || !canRetire}
          onClick={() =>
            run('Retire', () =>
              proxyJson(`policies/${policyId}/retire`, 'POST', {}),
            )
          }
        >
          Retire
        </button>
      </div>
      {validateResult ? (
        <div className="info-banner">
          Validate: {validateResult.ok ? 'ok' : 'failed'}
          {Array.isArray(validateResult.errors) && validateResult.errors.length
            ? ` — ${(validateResult.errors as string[]).join('; ')}`
            : ''}
        </div>
      ) : null}
      {interpreter ? (
        <p className="muted">
          Interpreter: <code className="mono">{interpreter}</code>
        </p>
      ) : null}
      {info ? <div className="info-banner">{info}</div> : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

export function PolicySimulatePanel({ policyId }: { policyId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [simClass, setSimClass] = useState('PHI');
  const [simModel, setSimModel] = useState('cloud-public-gpt');
  const [simResult, setSimResult] = useState<Decision | null>(null);

  return (
    <div className="stack-tight">
      <p className="muted">
        What-if evaluation against the pack-backed PDP. No model is executed.
      </p>
      <div className="form-grid" style={{ padding: 0 }}>
        <label>
          Classification
          <select value={simClass} onChange={(e) => setSimClass(e.target.value)}>
            <option value="Internal">Internal</option>
            <option value="PII">PII</option>
            <option value="PHI">PHI</option>
            <option value="Credential">Credential</option>
            <option value="FINANCIAL">FINANCIAL</option>
            <option value="LEGAL">LEGAL</option>
          </select>
        </label>
        <label>
          Requested model
          <select value={simModel} onChange={(e) => setSimModel(e.target.value)}>
            <option value="local-general-v1">local-general-v1</option>
            <option value="cloud-public-gpt">cloud-public-gpt</option>
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const result = (await proxyJson(`policies/${policyId}/simulate`, 'POST', {
                classification: simClass,
                requested_model: simModel,
                application_type: 'clinical',
                roles: ['clinician'],
              })) as { decision?: Decision };
              setSimResult(result.decision ?? null);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          Run simulation
        </button>
      </div>
      {simResult ? (
        <div className="decision-card">
          <div className="decision-row">
            <strong>Decision</strong>
            <StatusBadge status={simResult.decision ?? '—'} />
          </div>
          {simResult.reason ? <p className="muted">{simResult.reason}</p> : null}
          <div>
            <div className="muted" style={{ marginBottom: '0.35rem' }}>
              Reason codes
            </div>
            <div>
              {formatReasonCodes(simResult.reason_codes) || '—'}
            </div>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: '0.35rem' }}>
              Obligations
            </div>
            {(simResult.obligations ?? []).length === 0 ? (
              <span className="muted">None</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {(simResult.obligations ?? []).map((o, i) => (
                  <li key={`${o.code}-${i}`} className="mono">
                    {o.code}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {simResult.explanation ? (
            <p className="muted">{simResult.explanation}</p>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

/** @deprecated Legacy rules JSON editor — metadata only, not EPA architecture. */
export function LegacyRulesEditor({
  policyId,
  rulesJson,
}: {
  policyId: string;
  rulesJson: string;
}) {
  const router = useRouter();
  const [rules, setRules] = useState(rulesJson);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen(true)}
      >
        Show deprecated rules JSON
      </button>
    );
  }

  return (
    <div className="stack-tight">
      <p className="muted">
        Deprecated: rules JSON is operator metadata only. Binding decisions come from
        Enigma policy packs / PDP.
      </p>
      <label>
        Rules JSON (saves as new legacy store version)
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          rows={6}
          className="mono"
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          setError(null);
          try {
            const parsed = JSON.parse(rules);
            await proxyJson(`policies/${policyId}`, 'PATCH', { rules: parsed });
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON');
          }
        }}
      >
        Save legacy metadata version
      </button>
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
