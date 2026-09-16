'use client';

import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  useAnchoredMenuStyle,
  type AnchoredMenuAlign,
} from '@/components/useAnchoredMenuStyle';

/** Action/overflow menu portaled to body so it is not clipped by cards/tables. */
export function PortaledCardMenu({
  open,
  anchorRef,
  menuRef: menuRefProp,
  className = 'card-menu-dropdown',
  role = 'menu',
  id,
  align = 'end',
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** Optional ref for outside-click checks in the parent. */
  menuRef?: MutableRefObject<HTMLDivElement | null>;
  className?: string;
  role?: string;
  id?: string;
  align?: AnchoredMenuAlign;
  children: ReactNode;
}) {
  const internalMenuRef = useRef<HTMLDivElement | null>(null);
  const menuRef = menuRefProp ?? internalMenuRef;
  const [mounted, setMounted] = useState(false);
  const style = useAnchoredMenuStyle(open, anchorRef, menuRef, {
    matchTriggerWidth: false,
    maxWidthPx: 240,
    align,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={(node) => {
        menuRef.current = node;
      }}
      className={`${className} card-menu-dropdown-portal`}
      role={role}
      id={id}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}
