'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminCapabilities } from '@/hooks/useAdminCapabilities';

/**
 * Administrator-only upload of a Foundry360-issued signed license.
 * Does not generate, sign, or edit license claims.
 */
export function LicenseInstallPanel() {
  const router = useRouter();
  const { canMutateAdmin, role } = useAdminCapabilities();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showInstall = role === null || canMutateAdmin;
  const canSubmit = role === null || canMutateAdmin;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        setOpen(false);
        setFile(null);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, busy]);

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function installLicense() {
    setError(null);
    if (!file) {
      setError('Attach an enigma.license file');
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const res = await fetch('/api/proxy/license/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ license_document: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        reason_code?: string;
        license?: { license_id?: string };
      };
      if (!res.ok) {
        throw new Error(
          data.message ?? data.reason_code ?? `Install failed (${res.status})`,
        );
      }
      setOk(
        `License ${data.license?.license_id ?? ''} installed — status ${data.status}`,
      );
      setOpen(false);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setBusy(false);
    }
  }

  if (!showInstall) {
    return (
      <p className="muted license-install-note">
        License installation requires an Administrator role.
      </p>
    );
  }

  return (
    <div className="license-install">
      <button
        type="button"
        className="btn"
        disabled={!canSubmit}
        onClick={() => {
          setOk(null);
          setError(null);
          setFile(null);
          setOpen(true);
        }}
      >
        Install License
      </button>
      {ok ? <p className="license-install-success">{ok}</p> : null}

      {open ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="modal-card license-install-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-install-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="license-install-title" className="modal-title">
              Install License
            </h2>
            <p className="muted license-install-note">
              Upload a signed Enigma license.
            </p>
            {error ? <div className="error">{error}</div> : null}

            <label className="modal-field">
              License file
              <input
                ref={fileInputRef}
                type="file"
                name="license"
                accept=".license,text/plain,application/jose"
                disabled={busy || !canSubmit}
                onChange={(e) => {
                  setError(null);
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
            </label>
            {file ? (
              <p className="mono license-install-filename">{file.name}</p>
            ) : (
              <p className="muted license-install-filename">No file attached</p>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !canSubmit || !file}
                onClick={() => void installLicense()}
              >
                {busy ? 'Installing…' : 'Install'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
