'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeactivateCustomerButton({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  async function toggle() {
    setBusy(true);
    await fetch(`/api/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={busy}
      onClick={toggle}
    >
      {next === 'INACTIVE' ? 'Deactivate' : 'Activate'}
    </button>
  );
}
