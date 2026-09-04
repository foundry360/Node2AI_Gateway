'use client';

import { useState, type ReactNode } from 'react';

export function CollapsiblePanel({
  label,
  children,
  defaultOpen = false,
  primary = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible">
      <button
        type="button"
        className={open || !primary ? 'btn btn-secondary' : 'btn'}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide' : label}
      </button>
      {open ? <div className="collapsible-body panel">{children}</div> : null}
    </div>
  );
}
