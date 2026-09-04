'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';

export function ApplicationCreateDrawer({
  label = '+ New application',
}: {
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {label}
      </button>

      {open ? (
        <div className="drawer-root" role="presentation">
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close create panel"
            onClick={() => setOpen(false)}
          />
          <aside
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-app-title"
          >
            <div className="drawer-header">
              <div>
                <h2 id="create-app-title" className="drawer-title">
                  New application
                </h2>
                <p className="drawer-sub">Register a governed app for gateway access.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <form
              className="drawer-shell"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                setBusy(true);
                setError(null);
                try {
                  await proxyJson('applications', 'POST', {
                    name: fd.get('name'),
                    type: fd.get('type'),
                    environment: fd.get('environment'),
                    trust_level: fd.get('trust_level'),
                    allowed_models: fd.get('allowed_models'),
                    allowed_operations: fd.get('allowed_operations'),
                    allowed_datasets: fd.get('allowed_datasets'),
                  });
                  form.reset();
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to create');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="drawer-form">
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
                  Environment
                  <select name="environment" defaultValue="prod">
                    <option value="dev">dev</option>
                    <option value="staging">staging</option>
                    <option value="prod">prod</option>
                  </select>
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
                  Allowed operations (comma-separated)
                  <input name="allowed_operations" defaultValue="summarize,generate" />
                </label>
                <label>
                  Allowed datasets (comma-separated)
                  <input name="allowed_datasets" placeholder="ds_clinical_notes" />
                </label>
              </div>

              <div className="drawer-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Creating…' : 'Create application'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
