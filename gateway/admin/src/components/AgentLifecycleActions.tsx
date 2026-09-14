'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { proxyJson } from '@/lib/client-api';

export function AgentLifecycleActions({
  agentId,
  status,
}: {
  agentId: string;
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
          onClick={() => void run(`agents/${agentId}/suspend`)}
        >
          Suspend
        </button>
      ) : null}
      {s === 'SUSPENDED' ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void run(`agents/${agentId}/resume`)}
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
              window.confirm(
                `Retire agent ${agentId}? This cannot be undone.`,
              )
            ) {
              void run(`agents/${agentId}/retire`);
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
