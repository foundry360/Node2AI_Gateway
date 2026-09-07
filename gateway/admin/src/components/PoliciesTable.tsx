'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Gavel,
  HeartPulse,
  Scale,
  Shield,
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDomainLabel } from '@/lib/domain-label';

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

type SortKey =
  | 'name'
  | 'domain'
  | 'pack'
  | 'status'
  | 'version'
  | 'phase'
  | 'interpreter';

type SortDir = 'asc' | 'desc';

const SORT_COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'domain', label: 'Domain' },
  { key: 'pack', label: 'Pack' },
  { key: 'status', label: 'Status' },
  { key: 'version', label: 'Version' },
  { key: 'phase', label: 'Phase' },
  { key: 'interpreter', label: 'Interpreter' },
];

function policyDomainIcon(domain: string | undefined): ReactNode {
  const props = { size: 16, strokeWidth: 1.75, 'aria-hidden': true as const };
  const d = (domain ?? '').toLowerCase();
  if (
    d === 'hipaa' ||
    d === 'healthcare' ||
    d === 'part2' ||
    d === '42_cfr_part_2' ||
    d.includes('part_2') ||
    d.includes('part2')
  ) {
    return <HeartPulse {...props} />;
  }
  if (d === 'enterprise') {
    return <Shield {...props} />;
  }
  if (d === 'financial' || d === 'pci' || d === 'sox') {
    return <Scale {...props} />;
  }
  if (d === 'legal') {
    return <Gavel {...props} />;
  }
  if (d === 'soc2' || d === 'hitrust' || d === 'gdpr') {
    return <Shield {...props} />;
  }
  return <FileText {...props} />;
}

function compareValues(a: string | number, b: string | number, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * mul;
  }
  return String(a).localeCompare(String(b), undefined, {
    sensitivity: 'base',
    numeric: true,
  }) * mul;
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
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const packA = packById.get(a.pack_id);
      const packB = packById.get(b.pack_id);
      const domainA = formatDomainLabel(a.domain ?? packA?.domain);
      const domainB = formatDomainLabel(b.domain ?? packB?.domain);
      const packNameA = packA?.name ?? a.pack_id;
      const packNameB = packB?.name ?? b.pack_id;

      switch (sortKey) {
        case 'name':
          return compareValues(a.name, b.name, sortDir);
        case 'domain':
          return compareValues(domainA, domainB, sortDir);
        case 'pack':
          return compareValues(packNameA, packNameB, sortDir);
        case 'status':
          return compareValues(a.status, b.status, sortDir);
        case 'version':
          return compareValues(a.version, b.version, sortDir);
        case 'phase':
          return compareValues(a.phase, b.phase, sortDir);
        case 'interpreter':
          return compareValues(a.interpreter, b.interpreter, sortDir);
        default:
          return 0;
      }
    });
    return rows;
  }, [filtered, packById, sortKey, sortDir]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [packFilter, statusFilter, q, sortKey, sortDir]);

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'version' ? 'desc' : 'asc');
  }

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
          <option value="active">Active</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="draft">Draft</option>
          <option value="retired">Retired</option>
        </select>
        <input
          placeholder="Search name or id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {sorted.length === 0 ? (
        <EmptyState
          title="No policies match"
          description="Adjust pack, status, or search filters."
        />
      ) : (
        <>
          <table className="policies-table">
            <colgroup>
              <col className="policies-col-name" />
              <col className="policies-col-domain" />
              <col className="policies-col-pack" />
              <col className="policies-col-status" />
              <col className="policies-col-version" />
              <col className="policies-col-phase" />
              <col className="policies-col-interpreter" />
            </colgroup>
            <thead>
              <tr>
                {SORT_COLUMNS.map((col) => {
                  const active = sortKey === col.key;
                  return (
                    <th key={col.key} className={col.className}>
                      <button
                        type="button"
                        className={`table-sort-btn${active ? ' is-active' : ''}`}
                        onClick={() => onSort(col.key)}
                        aria-label={`Sort by ${col.label}`}
                      >
                        <span>{col.label}</span>
                        <span className="table-sort-icon" aria-hidden>
                          {active ? (
                            sortDir === 'asc' ? (
                              <ChevronUp size={14} strokeWidth={2} />
                            ) : (
                              <ChevronDown size={14} strokeWidth={2} />
                            )
                          ) : (
                            <ChevronDown size={14} strokeWidth={2} />
                          )}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const pack = packById.get(p.pack_id);
                const domain = p.domain ?? pack?.domain;
                return (
                  <tr key={p.policy_id}>
                    <td>
                      <div className="table-name-primary">
                        <span className="table-name-icon" aria-hidden>
                          {policyDomainIcon(domain)}
                        </span>
                        <Link
                          href={`/policies/${p.policy_id}`}
                          className="table-link"
                        >
                          {p.name}
                        </Link>
                      </div>
                    </td>
                    <td>{formatDomainLabel(domain)}</td>
                    <td>{pack?.name ?? p.pack_id}</td>
                    <td>
                      <StatusBadge showLabel status={p.status} />
                    </td>
                    <td className="mono">v{p.version}</td>
                    <td>{p.phase}</td>
                    <td className="mono">{p.interpreter}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore ? (
            <div className="table-load-more">
              <button
                type="button"
                className="btn btn-secondary"
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
