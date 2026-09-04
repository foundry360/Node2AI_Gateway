'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';

export function ApplicationCardMenu({
  applicationId,
  name,
}: {
  applicationId: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function rename() {
    const next = renameValue.trim();
    if (!next) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await proxyJson(`applications/${applicationId}`, 'PATCH', { name: next });
      setRenameOpen(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete application “${name}”? It will be suspended and hidden from this list.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await proxyJson(`applications/${applicationId}`, 'PATCH', {
        status: 'suspended',
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn card-menu-trigger"
        aria-label="Application actions"
        aria-expanded={open}
        disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={18} strokeWidth={1.75} />
      </button>
      {open ? (
        <div className="card-menu-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setRenameValue(name);
              setError(null);
              setRenameOpen(true);
              setOpen(false);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              router.push(`/applications/${applicationId}`);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void remove();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}

      {renameOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !busy && setRenameOpen(false)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`rename-${applicationId}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={`rename-${applicationId}`} className="modal-title">
              Rename application
            </h2>
            <p className="muted" style={{ margin: '0 0 0.85rem' }}>
              Update the display name for this application.
            </p>
            {error ? <div className="error">{error}</div> : null}
            <label className="modal-field">
              Name
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void rename();
                }}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void rename()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
