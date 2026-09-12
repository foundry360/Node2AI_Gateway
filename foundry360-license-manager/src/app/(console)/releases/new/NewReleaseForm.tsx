'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewReleaseForm() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: fd.get('version'),
        releaseType: 'PRODUCTION',
        releaseNotes: fd.get('releaseNotes') || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to create release');
      return;
    }
    router.push(`/releases/${data.release.id}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Create Release</h1>
      </div>
      <form className="card space-y-4 p-6" onSubmit={onSubmit}>
        <label className="field">
          Version
          <input name="version" className="mono" placeholder="0.1.0" required />
        </label>
        <label className="field">
          Release notes
          <textarea name="releaseNotes" rows={5} />
        </label>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button className="btn" type="submit">
          Create Draft Release
        </button>
      </form>
    </div>
  );
}
