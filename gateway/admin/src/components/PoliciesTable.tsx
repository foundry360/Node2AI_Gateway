'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';

type Pack = {
  pack_id: string;
  name: string;
  domain: string;
  status: string;
};

type PolicyRow = {
  policy_id: string;
  name: string;
  status: string;
  version: number;
  pack_id: string;
  phase: string;
  interpreter: string;
  description?: string;
  owner?: string;
  priority?: number;
  domain?: string;
};

export function PoliciesTable({
  packs,
  policies,
}: {
  packs: Pack[];
  policies: PolicyRow[];
}) {
  const [packFilter, setPackFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');

  const packById = useMemo(
    () => new Map(packs.map((p) => [p.pack_id, p])),
    [packs],
  );

  const filtered = useMemo(() => {
    return policies.filter((p) => {
      if (packFilter !== 'all' && p.pack_id !== packFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${p.name} ${p.policy_id} ${p.interpreter} ${p.domain ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [policies, packFilter, statusFilter, q]);

  return (
    <div className="stack-tight">
      <div className="pack-chips">
        {packs.map((p) => (
          <button
            key={p.pack_id}
            type="button"
            className="chip"
            onClick={() =>
              setPackFilter((cur) => (cur === p.pack_id ? 'all' : p.pack_id))
            }
            style={
              packFilter === p.pack_id
                ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                : undefined
            }
          >
            {p.name}
            <StatusBadge status={p.status} />
          </button>
        ))}
      </div>
      <div className="toolbar">
        <select value={packFilter} onChange={(e) => setPackFilter(e.target.value)}>
          <option value="all">All packs</option>
          {packs.map((p) => (
            <option key={p.pack_id} value={p.pack_id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">active</option>
          <option value="approved">approved</option>
          <option value="suspended">suspended</option>
          <option value="draft">draft</option>
          <option value="retired">retired</option>
        </select>
        <input
          placeholder="Search name or id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="muted">
          {filtered.length} of {policies.length}
        </span>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No policies match"
          description="Adjust pack, status, or search filters."
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain / Pack</th>
              <th>Status</th>
              <th>Version</th>
              <th>Phase</th>
              <th>Interpreter</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const pack = packById.get(p.pack_id);
              return (
                <tr key={p.policy_id}>
                  <td>
                    <Link
                      href={`/policies/${p.policy_id}`}
                      className="table-link"
                    >
                      {p.name}
                    </Link>
                    <div className="muted mono">{p.policy_id}</div>
                  </td>
                  <td>
                    <div>{p.domain ?? pack?.domain ?? '—'}</div>
                    <div className="muted">{pack?.name ?? p.pack_id}</div>
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="mono">v{p.version}</td>
                  <td>{p.phase}</td>
                  <td className="mono">{p.interpreter}</td>
                  <td className="mono">{p.priority ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
