'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import {
  ToolEditDrawer,
  type EditableTool,
} from '@/components/ToolEditDrawer';
import { PortaledCardMenu } from '@/components/PortaledCardMenu';

export function ToolRowMenu({ tool }: { tool: EditableTool }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const status = tool.status.toUpperCase();
  const retired = status === 'RETIRED';

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function run(path: string, method: string = 'POST') {
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    try {
      await proxyJson(path, method);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card-menu" ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          className="icon-btn card-menu-trigger"
          aria-label={`Actions for ${tool.name}`}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} />
        </button>
        <PortaledCardMenu
          open={menuOpen}
          anchorRef={triggerRef}
          menuRef={menuRef}
          id={menuId}
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy || retired}
            onClick={() => {
              setMenuOpen(false);
              setEditOpen(true);
            }}
          >
            Edit
          </button>
          {status === 'ACTIVE' ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() =>
                void run(`tools/${encodeURIComponent(tool.tool_id)}/suspend`)
              }
            >
              Suspend
            </button>
          ) : null}
          {status === 'SUSPENDED' ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() =>
                void run(`tools/${encodeURIComponent(tool.tool_id)}/resume`)
              }
            >
              Resume
            </button>
          ) : null}
          {!retired ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    `Retire tool “${tool.name}”? This cannot be undone.`,
                  )
                ) {
                  return;
                }
                void run(`tools/${encodeURIComponent(tool.tool_id)}/retire`);
              }}
            >
              Retire
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="card-menu-item-danger"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  `Delete tool “${tool.name}”? This permanently removes the tool and its agent grants.`,
                )
              ) {
                return;
              }
              void run(`tools/${encodeURIComponent(tool.tool_id)}`, 'DELETE');
            }}
          >
            Delete
          </button>
        </PortaledCardMenu>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <ToolEditDrawer
        tool={tool}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
