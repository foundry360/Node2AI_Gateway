'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type SelectOption = {
  value: string;
  label?: string;
};

function optionText(opt: SelectOption) {
  return opt.label ?? opt.value;
}

/** Single-select dropdown matching MultiSelectDropdown styling. */
export function SelectDropdown({
  label,
  options,
  value,
  defaultValue,
  onChange,
  name,
  placeholder = 'Select…',
  ariaLabel,
  className,
  compact,
}: {
  label?: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** Narrower toolbar/filter layout without a visible field label stack. */
  compact?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(
    () => value ?? defaultValue ?? options[0]?.value ?? '',
  );

  const selected = value !== undefined ? value : internal;

  useEffect(() => {
    if (value !== undefined) setInternal(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const selectedOption = options.find((o) => o.value === selected);
  const display = selectedOption
    ? optionText(selectedOption)
    : selected
      ? selected
      : placeholder;

  function choose(next: string) {
    if (value === undefined) setInternal(next);
    onChange?.(next);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={[
        'ui-dropdown-field',
        compact ? 'ui-dropdown-field-compact' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label ? <span className="ui-dropdown-label">{label}</span> : null}
      {name ? <input type="hidden" name={name} value={selected} /> : null}
      <div className="ui-dropdown">
        <button
          type="button"
          className="ui-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel ?? label}
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={
              selectedOption || selected
                ? 'ui-dropdown-value'
                : 'ui-dropdown-value is-placeholder'
            }
          >
            {display}
          </span>
          <span className="ui-dropdown-chevron" aria-hidden>
            ▾
          </span>
        </button>
        {open ? (
          <div className="ui-dropdown-menu" role="listbox" id={listId}>
            {options.map((opt) => {
              const isSelected = opt.value === selected;
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
                  onClick={() => choose(opt.value)}
                >
                  {optionText(opt)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
