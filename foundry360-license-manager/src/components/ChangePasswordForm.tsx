'use client';

import { FormEvent, useState } from 'react';

export function ChangePasswordForm() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: fd.get('currentPassword'),
        newPassword: fd.get('newPassword'),
        confirmPassword: fd.get('confirmPassword'),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || 'Failed to change password');
      return;
    }
    setSuccess('Password updated successfully.');
    e.currentTarget.reset();
  }

  return (
    <form className="card space-y-4 p-6" onSubmit={onSubmit}>
      <label className="field">
        Current password
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="field">
        New password
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="field">
        Confirm new password
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {success && <p className="text-sm text-emerald-700">{success}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Updating…' : 'Change password'}
      </button>
    </form>
  );
}
