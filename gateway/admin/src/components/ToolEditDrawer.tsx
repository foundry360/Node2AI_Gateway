'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { ACTION_OPERATION_OPTIONS } from '@/lib/action-catalog';

export type EditableTool = {
  tool_id: string;
  name: string;
  status: string;
  operations: string[];
};

export function ToolEditDrawer({
  tool,
  open,
  onOpenChange,
}: {
  tool: EditableTool;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(tool.name);
  const [selectedOperations, setSelectedOperations] = useState<string[]>(
    tool.operations,
  );
  const [operationsMenuOpen, setOperationsMenuOpen] = useState(false);
  const [operationOptions, setOperationOptions] = useState<
    Array<{ value: string; label: string }>
  >([...ACTION_OPERATION_OPTIONS]);

  useEffect(() => {
    if (!open) return;
    setName(tool.name);
    setSelectedOperations(tool.operations);
    setError(null);
    setOperationsMenuOpen(false);
  }, [open, tool]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (operationsMenuOpen) {
          setOperationsMenuOpen(false);
          return;
        }
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onOpenChange, operationsMenuOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const data = (await proxyJson('action-catalog', 'GET')) as {
          operations?: Array<{ id: string; label: string }>;
        };
        const ops = (data.operations ?? []).map((o) => ({
          value: o.id,
          label: o.label,
        }));
        if (!cancelled && ops.length > 0) setOperationOptions(ops);
      } catch {
        if (!cancelled) setOperationOptions(ACTION_OPERATION_OPTIONS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
        aria-labelledby="edit-tool-title"
      >
        <div className="drawer-header">
          <div>
            <h2 id="edit-tool-title" className="drawer-title">
              Edit tool
            </h2>
            <p className="drawer-sub mono">{tool.tool_id}</p>
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
            if (selectedOperations.length === 0) {
              setError('Select at least one catalog operation.');
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await proxyJson(
                `tools/${encodeURIComponent(tool.tool_id)}`,
                'PATCH',
                {
                  name,
                  operations: selectedOperations,
                },
              );
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
              Tool ID
              <input value={tool.tool_id} disabled readOnly />
            </label>
            <label>
              Name
              <input
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <MultiSelectDropdown
              label="Operations"
              placeholder="Select catalog operations…"
              options={operationOptions}
              selected={selectedOperations}
              open={operationsMenuOpen}
              onOpenChange={setOperationsMenuOpen}
              onChange={setSelectedOperations}
            />
            <p className="muted">
              Use the platform Action catalog. Field/target detail belongs in
              request attributes, not extra operations.
            </p>
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
