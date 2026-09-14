'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { proxyJson } from '@/lib/client-api';

export function ToolLifecycleActions({
  toolId,
  status,
}: {
  toolId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const s = status.toUpperCase();

  async function run(path: string) {
    setError(null);
    try {
      await proxyJson(path, 'POST');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <div className="action-row">
      {s === 'ACTIVE' ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void run(`tools/${toolId}/suspend`)}
        >
          Suspend
        </button>
      ) : null}
      {s === 'SUSPENDED' ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void run(`tools/${toolId}/resume`)}
        >
          Resume
        </button>
      ) : null}
      {s !== 'RETIRED' ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (
              window.confirm(`Retire tool ${toolId}? This cannot be undone.`)
            ) {
              void run(`tools/${toolId}/retire`);
            }
          }}
        >
          Retire
        </button>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
