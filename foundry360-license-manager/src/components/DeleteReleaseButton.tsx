'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

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
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-muted transition hover:bg-slate-50 hover:text-ink disabled:opacity-50"
        disabled={busy}
        onClick={onDelete}
        aria-label={`Delete Enigma ${version}`}
        title={`Delete ${version}`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
