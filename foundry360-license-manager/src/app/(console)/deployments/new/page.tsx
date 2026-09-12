'use client';

import { FormEvent, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Customer = { id: string; name: string };

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState('');
  const preselect = params.get('customerId') || '';

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/deployments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: fd.get('customerId'),
        deploymentId: fd.get('deploymentId'),
        deploymentType: fd.get('deploymentType'),
        environment: fd.get('environment'),
        description: fd.get('description') || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to register deployment');
      return;
    }
    router.push(`/deployments/${data.deployment.id}`);
  }

  return (
    <form className="card space-y-4 p-6" onSubmit={onSubmit}>
      <label className="field">
        Customer
        <select name="customerId" required defaultValue={preselect}>
          <option value="">Select customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Deployment ID
        <input
          name="deploymentId"
          className="mono"
          placeholder="UUID from Enigma System → Deployment"
          required
        />
      </label>
      <label className="field">
        Deployment Type
        <select name="deploymentType" required defaultValue="VPC">
          <option value="VPC">VPC</option>
          <option value="AIR_GAPPED">AIR_GAPPED</option>
        </select>
      </label>
      <label className="field">
        Environment
        <select name="environment" required defaultValue="PRODUCTION">
          <option value="PRODUCTION">PRODUCTION</option>
          <option value="NON_PRODUCTION">NON_PRODUCTION</option>
        </select>
      </label>
      <label className="field">
        Description
        <input name="description" placeholder="e.g. Production VPC" />
      </label>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button className="btn" type="submit">
        Register Deployment
      </button>
    </form>
  );
}

export default function NewDeploymentPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Register Deployment</h1>
      </div>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
