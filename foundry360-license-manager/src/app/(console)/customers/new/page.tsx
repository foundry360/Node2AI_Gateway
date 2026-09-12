'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCustomerPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        externalReference: fd.get('externalReference') || null,
        contactName: fd.get('contactName') || null,
        contactEmail: fd.get('contactEmail') || null,
        notes: fd.get('notes') || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to create customer');
      return;
    }
    router.push(`/customers/${data.customer.id}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Create Customer</h1>
      </div>
      <form className="card space-y-4 p-6" onSubmit={onSubmit}>
        <label className="field">
          Customer Name
          <input name="name" required />
        </label>
        <label className="field">
          External Reference
          <input name="externalReference" />
        </label>
        <label className="field">
          Contact Name
          <input name="contactName" />
        </label>
        <label className="field">
          Contact Email
          <input name="contactEmail" type="email" />
        </label>
        <label className="field">
          Notes
          <textarea name="notes" rows={3} />
        </label>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button className="btn" type="submit">
          Create Customer
        </button>
      </form>
    </div>
  );
}
