'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function SecretInput({
  name,
  placeholder,
  defaultValue,
  defaultVisible = true,
}: {
  name: string;
  placeholder?: string;
  defaultValue?: string;
  /** When true, the value is shown as plain text. */
  defaultVisible?: boolean;
}) {
  const [visible, setVisible] = useState(defaultVisible);

  return (
    <div className="secret-input">
      <input
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mono"
      />
      <button
        type="button"
        className="secret-input-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide API key' : 'Show API key'}
        title={visible ? 'Hide' : 'Show'}
      >
        {visible ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
      </button>
    </div>
  );
}
