'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function ReleasesFilters({ status, q }: { status: string; q: string }) {
  const router = useRouter();
  const [localStatus, setLocalStatus] = useState(status);
  const [localQ, setLocalQ] = useState(q);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (localStatus) params.set('status', localStatus);
    if (localQ.trim()) params.set('q', localQ.trim());
    const qs = params.toString();
    router.push(qs ? `/releases?${qs}` : '/releases');
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
      <label className="field">
        Status
        <select
          value={localStatus}
          onChange={(e) => setLocalStatus(e.target.value)}
        >
          <option value="">All</option>
          <option value="DRAFT">DRAFT</option>
          <option value="APPROVED">APPROVED</option>
          <option value="DEPRECATED">DEPRECATED</option>
        </select>
      </label>
      <label className="field">
        Search
        <input
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
          placeholder="Version or notes"
        />
      </label>
      <button type="submit" className="btn btn-secondary">
        Filter
      </button>
    </form>
  );
}
