'use client';

import { useEffect, useId, useRef } from 'react';

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
  const display = selectedDisplay(options, selected);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, onOpenChange]);

  return (
    <div className="ui-dropdown-field" ref={rootRef}>
      <span className="ui-dropdown-label">{label}</span>
      <div className="ui-dropdown">
        <button
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
        {open ? (
          <div
            className="ui-dropdown-menu"
            role="listbox"
            id={listId}
            aria-multiselectable
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
