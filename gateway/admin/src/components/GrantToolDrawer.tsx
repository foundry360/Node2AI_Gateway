'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { SelectDropdown } from '@/components/SelectDropdown';

type ToolOption = {
  tool_id: string;
  name: string;
  operations: string[];
};

export function GrantToolDrawer({
  agentId,
  tools,
}: {
  agentId: string;
  tools: ToolOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toolId, setToolId] = useState(tools[0]?.tool_id ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tool = tools.find((t) => t.tool_id === toolId);

  useEffect(() => {
    setSelected(new Set());
  }, [toolId]);

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
        Grant tool access
      </button>
      {open ? (
        <div className="drawer-root" role="presentation">
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <aside className="drawer-panel" role="dialog" aria-modal="true">
            <div className="drawer-header">
              <div>
                <h2 className="drawer-title">Grant tool access</h2>
                <p className="drawer-sub">
                  Bind this agent to a tool with an explicit operation allowlist.
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
            <div className="drawer-shell">
              <div className="drawer-form">
                {error ? <div className="error">{error}</div> : null}
                <SelectDropdown
                  label="Tool"
                  name="tool_id"
                  value={toolId}
                  onChange={setToolId}
                  options={tools.map((t) => ({
                    value: t.tool_id,
                    label: `${t.name} (${t.tool_id})`,
                  }))}
                />
                {(tool?.operations ?? []).map((op) => (
                  <label key={op} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selected.has(op)}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(op)) next.delete(op);
                          else next.add(op);
                          return next;
                        });
                      }}
                    />
                    <span className="mono">{op}</span>
                  </label>
                ))}
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
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !toolId || selected.size === 0}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await proxyJson(`agents/${agentId}/tools/${toolId}`, 'PUT', {
                        allowed_operations: [...selected],
                        status: 'ACTIVE',
                      });
                      setOpen(false);
                      router.refresh();
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : 'Grant failed',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Saving…' : 'Create grant'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
