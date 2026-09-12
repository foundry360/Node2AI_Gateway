'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteReleaseButton({
  releaseId,
  version,
  redirectTo,
  compact = false,
}: {
  releaseId: string;
  version: string;
  /** When set, navigate here after delete (e.g. list page from detail). */
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onDelete() {
    const ok = window.confirm(
      `Delete Enigma ${version}?\n\nThis permanently removes the release record and any uploaded deployment packages.`,
    );
    if (!ok) return;

    setBusy(true);
    setError('');
    const res = await fetch(`/api/releases/${releaseId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.message || 'Delete failed');
      return;
    }
    if (redirectTo) {
      router.push(redirectTo);
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <div className={compact ? 'inline-flex flex-col items-end gap-1' : 'space-y-2'}>
      <button
        type="button"
        className={compact ? 'btn btn-danger px-3 py-1.5 text-xs' : 'btn btn-danger'}
        disabled={busy}
        onClick={onDelete}
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
