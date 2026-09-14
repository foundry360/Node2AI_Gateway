'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { SelectDropdown } from '@/components/SelectDropdown';

type AppOption = { application_id: string; name: string; organization_id: string };

export function AgentRegisterDrawer({
  applications,
  label = 'Register agent',
}: {
  applications: AppOption[];
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
            aria-labelledby="register-agent-title"
          >
            <div className="drawer-header">
              <div>
                <h2 id="register-agent-title" className="drawer-title">
                  Register agent
                </h2>
                <p className="drawer-sub">
                  Make an agent available for policy evaluation and tool grants.
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
                const applicationId = String(fd.get('application_id') ?? '');
                const app = applications.find(
                  (a) => a.application_id === applicationId,
                );
                setBusy(true);
                setError(null);
                try {
                  await proxyJson('agents', 'POST', {
                    agent_id: fd.get('agent_id'),
                    name: fd.get('name'),
                    organization_id:
                      app?.organization_id || fd.get('organization_id'),
                    application_id: applicationId || undefined,
                    autonomy_level: fd.get('autonomy_level'),
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
                  Agent ID
                  <input
                    name="agent_id"
                    required
                    placeholder="agent_claims_processor"
                  />
                </label>
                <label>
                  Name
                  <input
                    name="name"
                    required
                    placeholder="Claims Processing Agent"
                  />
                </label>
                <SelectDropdown
                  label="Application"
                  name="application_id"
                  defaultValue={applications[0]?.application_id ?? ''}
                  options={applications.map((a) => ({
                    value: a.application_id,
                    label: `${a.name} (${a.application_id})`,
                  }))}
                />
                <SelectDropdown
                  label="Autonomy"
                  name="autonomy_level"
                  defaultValue="HUMAN_APPROVED"
                  options={[
                    { value: 'ASSISTIVE', label: 'Assistive' },
                    { value: 'HUMAN_APPROVED', label: 'Human approved' },
                    { value: 'AUTONOMOUS', label: 'Autonomous' },
                  ]}
                />
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
