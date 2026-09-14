'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';

export function ToolRegisterDrawer({
  organizationId = 'org_demo',
  label = 'Register tool',
}: {
  organizationId?: string;
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
            aria-labelledby="register-tool-title"
          >
            <div className="drawer-header">
              <div>
                <h2 id="register-tool-title" className="drawer-title">
                  Register tool
                </h2>
                <p className="drawer-sub">
                  Make a tool available for policy evaluation and agent grants.
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
                const opsRaw = String(fd.get('operations') ?? '');
                const operations = opsRaw
                  .split(/[\n,]/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                setBusy(true);
                setError(null);
                try {
                  await proxyJson('tools', 'POST', {
                    tool_id: fd.get('tool_id'),
                    name: fd.get('name'),
                    organization_id: fd.get('organization_id') || organizationId,
                    operations,
                    status: 'ACTIVE',
                  });
                  form.reset();
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : 'Failed to register',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="drawer-form">
                {error ? <div className="error">{error}</div> : null}
                <label>
                  Tool ID
                  <input name="tool_id" required placeholder="tool_claims_system" />
                </label>
                <label>
                  Name
                  <input name="name" required placeholder="Claims System" />
                </label>
                <input type="hidden" name="organization_id" value={organizationId} />
                <label>
                  Operations
                  <textarea
                    name="operations"
                    rows={4}
                    required
                    placeholder={'read_claim\nget_member\nupdate_claim'}
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
