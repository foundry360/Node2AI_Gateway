'use client';

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

const MENU_MAX_HEIGHT = 360;
const GAP = 4;
const VIEWPORT_PAD = 8;

export type AnchoredMenuAlign = 'start' | 'end' | 'auto';

/**
 * Fixed-position styles for a menu anchored to a trigger, so options are not
 * clipped by overflow:auto/hidden ancestors (drawers, page fill, table scroll).
 */
export function useAnchoredMenuStyle(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  opts?: {
    matchTriggerWidth?: boolean;
    maxWidthPx?: number;
    /** Horizontal alignment relative to the trigger. */
    align?: AnchoredMenuAlign;
  },
): CSSProperties {
  const matchTriggerWidth = opts?.matchTriggerWidth ?? true;
  const maxWidthPx = opts?.maxWidthPx;
  const align = opts?.align ?? 'auto';
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_PAD;
      const spaceAbove = rect.top - GAP - VIEWPORT_PAD;
      const maxHeight = Math.max(
        140,
        Math.min(MENU_MAX_HEIGHT, Math.max(spaceBelow, spaceAbove)),
      );
      const openUp =
        spaceBelow < Math.min(200, maxHeight) && spaceAbove > spaceBelow;

      const measuredWidth = menuRef.current?.offsetWidth ?? rect.width;
      const widthCap =
        maxWidthPx ?? Math.min(360, window.innerWidth - VIEWPORT_PAD * 2);
      const menuWidth = matchTriggerWidth
        ? rect.width
        : Math.min(Math.max(measuredWidth, rect.width), widthCap);

      let resolvedAlign = align;
      if (align === 'auto') {
        resolvedAlign =
          rect.left + rect.width / 2 > window.innerWidth / 2 ? 'end' : 'start';
      }

      let left =
        resolvedAlign === 'end' ? rect.right - menuWidth : rect.left;
      left = Math.min(
        left,
        window.innerWidth - Math.min(menuWidth, widthCap) - VIEWPORT_PAD,
      );
      left = Math.max(VIEWPORT_PAD, left);

      const next: CSSProperties = {
        position: 'fixed',
        left,
        minWidth: rect.width,
        maxHeight,
        zIndex: 80,
        top: openUp ? undefined : rect.bottom + GAP,
        bottom: openUp ? window.innerHeight - rect.top + GAP : undefined,
      };
      if (matchTriggerWidth) {
        next.width = rect.width;
      } else {
        next.width = 'max-content';
        next.maxWidth = widthCap;
      }
      setStyle(next);
    };

    update();
    // Second pass after paint so max-content width is measurable for end-align.
    const raf = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, menuRef, matchTriggerWidth, maxWidthPx, align]);

  return style;
}
