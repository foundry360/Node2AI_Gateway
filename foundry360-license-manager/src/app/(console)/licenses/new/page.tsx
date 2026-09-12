'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Customer = { id: string; name: string };
type Deployment = {
  id: string;
  customerId: string;
  customerName: string;
  deploymentId: string;
  deploymentType: string;
  description: string | null;
};

function CreateLicenseForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [customerId, setCustomerId] = useState(params.get('customerId') || '');
  const [deploymentDbId, setDeploymentDbId] = useState(params.get('deploymentId') || '');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetch('/api/customers'), fetch('/api/deployments')]).then(
      async ([c, d]) => {
        const cj = await c.json();
        const dj = await d.json();
        setCustomers(cj.customers || []);
        setDeployments(dj.deployments || []);
      },
    );
  }, []);

  const filtered = useMemo(
    () =>
      deployments.filter((d) => !customerId || d.customerId === customerId),
    [deployments, customerId],
  );

  const selected = filtered.find((d) => d.id === deploymentDbId) || null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!selected) {
      setError('Select a registered deployment');
      return;
    }
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/licenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: selected.customerId,
        deploymentDbId: selected.id,
        licenseId: fd.get('licenseId'),
        validFrom: fd.get('validFrom'),
        validUntil: fd.get('validUntil'),
        graceDays: Number(fd.get('graceDays') || 30),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to create license');
      return;
    }
    router.push(`/licenses/${data.license.id}`);
  }

  return (
    <form className="card space-y-4 p-6" onSubmit={onSubmit}>
      <label className="field">
        Customer
        <select
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setDeploymentDbId('');
          }}
          required
        >
          <option value="">Select customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Deployment
        <select
          value={deploymentDbId}
          onChange={(e) => setDeploymentDbId(e.target.value)}
          required
        >
          <option value="">Select deployment…</option>
          {filtered.map((d) => (
            <option key={d.id} value={d.id}>
              {d.description || d.deploymentType} ({d.deploymentId.slice(0, 8)}…)
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="rounded-lg border border-line bg-brand-soft p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Deployment ID (from Enigma — not editable)
          </div>
          <div className="mono mt-1 break-all text-base font-semibold text-ink">
            {selected.deploymentId}
          </div>
          <div className="mt-2 text-sm text-muted">
            Type: <strong>{selected.deploymentType}</strong>
          </div>
        </div>
      )}

      <label className="field">
        License ID
        <input
          name="licenseId"
          className="mono"
          placeholder="ENIGMA-ACME-2026-001"
          required
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Valid From
          <input name="validFrom" type="date" required />
        </label>
        <label className="field">
          Valid Until
          <input name="validUntil" type="date" required />
        </label>
      </div>
      <label className="field">
        Grace Days
        <input name="graceDays" type="number" min={0} max={3650} defaultValue={30} required />
      </label>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button className="btn" type="submit">
        Create Draft License
      </button>
    </form>
  );
}

export default function NewLicensePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Create License</h1>
      </div>
      <Suspense>
        <CreateLicenseForm />
      </Suspense>
    </div>
  );
}
