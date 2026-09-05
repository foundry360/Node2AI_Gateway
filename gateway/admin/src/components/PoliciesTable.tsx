'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';

const PAGE_SIZE = 25;

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

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [packFilter, statusFilter, q]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="stack-tight">
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
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No policies match"
          description="Adjust pack, status, or search filters."
        />
      ) : (
        <>
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
              {visible.map((p) => {
                const pack = packById.get(p.pack_id);
                const domain = p.domain ?? pack?.domain;
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
                      <div>{domain ? capitalize(domain) : '—'}</div>
                      <div className="muted">{pack?.name ?? p.pack_id}</div>
                    </td>
                    <td>
                      <StatusBadge showLabel status={p.status} />
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
          {hasMore ? (
            <div className="table-load-more">
              <button
                type="button"
                className="btn"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Load More
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
