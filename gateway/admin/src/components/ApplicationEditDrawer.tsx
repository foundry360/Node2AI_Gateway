'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';

type App = {
  application_id: string;
  organization_id?: string;
  name: string;
  type: string;
  environment: string;
  status: string;
  trust_level: string;
  allowed_models: string[];
  allowed_datasets: string[];
  allowed_operations: string[];
};

export function ApplicationEditDrawer({ app }: { app: App }) {
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
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Edit
      </button>

      {open ? (
        <div className="drawer-root" role="presentation">
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close edit panel"
            onClick={() => setOpen(false)}
          />
          <aside
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-app-${app.application_id}`}
          >
            <div className="drawer-header">
              <div>
                <h2 id={`edit-app-${app.application_id}`} className="drawer-title">
                  Edit application
                </h2>
                <p className="drawer-sub mono">{app.application_id}</p>
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
                  await proxyJson(`applications/${app.application_id}`, 'PATCH', {
                    name: fd.get('name'),
                    type: fd.get('type'),
                    environment: fd.get('environment'),
                    status: fd.get('status'),
                    trust_level: fd.get('trust_level'),
                    allowed_models: fd.get('allowed_models'),
                    allowed_operations: fd.get('allowed_operations'),
                    allowed_datasets: fd.get('allowed_datasets'),
                  });
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to save');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="drawer-form">
                {error ? <div className="error">{error}</div> : null}

                <label>
                  Name
                  <input name="name" required defaultValue={app.name} />
                </label>
                <label>
                  Type
                  <input name="type" required defaultValue={app.type} />
                </label>
                <label>
                  Environment
                  <select name="environment" defaultValue={app.environment}>
                    <option value="dev">dev</option>
                    <option value="staging">staging</option>
                    <option value="prod">prod</option>
                  </select>
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={app.status}>
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                  </select>
                </label>
                <label>
                  Trust level
                  <select name="trust_level" defaultValue={app.trust_level}>
                    <option value="trusted">trusted</option>
                    <option value="standard">standard</option>
                    <option value="untrusted">untrusted</option>
                  </select>
                </label>
                <label>
                  Allowed models (comma-separated)
                  <input
                    name="allowed_models"
                    defaultValue={app.allowed_models.join(', ')}
                  />
                </label>
                <label>
                  Allowed operations (comma-separated)
                  <input
                    name="allowed_operations"
                    defaultValue={app.allowed_operations.join(', ')}
                  />
                </label>
                <label>
                  Allowed datasets (comma-separated)
                  <input
                    name="allowed_datasets"
                    defaultValue={app.allowed_datasets.join(', ')}
                  />
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
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
