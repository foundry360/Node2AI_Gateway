'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SelectDropdown } from '@/components/SelectDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDomainLabel } from '@/lib/domain-label';

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

type SortKey = 'name' | 'pack' | 'status' | 'version' | 'phase' | 'interpreter';
type SortDir = 'asc' | 'desc';

type DomainSection = {
  key: string;
  label: string;
  domain: string | undefined;
  policies: PolicyRow[];
};

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'pack', label: 'Pack' },
  { key: 'status', label: 'Status' },
  { key: 'version', label: 'Policy Version' },
  { key: 'phase', label: 'Phase' },
  { key: 'interpreter', label: 'Interpreter' },
];

function compareValues(a: string | number, b: string | number, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * mul;
  }
  return (
    String(a).localeCompare(String(b), undefined, {
      sensitivity: 'base',
      numeric: true,
    }) * mul
  );
}

function resolveDomain(
  policy: PolicyRow,
  packById: Map<string, Pack>,
): string | undefined {
  return policy.domain ?? packById.get(policy.pack_id)?.domain;
}

function groupByDomain(
  policies: PolicyRow[],
  packById: Map<string, Pack>,
): DomainSection[] {
  const order: string[] = [];
  const map = new Map<string, DomainSection>();

  for (const policy of policies) {
    const domain = resolveDomain(policy, packById);
    const key = (domain ?? '').trim().toLowerCase() || 'uncategorized';
    const existing = map.get(key);
    if (existing) {
      existing.policies.push(policy);
      continue;
    }
    order.push(key);
    map.set(key, {
      key,
      domain,
      label: domain ? formatDomainLabel(domain) : 'Uncategorized',
      policies: [policy],
    });
  }

  return order
    .map((key) => map.get(key)!)
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    );
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
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

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
        const domain = resolveDomain(p, packById);
        const hay =
          `${p.name} ${p.policy_id} ${p.interpreter} ${domain ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [policies, packFilter, statusFilter, q, packById]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const packA = packById.get(a.pack_id);
      const packB = packById.get(b.pack_id);
      const packNameA = packA?.name ?? a.pack_id;
      const packNameB = packB?.name ?? b.pack_id;

      switch (sortKey) {
        case 'name':
          return compareValues(a.name, b.name, sortDir);
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

  const sections = useMemo(
    () => groupByDomain(sorted, packById),
    [sorted, packById],
  );

  const sectionSignature = useMemo(
    () => sections.map((s) => s.key).join('|'),
    [sections],
  );

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const section of sections) {
      next[section.key] = true;
    }
    setOpenSections(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults when filter/section set changes
  }, [packFilter, statusFilter, q, sectionSignature]);

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'version' ? 'desc' : 'asc');
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="page-fill-body">
      <PageHeader
        title="Policies"
        lede="Define and manage the policies that govern AI actions."
        actions={
          <>
            <SelectDropdown
              compact
              ariaLabel="Filter packs"
              value={packFilter}
              onChange={setPackFilter}
              options={[
                { value: 'all', label: 'All packs' },
                ...packs.map((p) => ({ value: p.pack_id, label: p.name })),
              ]}
            />
            <SelectDropdown
              compact
              ariaLabel="Filter status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'approved', label: 'Approved' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'draft', label: 'Draft' },
                { value: 'retired', label: 'Retired' },
              ]}
            />
            <input
              className="control-input"
              placeholder="Search name or id"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </>
        }
      />
      {sorted.length === 0 ? (
        <EmptyState
          title="No policies match"
          description="Adjust pack, status, or search filters."
        />
      ) : (
        <div className="table-scroll">
          <table className="policies-table policies-inbox-table">
            <colgroup>
              <col className="policies-col-name" />
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
                    <th key={col.key}>
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
            {sections.map((section) => {
              const open = openSections[section.key] !== false;
              const count = section.policies.length;
              return (
                <tbody key={section.key}>
                  <tr className="decision-inbox-heading-row">
                    <td colSpan={6}>
                      <button
                        type="button"
                        className="decision-inbox-heading policies-domain-heading"
                        aria-expanded={open}
                        onClick={() => toggleSection(section.key)}
                      >
                        <ChevronDown
                          className={`decision-inbox-chevron${open ? ' is-open' : ''}`}
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="decision-inbox-heading-title">
                          {section.label}
                        </span>
                        <span className="muted decision-inbox-heading-count">
                          {count} {count === 1 ? 'policy' : 'policies'}
                        </span>
                      </button>
                    </td>
                  </tr>
                  {open
                    ? section.policies.map((p) => {
                        const pack = packById.get(p.pack_id);
                        return (
                          <tr key={p.policy_id}>
                            <td>
                              <div className="policies-name-rail">
                                <span className="policies-name-rail-gutter" aria-hidden />
                                <Link
                                  href={`/policies/${p.policy_id}`}
                                  className="table-link"
                                >
                                  {p.name}
                                </Link>
                              </div>
                            </td>
                            <td>{pack?.name ?? p.pack_id}</td>
                            <td>
                              <StatusBadge showLabel status={p.status} />
                            </td>
                            <td className="mono">v{p.version}</td>
                            <td>{p.phase}</td>
                            <td className="mono">{p.interpreter}</td>
                          </tr>
                        );
                      })
                    : null}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
