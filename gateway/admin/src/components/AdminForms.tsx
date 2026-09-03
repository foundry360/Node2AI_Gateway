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
    throw new Error(data.message ?? `Request failed (${res.status})`);
  }
  return data;
}

export function CreateApplicationForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        try {
          await proxyJson('applications', 'POST', {
            name: fd.get('name'),
            type: fd.get('type'),
            trust_level: fd.get('trust_level'),
            allowed_models: fd.get('allowed_models'),
            allowed_operations: fd.get('allowed_operations'),
            allowed_datasets: fd.get('allowed_datasets'),
          });
          e.currentTarget.reset();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="panel-header">Create application</div>
      {error ? <div className="error">{error}</div> : null}
      <label>
        Name
        <input name="name" required placeholder="Pilot App" />
      </label>
      <label>
        Type
        <input name="type" defaultValue="custom" />
      </label>
      <label>
        Trust level
        <select name="trust_level" defaultValue="standard">
          <option value="trusted">trusted</option>
          <option value="standard">standard</option>
          <option value="untrusted">untrusted</option>
        </select>
      </label>
      <label>
        Allowed models (comma-separated)
        <input name="allowed_models" defaultValue="local-general-v1" />
      </label>
      <label>
        Allowed operations
        <input name="allowed_operations" defaultValue="summarize,generate" />
      </label>
      <label>
        Allowed datasets
        <input name="allowed_datasets" placeholder="ds_clinical_notes" />
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Creating…' : 'Create application'}
      </button>
    </form>
  );
}

export function ApplicationActions({
  applicationId,
  status,
}: {
  applicationId: string;
  status: string;
}) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="action-row">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          setError(null);
          try {
            const next = status === 'active' ? 'suspended' : 'active';
            await proxyJson(`applications/${applicationId}`, 'PATCH', { status: next });
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
          }
        }}
      >
        {status === 'active' ? 'Disable' : 'Enable'}
      </button>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          setError(null);
          setSecret(null);
          try {
            const data = await proxyJson('api-keys', 'POST', {
              application_id: applicationId,
            });
            setSecret(data.secret as string);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
          }
        }}
      >
        Issue API key
      </button>
      {secret ? (
        <div className="secret-once">
          New key (copy now): <code className="mono">{secret}</code>
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

export function PolicyActions({
  policyId,
  status,
  rulesJson,
}: {
  policyId: string;
  status: string;
  rulesJson: string;
}) {
  const router = useRouter();
  const [rules, setRules] = useState(rulesJson);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack-tight">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          setError(null);
          try {
            await proxyJson(`policies/${policyId}`, 'PATCH', {
              status: status === 'active' ? 'disabled' : 'active',
            });
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
          }
        }}
      >
        {status === 'active' ? 'Disable' : 'Enable'}
      </button>
      <label>
        Rules JSON (saves as new version)
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          rows={6}
          className="mono"
        />
      </label>
      <button
        type="button"
        className="btn"
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
        Save new version
      </button>
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

export function ModelActions({
  modelId,
  status,
}: {
  modelId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="action-row">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          setError(null);
          try {
            await proxyJson(`models/${modelId}`, 'PATCH', {
              status: status === 'active' ? 'disabled' : 'active',
            });
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
          }
        }}
      >
        {status === 'active' ? 'Disable' : 'Enable'}
      </button>
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

export function RegisterModelForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        try {
          await proxyJson('models', 'POST', {
            model_id: fd.get('model_id'),
            name: fd.get('name'),
            provider_id: fd.get('provider_id'),
            kind: fd.get('kind'),
          });
          e.currentTarget.reset();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="panel-header">Register model</div>
      {error ? <div className="error">{error}</div> : null}
      <label>
        Model ID
        <input name="model_id" required placeholder="local-special-v1" />
      </label>
      <label>
        Name
        <input name="name" required placeholder="Local Special" />
      </label>
      <label>
        Provider ID
        <input name="provider_id" defaultValue="local-runtime" />
      </label>
      <label>
        Kind
        <select name="kind" defaultValue="local">
          <option value="local">local</option>
          <option value="private">private</option>
          <option value="cloud">cloud</option>
        </select>
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Saving…' : 'Register'}
      </button>
    </form>
  );
}

export function ApiKeyRevoke({ apiKeyId }: { apiKeyId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={async () => {
        await proxyJson(`api-keys/${apiKeyId}/revoke`, 'POST', {});
        router.refresh();
      }}
    >
      Revoke
    </button>
  );
}
