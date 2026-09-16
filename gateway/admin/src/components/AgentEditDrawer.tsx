'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { SelectDropdown } from '@/components/SelectDropdown';

type AppOption = {
  application_id: string;
  name: string;
  organization_id?: string;
};

export type EditableAgent = {
  agent_id: string;
  name: string;
  status: string;
  autonomy_level: string;
  application_id?: string;
};

export function AgentEditDrawer({
  agent,
  applications,
  open,
  onOpenChange,
}: {
  agent: EditableAgent;
  applications: AppOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(agent.name);
  const [autonomy, setAutonomy] = useState(agent.autonomy_level);
  const [applicationId, setApplicationId] = useState(
    agent.application_id ?? applications[0]?.application_id ?? '',
  );

  useEffect(() => {
    if (!open) return;
    setName(agent.name);
    setAutonomy(agent.autonomy_level);
    setApplicationId(
      agent.application_id ?? applications[0]?.application_id ?? '',
    );
    setError(null);
  }, [open, agent, applications]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="drawer-root" role="presentation">
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close edit panel"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-agent-title"
      >
        <div className="drawer-header">
          <div>
            <h2 id="edit-agent-title" className="drawer-title">
              Edit agent
            </h2>
            <p className="drawer-sub mono">{agent.agent_id}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <form
          className="drawer-shell"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await proxyJson(`agents/${encodeURIComponent(agent.agent_id)}`, 'PATCH', {
                name,
                autonomy_level: autonomy,
                application_id: applicationId || undefined,
              });
              onOpenChange(false);
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
              Agent ID
              <input value={agent.agent_id} disabled readOnly />
            </label>
            <label>
              Name
              <input
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <SelectDropdown
              label="Application"
              value={applicationId}
              onChange={setApplicationId}
              options={applications.map((a) => ({
                value: a.application_id,
                label: `${a.name} (${a.application_id})`,
              }))}
            />
            <SelectDropdown
              label="Autonomy"
              value={autonomy}
              onChange={setAutonomy}
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
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
