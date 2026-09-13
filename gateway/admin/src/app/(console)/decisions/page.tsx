'use client';

import Link from 'next/link';
import { CalendarDays, ChevronDown, Eye, Search, ArrowDownWideNarrow, ArrowUpWideNarrow } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { CalendarPicker } from '@/components/CalendarPicker';
import { proxyJson } from '@/lib/client-api';
import { formatFieldLabel } from '@/lib/field-label';
import { formatDisplayDateTime } from '@/lib/display-datetime';

type EvaluationRow = {
  evaluation_id: string;
  created_at: string;
  decision: string;
  final_decision?: string;
  phase?: string;
  request_id?: string;
  resolution_category?: string;
  contributing_pack_ids: string[];
  policy_ids: string[];
  reason?: string;
  action_summary: string;
  expected_action?: string;
  enforcement_result: string;
  enforcement?: { status: string; verified: boolean; safety_fallback?: boolean };
  requires_review: boolean;
  controls_applied: boolean;
  review_state?: string;
  status: string;
};

type FilterId =
  | 'all'
  | 'review'
  | 'resolved'
  | 'allowed'
  | 'denied'
  | 'conflicts'
  | 'controls';

type GroupedDecision = {
  requestKey: string;
  rows: EvaluationRow[];
  latestAt: number;
};

type DateSectionId =
  | 'today'
  | 'yesterday'
  | 'last_week'
  | 'last_month'
  | `month:${string}`;

