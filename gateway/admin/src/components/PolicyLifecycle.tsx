'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

async function proxyJson(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api/proxy/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message ?? `Request failed (${res.status})`,
    );
  }
  return data;
}

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
  const [simClass, setSimClass] = useState('PHI');
  const [simModel, setSimModel] = useState('cloud-public-gpt');

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await fn();
      setInfo(`${label}: ${JSON.stringify(result).slice(0, 280)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
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
          onClick={() =>
            run('Validate', () =>
              proxyJson(`policies/${policyId}/validate`, 'POST', {}),
            )
          }
        >
          Validate
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
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
          disabled={busy || status === 'suspended' || status === 'disabled'}
          onClick={() =>
            run('Suspend', () =>
              proxyJson(`policies/${policyId}/suspend`, 'POST', {}),
            )
          }
        >
          Suspend
        </button>
      </div>

      <div className="form-grid">
        <div className="panel-header">Simulate (no model execution)</div>
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
          onClick={() =>
            run('Simulate', () =>
              proxyJson(`policies/${policyId}/simulate`, 'POST', {
                classification: simClass,
                requested_model: simModel,
                application_type: 'clinical',
                roles: ['clinician'],
              }),
            )
          }
        >
          Run simulation
        </button>
      </div>

      {interpreter ? (
        <p className="muted">
          Interpreter: <code>{interpreter}</code>
        </p>
      ) : null}
      {info ? <pre className="mono sim-result">{info}</pre> : null}
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
