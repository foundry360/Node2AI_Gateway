'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredMenuStyle } from '@/components/useAnchoredMenuStyle';

export type MultiSelectOption = {
  value: string;
  label?: string;
};

function selectedDisplay(options: MultiSelectOption[], selected: string[]) {
  if (selected.length === 0) return null;
  return selected
    .map((v) => {
      const opt = options.find((o) => o.value === v);
      return opt?.label ?? v;
    })
    .join(', ');
}

/** Closed multi-select dropdown matching SelectDropdown styling. */
export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  open,
  onOpenChange,
  placeholder = 'Select…',
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const display = selectedDisplay(options, selected);
  const menuStyle = useAnchoredMenuStyle(open, triggerRef, menuRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      onOpenChange(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, onOpenChange]);

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            className="ui-dropdown-menu ui-dropdown-menu-portal"
            role="listbox"
            id={listId}
            aria-multiselectable
            style={menuStyle}
          >
            {options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={
                    isSelected
                      ? 'ui-dropdown-option is-selected'
                      : 'ui-dropdown-option'
                  }
                  onClick={() => {
                    onChange(
                      isSelected
                        ? selected.filter((v) => v !== opt.value)
                        : [...selected, opt.value],
                    );
                  }}
                >
                  {opt.label ?? opt.value}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="ui-dropdown-field" ref={rootRef}>
      <span className="ui-dropdown-label">{label}</span>
      <div className="ui-dropdown">
        <button
          ref={triggerRef}
          type="button"
          className="ui-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          onClick={() => onOpenChange(!open)}
        >
          <span
            className={display ? 'ui-dropdown-value' : 'ui-dropdown-value is-placeholder'}
          >
            {display ?? placeholder}
          </span>
          <span className="ui-dropdown-chevron" aria-hidden>
            ▾
          </span>
        </button>
        {menu}
      </div>
    </div>
  );
}