type DateSection = {
  id: DateSectionId;
  title: string;
  groups: GroupedDecision[];
};

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All Decisions' },
  { id: 'review', label: 'Requires review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'allowed', label: 'Allowed' },
  { id: 'denied', label: 'Denied' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'controls', label: 'Controls applied' },
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function phaseLabel(phase: string | undefined): string {
  const p = (phase ?? '').toLowerCase();
  if (p === 'input') return 'Input';
  if (p === 'output') return 'Output';
  if (p === 'simulate') return 'Simulate';
  return formatFieldLabel(phase) || 'Decision';
}

/** Clearer machine-decision labels for governed autonomy outcomes. */
function machineDecisionLabel(decision: string | undefined): string {
  const d = String(decision ?? '').toUpperCase();
  if (d === 'ALLOW') return 'Automatically allowed';
  if (d === 'ALLOW_WITH_CONTROLS') return 'Allowed with controls';
  if (d === 'REQUIRE_APPROVAL' || d === 'REVIEW') return 'Pending human approval';
  if (d === 'DENY' || d === 'BLOCK' || d === 'BLOCK_OUTPUT') return 'Denied';
  if (d === 'TRANSFORM' || d === 'TOKENIZE' || d === 'REDACT' || d === 'MASK') {
    return 'Transform required';
  }
  return formatFieldLabel(decision) || '-';
}

function groupByRequest(rows: EvaluationRow[]): GroupedDecision[] {
  const order: string[] = [];
  const map = new Map<string, EvaluationRow[]>();

  for (const row of rows) {
    const key = row.request_id?.trim() || `eval:${row.evaluation_id}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(row);
  }

  return order.map((requestKey) => {
    const groupRows = [...(map.get(requestKey) ?? [])].sort((a, b) => {
      const ta = Date.parse(a.created_at) || 0;
      const tb = Date.parse(b.created_at) || 0;
      if (ta !== tb) return ta - tb;
      const pa = (a.phase ?? '').toLowerCase();
      const pb = (b.phase ?? '').toLowerCase();
      if (pa === 'input' && pb !== 'input') return -1;
      if (pb === 'input' && pa !== 'input') return 1;
      return a.evaluation_id.localeCompare(b.evaluation_id);
    });
    const latestAt = groupRows.reduce((max, row) => {
      const t = Date.parse(row.created_at) || 0;
      return t > max ? t : max;
    }, 0);
    return { requestKey, rows: groupRows, latestAt };
  });
}

function sectionForTimestamp(ts: number, now = new Date()): {
  id: DateSectionId;
  title: string;
  sortKey: number;
} {
  const day = startOfLocalDay(new Date(ts));
  const today = startOfLocalDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  if (day.getTime() >= today.getTime()) {
    return { id: 'today', title: 'Decisions Today', sortKey: 0 };
  }
  if (day.getTime() >= yesterday.getTime()) {
    return { id: 'yesterday', title: 'Decisions Yesterday', sortKey: 1 };
  }
  if (day.getTime() >= lastWeekStart.getTime()) {
    return { id: 'last_week', title: 'Decisions Last Week', sortKey: 2 };
  }
  if (day.getTime() >= lastMonthStart.getTime() && day.getTime() < thisMonthStart.getTime()) {
    return { id: 'last_month', title: 'Decisions Last Month', sortKey: 3 };
  }

  const monthKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}`;
  const monthName = MONTH_NAMES[day.getMonth()] ?? 'Unknown';
  const title =
    day.getFullYear() === today.getFullYear()
      ? `Decisions in ${monthName}`
      : `Decisions in ${monthName} ${day.getFullYear()}`;
  // Older months sort after fixed buckets; newer month numbers first within that range.
  const sortKey = 1000 - (day.getFullYear() * 12 + day.getMonth());
  return { id: `month:${monthKey}`, title, sortKey };
}

function groupByDateSection(
  groups: GroupedDecision[],
  sortDir: 'desc' | 'asc' = 'desc',
): DateSection[] {
  const map = new Map<
    DateSectionId,
    { title: string; sortKey: number; groups: GroupedDecision[] }
  >();

  const sortedGroups = [...groups].sort((a, b) =>
    sortDir === 'desc' ? b.latestAt - a.latestAt : a.latestAt - b.latestAt,
  );

  for (const group of sortedGroups) {
    const meta = sectionForTimestamp(group.latestAt || Date.now());
    const existing = map.get(meta.id);
    if (existing) {
      existing.groups.push(group);
    } else {
      map.set(meta.id, {
        title: meta.title,
        sortKey: meta.sortKey,
        groups: [group],
      });
    }
  }

  const sections = [...map.entries()]
    .sort((a, b) => a[1].sortKey - b[1].sortKey)
    .map(([id, section]) => ({
      id,
      title: section.title,
      groups: section.groups,
    }));

  return sortDir === 'asc' ? [...sections].reverse() : sections;
}

function matchesSearch(group: GroupedDecision, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    group.requestKey,
    ...group.rows.flatMap((r) => [
      r.evaluation_id,
      r.request_id,
      r.decision,
      r.final_decision,
      r.phase,
      r.expected_action,
      r.action_summary,
      r.enforcement_result,
      r.enforcement?.status,
      r.review_state,
      r.reason,
      ...(r.policy_ids ?? []),
      ...(r.contributing_pack_ids ?? []),
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function matchesDate(group: GroupedDecision, dateFilter: string): boolean {
  if (!dateFilter) return true;
  const [y, m, d] = dateFilter.split('-').map(Number);
  if (!y || !m || !d) return true;
  const start = new Date(y, m - 1, d).getTime();
  const end = new Date(y, m - 1, d + 1).getTime();
  return group.rows.some((row) => {
    const t = Date.parse(row.created_at);
    return Number.isFinite(t) && t >= start && t < end;
  });
}

function defaultOpenSections(sections: DateSection[]): Record<string, boolean> {
  const open: Record<string, boolean> = {};
  for (const section of sections) {
    open[section.id] =
      section.id === 'today' ||
      section.id === 'yesterday' ||
      section.id === 'last_week';
  }
  return open;
}

function PhaseStack({
  rows,
  children,
}: {
  rows: EvaluationRow[];
  children: (row: EvaluationRow) => ReactNode;
}) {
  if (rows.length === 1) {
    return <>{children(rows[0]!)}</>;
  }
  return (
    <div className="decision-phase-stack">
      {rows.map((row) => (
        <div key={row.evaluation_id} className="decision-phase-stack-item">
          {children(row)}
        </div>
      ))}
    </div>
  );
}

function DecisionRequestRow({ group }: { group: GroupedDecision }) {
  const linked = group.rows.length > 1;
  const displayRequest = group.requestKey.startsWith('eval:')
    ? '-'
    : group.requestKey;

  return (
    <tr className={linked ? 'decision-group-row' : undefined}>
      <td>
        <div className="decision-request-cell">
          <div className="mono">{displayRequest}</div>
          {linked ? (
            <div className="muted decision-request-meta">
              {group.rows.length} phases
            </div>
          ) : null}
        </div>
      </td>
      <td>
        <PhaseStack rows={group.rows}>
          {(e) => <span className="decision-phase">{phaseLabel(e.phase)}</span>}
        </PhaseStack>
      </td>
      <td>
        <PhaseStack rows={group.rows}>
          {(e) => (
            <StatusBadge
              variant="badge"
              status={e.decision}
              label={machineDecisionLabel(e.decision)}
            />
          )}
        </PhaseStack>
      </td>
      <td>
        <PhaseStack rows={group.rows}>
          {(e) => (
            <StatusBadge
              variant="badge"
              status={e.final_decision ?? e.decision}
            />
          )}
        </PhaseStack>
      </td>
      <td>
        <PhaseStack rows={group.rows}>
          {(e) =>
            e.review_state === 'pending' ? (
              <StatusBadge variant="badge" status="pending" label="Pending" />
            ) : e.review_state === 'resolved' ? (
              <StatusBadge variant="badge" status="approved" label="Resolved" />
            ) : (
              <span>-</span>
            )
          }
        </PhaseStack>
      </td>
      <td>
        <PhaseStack rows={group.rows}>
          {(e) => (
            <span className="decision-expected">
              {formatFieldLabel(e.expected_action ?? e.action_summary)}
            </span>
          )}
        </PhaseStack>
      </td>
      <td>
        <PhaseStack rows={group.rows}>
          {(e) => (
            <StatusBadge
              variant="badge"
              status={
                e.enforcement?.status ?? e.enforcement_result ?? 'UNKNOWN'
              }
            />
          )}
        </PhaseStack>
      </td>
      <td>
        <PhaseStack rows={group.rows}>
          {(e) => (
            <span className="mono">{formatDisplayDateTime(e.created_at)}</span>
          )}
        </PhaseStack>
      </td>
      <td className="table-col-narrow">
        <PhaseStack rows={group.rows}>
          {(e) => (
            <Link
              href={`/evaluations/${e.evaluation_id}`}
              className="table-icon-link"
              aria-label={`View decision ${e.evaluation_id}`}
              title="View decision"
            >
              <Eye size={18} strokeWidth={1.75} aria-hidden />
            </Link>
          )}
        </PhaseStack>
      </td>
    </tr>
  );
}

function DecisionsListView() {
  const [filter, setFilter] = useState<FilterId>('all');
  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [dateFilter, setDateFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        setError(null);
        const res = (await proxyJson(
          `evaluations?limit=100&filter=${filter}`,
          'GET',
        )) as { evaluations?: EvaluationRow[] };
        if (!cancelled) setRows(res.evaluations ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load decisions');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const groups = useMemo(() => groupByRequest(rows), [rows]);

  const visibleGroups = useMemo(
    () =>
      groups.filter(
        (group) => matchesSearch(group, query) && matchesDate(group, dateFilter),
      ),
    [groups, query, dateFilter],
  );

  const sections = useMemo(
    () => groupByDateSection(visibleGroups, sortDir),
    [visibleGroups, sortDir],
  );
  const sectionSignature = useMemo(
    () => sections.map((s) => s.id).join('|'),
    [sections],
  );

  useEffect(() => {
    setOpenSections(defaultOpenSections(sections));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: sections content used only for defaults
  }, [filter, sectionSignature]);

  useEffect(() => {
    if (!query.trim() && !dateFilter) return;
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const section of sections) {
        next[section.id] = true;
      }
      return next;
    });
  }, [query, dateFilter, sections]);

  const countLabel = useMemo(() => {
    const decisionCount = visibleGroups.reduce((n, g) => n + g.rows.length, 0);
    const requestCount = visibleGroups.filter(
      (g) => !g.requestKey.startsWith('eval:'),
    ).length;
    const decisionWord = decisionCount === 1 ? 'decision' : 'decisions';
    if (requestCount > 0 && requestCount !== decisionCount) {
      return `${decisionCount} ${decisionWord} · ${requestCount} request${requestCount === 1 ? '' : 's'}`;
    }
    return `${decisionCount} ${decisionWord}`;
  }, [visibleGroups]);

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const hasActiveTools = Boolean(query.trim() || dateFilter || sortDir === 'asc');
  const showEmpty = rows.length === 0 && !error;
  const showNoMatches = rows.length > 0 && sections.length === 0;

  return (
    <div>
      <PageHeader
        title="Decisions"
        lede="Exception queue and decision history."
      />

      {error ? <div className="error">{error}</div> : null}

      <div className="console-tabs-bar decisions-tabs-bar">
        <div className="tabs" role="tablist" aria-label="Decision filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`tab${filter === f.id ? ' tab-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="decisions-toolbar">
          <span className="muted decisions-count">{countLabel}</span>
          <div className="decisions-toolbar-actions">
            {searchOpen ? (
              <input
                ref={searchInputRef}
                type="search"
                className="decisions-tool-input"
                placeholder="Search decisions"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (query) setQuery('');
                    else setSearchOpen(false);
                  }
                }}
                aria-label="Search decisions"
              />
            ) : null}
            <button
              type="button"
              className={`decisions-tool-btn${searchOpen || query ? ' is-active' : ''}`}
              aria-label="Search decisions"
              aria-pressed={searchOpen || Boolean(query)}
              title="Search"
              onClick={() => {
                setSearchOpen((open) => {
                  if (open && !query) return false;
                  return true;
                });
                setDateOpen(false);
              }}
            >
              <Search size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className={`decisions-tool-btn${sortDir === 'asc' ? ' is-active' : ''}`}
              aria-label={
                sortDir === 'desc'
                  ? 'Sort oldest to newest'
                  : 'Sort newest to oldest'
              }
              title={
                sortDir === 'desc'
                  ? 'Newest first — click for oldest first'
                  : 'Oldest first — click for newest first'
              }
              onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            >
              {sortDir === 'desc' ? (
                <ArrowDownWideNarrow size={16} strokeWidth={1.75} aria-hidden />
              ) : (
                <ArrowUpWideNarrow size={16} strokeWidth={1.75} aria-hidden />
              )}
            </button>
            <div className="decisions-date-anchor">
              <button
                ref={dateButtonRef}
                type="button"
                className={`decisions-tool-btn${dateOpen || dateFilter ? ' is-active' : ''}`}
                aria-label="Filter by date"
                aria-haspopup="dialog"
                aria-expanded={dateOpen}
                title={dateFilter ? `Date filter: ${dateFilter}` : 'Filter by date'}
                onClick={() => {
                  setDateOpen((open) => !open);
                  setSearchOpen(false);
                }}
              >
                <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
              </button>
              <CalendarPicker
                open={dateOpen}
                value={dateFilter}
                onChange={setDateFilter}
                onClose={() => setDateOpen(false)}
                anchorRef={dateButtonRef}
              />
            </div>
          </div>
        </div>
      </div>

      {showEmpty ? (
        <EmptyState
          title={
            filter === 'all'
              ? 'No decisions yet'
              : 'No decisions match this filter'
          }
          description="Enigma creates a decision for each request sent through the Gateway."
        />
      ) : showNoMatches ? (
        <EmptyState
          title="No decisions match"
          description={
            hasActiveTools
              ? 'Try clearing search or date filters.'
              : 'No decisions match this filter.'
          }
        />
      ) : rows.length > 0 ? (
        <table className="decisions-inbox-table" aria-busy={pending || undefined}>
          <thead>
            <tr>
              <th>Request</th>
              <th>Phase</th>
              <th>Machine</th>
              <th>Final</th>
              <th>Review</th>
              <th>Expected action</th>
              <th>Enforcement</th>
              <th>Date</th>
              <th className="table-col-narrow">
                <span className="sr-only">View</span>
              </th>
            </tr>
          </thead>
          {sections.map((section) => {
            const open = openSections[section.id] !== false;
            const requestCount = section.groups.length;
            return (
              <tbody key={section.id}>
                <tr className="decision-inbox-heading-row">
                  <td colSpan={9}>
                    <button
                      type="button"
                      className="decision-inbox-heading"
                      aria-expanded={open}
                      onClick={() => toggleSection(section.id)}
                    >
                      <ChevronDown
                        className={`decision-inbox-chevron${open ? ' is-open' : ''}`}
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="decision-inbox-heading-title">
                        {section.title}
                      </span>
                      <span className="muted decision-inbox-heading-count">
                        {requestCount}{' '}
                        {requestCount === 1 ? 'request' : 'requests'}
                      </span>
                    </button>
                  </td>
                </tr>
                {open
                  ? section.groups.map((group) => (
                      <DecisionRequestRow key={group.requestKey} group={group} />
                    ))
                  : null}
              </tbody>
            );
          })}
        </table>
      ) : null}
    </div>
  );
}

export default function DecisionsPage() {
  return <DecisionsListView />;
}
