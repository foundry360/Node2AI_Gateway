'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';

export function ModelRegisterDrawer({
  label = 'Register model',
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
            aria-label="Close register panel"
            onClick={() => setOpen(false)}
          />
          <aside
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-model-title"
          >
            <div className="drawer-header">
              <div>
                <h2 id="register-model-title" className="drawer-title">
                  Register model
                </h2>
                <p className="drawer-sub">
                  Make a model available for policy evaluation and routing.
                </p>
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
                  await proxyJson('models', 'POST', {
                    model_id: fd.get('model_id'),
                    name: fd.get('name'),
                    provider_id: fd.get('provider_id'),
                    kind: fd.get('kind'),
                  });
                  form.reset();
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to register');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="drawer-form">
                {error ? <div className="error">{error}</div> : null}

                <label>
                  Model ID
                  <input name="model_id" required placeholder="local-special-v1" />
                </label>
                <label>
                  Name
                  <input name="name" required placeholder="Local Special" />
                </label>
                <label>
                  Provider ID
                  <input name="provider_id" defaultValue="local-runtime" />
                </label>
                <label>
                  Kind
                  <select name="kind" defaultValue="local">
                    <option value="local">local</option>
                    <option value="private">private</option>
                    <option value="cloud">cloud</option>
                  </select>
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
                  {busy ? 'Saving…' : 'Register'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
