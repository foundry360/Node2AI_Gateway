'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import {
  ACTION_OPERATION_OPTIONS,
} from '@/lib/action-catalog';

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
  const [selectedOperations, setSelectedOperations] = useState<string[]>([
    'write',
    'field_update',
  ]);
  const [operationsMenuOpen, setOperationsMenuOpen] = useState(false);
  const [operationOptions, setOperationOptions] = useState<
    Array<{ value: string; label: string }>
  >([...ACTION_OPERATION_OPTIONS]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (operationsMenuOpen) {
          setOperationsMenuOpen(false);
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, operationsMenuOpen]);

  useEffect(() => {
    if (!open) {
      setOperationsMenuOpen(false);
      setSelectedOperations(['write', 'field_update']);
      setError(null);
      return;
    }
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
                  Declare which catalog operations this tool supports. Grants may
                  allow a subset.
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
                if (selectedOperations.length === 0) {
                  setError('Select at least one catalog operation.');
                  return;
                }
                setBusy(true);
                setError(null);
                try {
                  await proxyJson('tools', 'POST', {
                    tool_id: fd.get('tool_id'),
                    name: fd.get('name'),
                    organization_id: fd.get('organization_id') || organizationId,
                    operations: selectedOperations,
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
