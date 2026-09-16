'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { ACTION_OPERATIONS } from '@/lib/action-catalog';
import { SelectDropdown } from '@/components/SelectDropdown';

type ToolOption = {
  tool_id: string;
  name: string;
  operations: string[];
};

type ExistingGrant = {
  tool_id: string;
  allowed_operations: string[];
  status: string;
};

function operationLabel(op: string): string {
  return ACTION_OPERATIONS.find((o) => o.id === op)?.label ?? op;
}

export function GrantToolDrawer({
  agentId,
  tools,
  existingGrants = [],
}: {
  agentId: string;
  tools: ToolOption[];
  existingGrants?: ExistingGrant[];
}) {
  const router = useRouter();
  const grantsByTool = useMemo(() => {
    const map = new Map<string, ExistingGrant>();
    for (const g of existingGrants) {
      if (g.status === 'ACTIVE') map.set(g.tool_id, g);
    }
    return map;
  }, [existingGrants]);

  const defaultToolId =
    tools.find((t) => !grantsByTool.has(t.tool_id))?.tool_id ??
    tools[0]?.tool_id ??
    '';

  const [open, setOpen] = useState(false);
  const [toolId, setToolId] = useState(defaultToolId);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const grant = grantsByTool.get(defaultToolId);
    return new Set(grant?.allowed_operations ?? []);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tool = tools.find((t) => t.tool_id === toolId);
  const operations = tool?.operations ?? [];
  const existing = grantsByTool.get(toolId);
  const isUpdate = Boolean(existing);

  useEffect(() => {
    const grant = grantsByTool.get(toolId);
    setSelected(new Set(grant?.allowed_operations ?? []));
  }, [toolId, grantsByTool]);

  useEffect(() => {
    if (!open) return;
    const preferred =
      tools.find((t) => !grantsByTool.has(t.tool_id))?.tool_id ??
      tools[0]?.tool_id ??
      '';
    setToolId(preferred);
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, tools, grantsByTool]);

  function toggle(op: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op);
      else next.add(op);
      return next;
    });
  }

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
                <h2 className="drawer-title">
                  {isUpdate ? 'Update tool access' : 'Grant tool access'}
                </h2>
                <p className="drawer-sub">
                  {isUpdate
                    ? 'This tool is already granted. Adjust the operation allowlist and save.'
                    : 'Bind this agent to a tool with an explicit operation allowlist.'}
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
                    label: grantsByTool.has(t.tool_id)
                      ? `${t.name} (granted)`
                      : t.name,
                  }))}
                />
                <div className="drawer-form-divider" role="separator" />
                <div className="grant-ops-field">
                  <span className="grant-ops-field-label">Operations</span>
                  {operations.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>
                      {toolId
                        ? 'This tool has no declared operations.'
                        : 'Select a tool to choose operations.'}
                    </p>
                  ) : (
                    <div className="grant-op-list">
                      {operations.map((op) => {
                        const on = selected.has(op);
                        return (
                          <button
                            key={op}
                            type="button"
                            role="switch"
                            aria-checked={on}
                            className={`grant-op-toggle${on ? ' is-on' : ''}`}
                            onClick={() => toggle(op)}
                          >
                            <span className="grant-op-label">
                              {operationLabel(op)}
                            </span>
                            <span className="grant-op-switch" aria-hidden>
                              <span className="grant-op-knob" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                      await proxyJson(
                        `agents/${agentId}/tools/${toolId}`,
                        'PUT',
                        {
                          allowed_operations: [...selected],
                          status: 'ACTIVE',
                        },
                      );
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
                  {busy
                    ? 'Saving…'
                    : isUpdate
                      ? 'Update Access'
                      : 'Grant Access'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
